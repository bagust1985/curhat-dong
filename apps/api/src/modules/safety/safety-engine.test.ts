import { Test } from '@nestjs/testing';
import { config } from 'dotenv';
import { createPrismaClient, type PrismaClient } from '@curhat/database';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppConfigService } from '../../common/app-config.service.js';
import { SafetyThresholdsService } from './safety-thresholds.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import { ContentAnalyzerService } from './content-analyzer.service.js';
import { LocalRulesService } from './local-rules.service.js';
import { ReanalysisService } from './reanalysis.service.js';
import {
  ClassifierUnavailableError,
  SAFETY_CLASSIFIER,
  type ClassificationResult,
  type RiskScores,
  type SafetyClassifier,
} from './safety-classifier.port.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { SessionService } from '../auth/session.service.js';
import { ENV } from '../../config/env.config.js';

config({ path: join(process.cwd(), '../../.env') });

const databaseUrl = process.env['DATABASE_URL'];
const describeDb = databaseUrl ? describe : describe.skip;

/** Classifier that answers with whatever scores the test sets. */
class ScriptedClassifier implements SafetyClassifier {
  scores: RiskScores = {};
  available = true;
  calls = 0;

  classify(): Promise<ClassificationResult> {
    this.calls += 1;

    if (!this.available) {
      return Promise.reject(new ClassifierUnavailableError('timeout'));
    }

    return Promise.resolve({
      riskScores: this.scores,
      provider: 'local',
      model: 'scripted-test',
      promptVersion: 'test-v1',
    });
  }
}

describeDb('safety engine (E07)', () => {
  let prisma: PrismaClient;
  let analyzer: ContentAnalyzerService;
  let reanalysis: ReanalysisService;
  let classifier: ScriptedClassifier;

  const createdUserIds: string[] = [];

  async function makePost(body: string, status: 'published' | 'held' = 'published') {
    const user = await prisma.user.create({ data: {} });
    createdUserIds.push(user.id);

    const category = await prisma.postCategory.findFirstOrThrow();

    const post = await prisma.curhatPost.create({
      data: {
        authorId: user.id,
        categoryId: category.id,
        body,
        mood: 'kosong',
        intent: 'cuma_didengar',
        status,
        safetyLevel: 'L1',
        needsReanalysis: true,
      },
    });

    return { userId: user.id, postId: post.id };
  }

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl as string);
    classifier = new ScriptedClassifier();

    const moduleRef = await Test.createTestingModule({
      providers: [
        // E14-T12: the safety engine reads its thresholds from config now.
        SafetyThresholdsService,
        ContentAnalyzerService,
        LocalRulesService,
        ReanalysisService,
        ModerationService,
        AppConfigService,
        { provide: PRISMA, useValue: prisma },
        { provide: SAFETY_CLASSIFIER, useValue: classifier },
        { provide: ENV, useValue: { TELEGRAM_BOT_TOKEN: undefined, TELEGRAM_CHAT_ID: undefined } },
        { provide: SessionService, useValue: { revokeAllForUser: () => Promise.resolve(0) } },
      ],
    }).compile();

    analyzer = moduleRef.get(ContentAnalyzerService);
    reanalysis = moduleRef.get(ReanalysisService);
  }, 60_000);

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  describe('with a working classifier', () => {
    it('publishes a clean post at L0', async () => {
      classifier.available = true;
      classifier.scores = { toxicity: 0.02 };

      const { userId, postId } = await makePost('Hari ini lumayan menyenangkan.');
      const outcome = await analyzer.analyze({
        targetType: 'post',
        targetId: postId,
        userId,
        text: 'Hari ini lumayan menyenangkan.',
      });

      expect(outcome.level).toBe('L0');
      expect(outcome.status).toBe('published');
      expect(outcome.usedFallback).toBe(false);
      expect(outcome.needsReanalysis).toBe(false);
    });

    it('records the classification with its prompt version', async () => {
      // Without knowing which prompt produced a verdict, threshold calibration
      // is guesswork and rollback is blind (TECH-SPEC §4.4).
      classifier.available = true;
      classifier.scores = { toxicity: 0.6 };

      const { userId, postId } = await makePost('agak kasar sedikit');
      await analyzer.analyze({
        targetType: 'post',
        targetId: postId,
        userId,
        text: 'agak kasar sedikit',
      });

      const stored = await prisma.aiClassification.findFirstOrThrow({
        where: { targetType: 'post', targetId: postId },
      });

      expect(stored.promptVersion).toBe('test-v1');
      expect(stored.safetyLevel).toBe('L1');
    });

    it('holds an L2 post for review', async () => {
      classifier.available = true;
      classifier.scores = { harassment: 0.8 };

      const { userId, postId } = await makePost('konten bermasalah');
      const outcome = await analyzer.analyze({
        targetType: 'post',
        targetId: postId,
        userId,
        text: 'konten bermasalah',
      });

      expect(outcome.level).toBe('L2');
      expect(outcome.status).toBe('held');
      expect(outcome.queue).toBe('high');
    });

    it('lets local rules override a classifier that missed an explicit signal', async () => {
      // The classifier is not the last word. A model that scores an explicit
      // statement of intent as harmless must not be able to publish it.
      classifier.available = true;
      classifier.scores = { toxicity: 0.01 };

      const text = 'Aku mau bunuh diri malam ini.';
      const { userId, postId } = await makePost(text);

      const outcome = await analyzer.analyze({
        targetType: 'post',
        targetId: postId,
        userId,
        text,
      });

      expect(outcome.level).toBe('L3');
      expect(outcome.showIntervention).toBe(true);
    });

    it('never punishes on L3', async () => {
      classifier.available = true;
      classifier.scores = { self_harm: 0.9 };

      const { userId, postId } = await makePost('berat sekali rasanya');
      const outcome = await analyzer.analyze({
        targetType: 'post',
        targetId: postId,
        userId,
        text: 'berat sekali rasanya',
      });

      expect(outcome.level).toBe('L3');
      expect(outcome.showIntervention).toBe(true);

      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.status).toBe('active');
    });
  });

  describe('when the classifier is unavailable (non-negotiable #1)', () => {
    it('publishes a quiet post at L1, flagged for re-analysis', async () => {
      classifier.available = false;

      const { userId, postId } = await makePost('cerita biasa aja hari ini');
      const outcome = await analyzer.analyze({
        targetType: 'post',
        targetId: postId,
        userId,
        text: 'cerita biasa aja hari ini',
      });

      expect(outcome.usedFallback).toBe(true);
      expect(outcome.status).toBe('published');
      expect(outcome.level).toBe('L1');
      expect(outcome.needsReanalysis).toBe(true);
    });

    it('holds a post the local rules flagged rather than publishing it', async () => {
      // This is the case that makes an outage safe. Publishing here would turn
      // a provider problem into a safety bypass.
      classifier.available = false;

      const text = 'aku pengen mati aja rasanya';
      const { userId, postId } = await makePost(text);

      const outcome = await analyzer.analyze({
        targetType: 'post',
        targetId: postId,
        userId,
        text,
      });

      expect(outcome.usedFallback).toBe(true);
      expect(outcome.status).toBe('held');
      expect(outcome.queue).toBe('critical');
      expect(outcome.showIntervention).toBe(true);
    });

    it('writes no classification row when it could not classify', async () => {
      // An empty row would later read as "checked, nothing found".
      classifier.available = false;

      const { userId, postId } = await makePost('tidak ada yang khusus');
      await analyzer.analyze({
        targetType: 'post',
        targetId: postId,
        userId,
        text: 'tidak ada yang khusus',
      });

      const rows = await prisma.aiClassification.count({
        where: { targetType: 'post', targetId: postId },
      });
      expect(rows).toBe(0);
    });
  });

  describe('re-analysis settles the outage backlog (TECH-SPEC §4.2)', () => {
    it('reclassifies posts once the classifier returns', async () => {
      classifier.available = false;
      const { postId } = await makePost('cerita menunggu klasifikasi');

      // Still down: the flag must survive.
      let report = await reanalysis.runBatch(200);
      expect(report.stillPending).toBeGreaterThan(0);

      let post = await prisma.curhatPost.findUniqueOrThrow({ where: { id: postId } });
      expect(post.needsReanalysis).toBe(true);

      classifier.available = true;
      classifier.scores = { toxicity: 0.01 };

      report = await reanalysis.runBatch(200);
      expect(report.reclassified).toBeGreaterThan(0);

      post = await prisma.curhatPost.findUniqueOrThrow({ where: { id: postId } });
      expect(post.needsReanalysis).toBe(false);
      expect(post.safetyLevel).toBe('L0');
    });

    it('pulls down a post that turns out to be harmful', async () => {
      // The point of re-analysis: content published during an outage is
      // reviewed, not grandfathered in.
      classifier.available = false;
      const text = 'konten yang ternyata bermasalah setelah ditinjau ulang';
      const { postId } = await makePost(text);

      classifier.available = true;
      classifier.scores = { harassment: 0.85 };

      await reanalysis.runBatch(200);

      const post = await prisma.curhatPost.findUniqueOrThrow({ where: { id: postId } });
      expect(post.status).toBe('held');
      expect(post.needsReanalysis).toBe(false);

      const moderationCase = await prisma.moderationCase.findFirst({
        where: { targetType: 'post', targetId: postId },
      });
      expect(moderationCase).not.toBeNull();
    });

    it('reports the backlog so a long outage is visible', async () => {
      const backlog = await reanalysis.backlog();
      expect(backlog).toHaveProperty('posts');
      expect(backlog).toHaveProperty('oldest');
    });
  });

  describe('anti-spam (E07-T14)', () => {
    it('spots copy-paste flooding', () => {
      const rules = new LocalRulesService();
      const original = 'Investasi ini pasti untung, yuk gabung sekarang juga ya teman-teman.';

      expect(rules.isNearDuplicate(original, [original])).toBe(true);
    });

    it('does not flag someone writing about the same subject twice', () => {
      // People in distress circle the same thing. Treating that as spam would
      // punish exactly the wrong person.
      const rules = new LocalRulesService();

      const first = 'Hari ini aku berantem lagi sama pasangan soal uang, capek banget rasanya.';
      const second =
        'Tadi malam kami bicara lagi soal keuangan, tapi ujungnya tetap ribut dan aku lelah.';

      expect(rules.isNearDuplicate(second, [first])).toBe(false);
    });

    it('flags scam shapes without blocking them', () => {
      const rules = new LocalRulesService();
      const result = rules.evaluate('Profit pasti 100%, hubungi admin sekarang!');

      expect(result.abuseSuspected).toBe(true);
      // Suspicion raises review priority; it is not a verdict.
      expect(result.highRisk).toBe(false);
    });

    it('does not flag someone describing being scammed', () => {
      const rules = new LocalRulesService();
      const result = rules.evaluate(
        'Aku kena tipu investasi bodong, uangku habis dan aku malu cerita ke keluarga.',
      );

      expect(result.abuseSuspected).toBe(false);
    });
  });
});
