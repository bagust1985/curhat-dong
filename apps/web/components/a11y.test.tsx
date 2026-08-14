import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgeGate, EmailStep, OtpStep } from './auth';
import { ConsentStep, SafetyRulesStep } from './onboarding';
import { CurhatCard } from './curhat-card';
import { FeedTabs, ListenerNudgeBanner, PrivateAiEntryCard, StartCurhatCard } from './feed';
import { MoodStrip } from './chips';
import { GuidelinesGate, MatchOfferModal, RestStateBanner } from './listener';
import { RoomHeader, SessionFeedback } from './room';
import { SupportiveIntervention } from './supportive-intervention';
import { AiDisclaimer, QuotaNotice } from './dong-ai';
import { MOODS, MOOD_VOCABULARY, REACTION_VOCABULARY, INTENT_VOCABULARY } from '../lib/vocabulary';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

/**
 * Accessibility audit — E15-T17. PRD §23.1, DESIGN-REF §0.1.
 *
 * What is checked here, and what is deliberately not:
 *
 *  - **axe** runs against every screen built in E15. It catches missing names,
 *    broken ARIA, duplicate ids and unlabelled controls;
 *  - **colour contrast is NOT checked by axe.** jsdom has no layout and no
 *    computed colours, so axe returns "incomplete" for every contrast rule and
 *    a passing run would mean nothing. Contrast is verified numerically instead,
 *    for all three themes, in `lib/contrast.test.ts`;
 *  - **font scaling at 200% and real screen-reader behaviour are manual.** Both
 *    are recorded in `docs/A11Y-AUDIT-E15.md`. What is enforced here is the
 *    property that makes 200% survivable: no fixed pixel height on a box that
 *    holds text, and no `whitespace-nowrap` on body copy.
 */

/**
 * Renders inside a `<main>` landmark, the way every real page does.
 *
 * Without it axe reports "region" on every component: content outside a
 * landmark is a real finding about a *page*, and rendering a card on a bare
 * body is a fact about the test harness rather than about the product.
 */
function inPage(node: React.ReactElement) {
  render(<main>{node}</main>);
}

/** Runs axe over what is currently rendered and returns the violations. */
async function violationsOf(): Promise<axe.Result[]> {
  const results = await axe.run(document.body, {
    // Contrast needs a real renderer. See the note above.
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations;
}

function describeViolations(violations: axe.Result[]): string {
  return violations
    .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length})`)
    .join('\n');
}

const CARD_PROPS = {
  postId: 'p1',
  title: 'Capek banget',
  excerpt: 'rasanya numpuk semua',
  mood: 'capek' as const,
  intent: 'cuma_didengar' as const,
  categoryName: 'Kerjaan',
  authorLabel: 'Anonim #1',
  isAnonymous: true,
  replyCount: 2,
  createdAtLabel: '2 jam lalu',
};

const INTERVENTION = {
  message: 'Kamu nggak harus nanggung ini sendirian.',
  resources: [
    { name: 'Layanan Contoh', channel: 'phone' as const, value: '021 1234 5678', hours: '24 jam' },
  ],
  usingFallback: false,
  alternatives: [],
};

const BURNOUT = {
  activeSessions: 0,
  maxConcurrent: 2,
  sessionsToday: 5,
  maxSessionsPerDay: 5,
  cooldownUntil: null,
  dailyCapReached: true,
  restReminder: false,
  message: 'Kamu udah nemenin lima orang hari ini.',
};

const SCREENS: Array<{ name: string; render: () => void }> = [
  {
    name: 'auth — email',
    render: () => inPage(<EmailStep onSubmit={() => {}} pending={false} error={null} />),
  },
  {
    name: 'auth — kode',
    render: () =>
      inPage(
        <OtpStep
          email="a@b.test"
          onVerify={() => {}}
          onResend={() => {}}
          onBack={() => {}}
          pending={false}
          error={null}
          sentAt={1}
        />,
      ),
  },
  {
    name: 'auth — age gate',
    render: () =>
      inPage(<AgeGate onConfirm={() => {}} onReject={() => {}} pending={false} error={null} />),
  },
  {
    name: 'onboarding — consent',
    render: () => inPage(<ConsentStep granted={{}} onToggle={() => {}} />),
  },
  {
    name: 'onboarding — aturan main',
    render: () => inPage(<SafetyRulesStep acknowledged={false} onAcknowledge={() => {}} />),
  },
  {
    name: 'feed — kartu curhat',
    render: () => inPage(<CurhatCard {...CARD_PROPS} onOpen={() => {}} />),
  },
  {
    name: 'feed — tab',
    // With the panel it controls: `aria-controls` pointing at nothing is a real
    // violation, and the tabs only exist beside their panel in the app.
    render: () =>
      inPage(
        <>
          <FeedTabs active="terbaru" onSelect={() => {}} />
          <section id="feed-panel" role="tabpanel" aria-labelledby="feed-tab-terbaru">
            <p>isi feed</p>
          </section>
        </>,
      ),
  },
  {
    name: 'feed — pintu DONG AI',
    render: () => inPage(<PrivateAiEntryCard onOpen={() => {}} />),
  },
  {
    name: 'beranda — strip mood',
    render: () => inPage(<MoodStrip onPick={() => {}} />),
  },
  {
    name: 'beranda — kotak mulai curhat',
    render: () => inPage(<StartCurhatCard onStart={() => {}} />),
  },
  {
    name: 'feed — ajakan listener',
    render: () =>
      inPage(<ListenerNudgeBanner waiting={3} onOpen={() => {}} onDismiss={() => {}} />),
  },
  {
    name: 'supportive intervention',
    render: () =>
      inPage(
        <SupportiveIntervention
          data={INTERVENTION}
          onClose={() => {}}
          onTalkToAi={() => {}}
          onFindListener={() => {}}
        />,
      ),
  },
  {
    name: 'DONG AI — disclaimer & kuota',
    render: () =>
      inPage(
        <div>
          <AiDisclaimer />
          <QuotaNotice remaining={0} limit={10} onFindListener={() => {}} />
        </div>,
      ),
  },
  {
    name: 'listener — panduan',
    render: () =>
      inPage(
        <GuidelinesGate
          version="v1"
          sections={[{ title: 'Kamu bukan konselor', body: 'Jangan mendiagnosis.' }]}
          onAccept={() => {}}
          pending={false}
        />,
      ),
  },
  {
    name: 'listener — tawaran',
    render: () =>
      inPage(
        <MatchOfferModal
          offer={{
            matchId: 'm1',
            topic: 'Kerjaan',
            emotion: 'capek',
            mood: 'capek',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          }}
          onAccept={() => {}}
          onDecline={() => {}}
        />,
      ),
  },
  {
    name: 'listener — istirahat',
    render: () => inPage(<RestStateBanner state={BURNOUT} />),
  },
  {
    name: 'room — header',
    render: () =>
      inPage(
        <RoomHeader
          counterpartAlias="senja"
          role="listener"
          online
          canEscalate
          onReport={() => {}}
          onBlock={() => {}}
          onEnd={() => {}}
          onEscalate={() => {}}
        />,
      ),
  },
  {
    name: 'room — feedback',
    render: () => inPage(<SessionFeedback role="listener" onSubmit={() => {}} />),
  },
];

describe('axe (PRD §23.1)', () => {
  for (const screenCase of SCREENS) {
    it(`has no violations: ${screenCase.name}`, async () => {
      screenCase.render();
      const violations = await violationsOf();
      expect(describeViolations(violations)).toBe('');
    });
  }
});

describe('icons are never the only label', () => {
  it('gives every mood, reaction and intent a spoken name', () => {
    // 11 + 6 + 4. A glyph announced as "broken heart" is true and useless.
    for (const entry of [
      ...Object.values(MOOD_VOCABULARY),
      ...Object.values(REACTION_VOCABULARY),
      ...Object.values(INTENT_VOCABULARY),
    ]) {
      expect(entry.a11yLabel.length).toBeGreaterThan(3);
      expect(entry.a11yLabel).not.toBe(entry.glyph);
    }
    expect(MOODS).toHaveLength(11);
  });

  it('does not rely on colour alone to separate them', () => {
    // Every entry carries a shape as well as a hue, for readers who cannot tell
    // two colours apart.
    for (const entry of Object.values(MOOD_VOCABULARY)) {
      expect(['round', 'square', 'notch', 'pill']).toContain(entry.shape);
    }
  });
});

describe('keyboard', () => {
  it('reaches every control on a screen by tabbing', async () => {
    const user = userEvent.setup();
    render(<AgeGate onConfirm={() => {}} onReject={() => {}} pending={false} error={null} />);

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('checkbox'));

    await user.tab();
    // The disabled primary button is skipped, which is correct — the way out
    // must still be reachable.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Umurku belum 18' }));
  });

  it('puts no click handler on something that cannot be focused', () => {
    // A `<div onClick>` works with a mouse and is invisible to a keyboard.
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const source = readFileSync(file, 'utf8');
      const matches = source.matchAll(/<(\w+)\b[^>]*\bonClick=/g);
      for (const match of matches) {
        const tag = match[1] ?? '';
        const interactive = /^[A-Z]/.test(tag) || ['button', 'a', 'input'].includes(tag);
        if (!interactive) offenders.push(`${file.replace(webRoot, '')}: <${tag} onClick>`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('text survives being made bigger', () => {
  it('puts no fixed pixel height on a box that holds text', () => {
    // At 200% text size a `h-10` box clips its own contents. Min-heights are
    // fine — they grow — which is why the touch target uses `min-h`.
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/className="[^"]*"/g)) {
        const classes = match[0];
        // Skip decorative boxes: skeletons and rules hold no text.
        if (/animate-pulse|aria-hidden/.test(classes)) continue;
        // `min-h-*` grows with its content and is the correct pattern for a
        // touch target; only a fixed `h-*` clips.
        if (/(?<!min-)\bh-\d+\b/.test(classes) && /text-|font-/.test(classes)) {
          offenders.push(`${file.replace(webRoot, '')}: ${classes.slice(0, 80)}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('does not stop body copy from wrapping', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const source = readFileSync(file, 'utf8');
      if (/whitespace-nowrap/.test(source)) offenders.push(file.replace(webRoot, ''));
    }
    expect(offenders).toEqual([]);
  });
});

describe('motion', () => {
  it('is switched off entirely by prefers-reduced-motion', () => {
    const css = readFileSync(join(webRoot, 'app/globals.css'), 'utf8');

    expect(css).toContain('prefers-reduced-motion');
    // Both, not just one: a page with transitions disabled and animations still
    // running is still moving.
    expect(css).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(css).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
  });

  it('keeps a visible focus ring', () => {
    const css = readFileSync(join(webRoot, 'app/globals.css'), 'utf8');
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:/);
  });
});

/** Every component and page source file in the web app. */
function sourceFiles(): string[] {
  const roots = [join(webRoot, 'components'), join(webRoot, 'app')];
  const files: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) files.push(full);
    }
  };

  for (const root of roots) walk(root);
  return files;
}
