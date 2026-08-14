'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { api } from '../../../../lib/api';
import { relativeTime } from '../../../../lib/relative-time';
import { Badge } from '../../../../components/ui';
import { useSession } from '../../../../lib/session';
import { BlockDialog, ReportSheet } from '../../../../components/safety';

/**
 * `/profile/:alias` — E15-T16. DESIGN-REF §2.15, PRD §16.
 *
 * The public view carries alias, avatar, bio, listener badge, joined date and
 * helpful count. It carries no email, no phone, no provider id, no follower
 * count and no internal score, because the API does not send them
 * (CLAUDE.md non-negotiable #4) and this page has no field for them.
 *
 * There is no follower count on purpose, not by omission: PRD §16 rules it out.
 * A number next to somebody's alias turns a place to be heard into a place to
 * be measured.
 */

interface PublicProfile {
  alias: string;
  avatar: string | null;
  bio: string | null;
  isListener: boolean;
  joinedAt: string;
  helpfulCount: number;
}

export default function ProfilePage() {
  const router = useRouter();
  const params = useParams<{ alias: string }>();
  const alias = params.alias;
  const { user } = useSession();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [missing, setMissing] = useState(false);
  const [sheet, setSheet] = useState<'none' | 'report' | 'block'>('none');
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api<PublicProfile>(`/users/${alias}`);
      setProfile(data);
    } catch {
      setMissing(true);
    }
  }, [alias]);

  useEffect(() => {
    void load();
  }, [load]);

  if (missing) {
    return (
      <main className="mx-auto max-w-2xl px-[var(--spacing-gutter)] py-10">
        <h1 className="text-2xl font-black text-[var(--color-text)]">Profilnya nggak ketemu</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Mungkin aliasnya berubah, atau akunnya udah nggak ada.
        </p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="mx-auto max-w-2xl px-[var(--spacing-gutter)] py-10">
        <p role="status">Lagi memuat profil…</p>
      </main>
    );
  }

  const isOwn = user?.alias === profile.alias;

  return (
    <main className="mx-auto max-w-2xl px-[var(--spacing-gutter)] py-8">
      {/*
       * One card holds the whole identity: avatar, alias, join date, listener
       * badge, bio and the helpful count. It used to be six loose lines on the
       * page ground, which read as a debug dump rather than a person.
       */}
      <section className="rounded-[var(--radius-curhat)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-card)]">
        <header className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-[var(--color-tint-pink)] text-3xl"
          >
            {profile.avatar ? '🙂' : '🌙'}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-[var(--color-text)]">{profile.alias}</h1>
            <p className="mt-0.5 text-sm text-[var(--color-muted)]">
              Gabung {relativeTime(profile.joinedAt)}
            </p>
            {profile.isListener ? (
              <Badge tone="brand" className="mt-2">
                Listener
              </Badge>
            ) : null}
          </div>
        </header>

        {profile.bio ? (
          <p className="mt-5 max-w-[60ch] leading-relaxed text-[var(--color-text)]">
            {profile.bio}
          </p>
        ) : null}

        {/*
         * The only number on this page, and it counts what other people said
         * was useful — not followers, views or a rank (PRD §11). Phrased as a
         * sentence so it cannot be read as a score.
         */}
        <p className="mt-5 border-t border-[var(--color-border)] pt-4 text-sm text-[var(--color-muted)]">
          {profile.helpfulCount === 0
            ? 'Belum ada balasan yang ditandai membantu.'
            : `${profile.helpfulCount} balasan ditandai membantu sama yang cerita.`}
        </p>
      </section>

      <p role="status" aria-live="polite" className="mt-4 min-h-5 text-sm text-[var(--color-muted)]">
        {notice}
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        {isOwn ? (
          <>
            <button
              type="button"
              onClick={() => router.push('/settings')}
              className="min-h-[var(--size-touch)] rounded-[var(--radius-action)] bg-[var(--color-primary)] px-6 font-bold text-[var(--color-primary-fg)]"
            >
              Atur profil & akun
            </button>
            <button
              type="button"
              onClick={() => router.push('/moderation/actions')}
              className="min-h-[var(--size-touch)] text-sm text-[var(--color-muted)] underline underline-offset-4"
            >
              Riwayat moderasi
            </button>
          </>
        ) : (
          <>
            {profile.isListener ? (
              <button
                type="button"
                onClick={() => router.push('/listener/request')}
                className="min-h-[var(--size-touch)] rounded-[var(--radius-action)] bg-[var(--color-primary)] px-6 font-bold text-[var(--color-primary-fg)]"
              >
                Cari sebagai listener
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setSheet('report')}
              className="min-h-[var(--size-touch)] text-sm text-[var(--color-muted)] underline underline-offset-4"
            >
              Laporkan
            </button>
            <button
              type="button"
              onClick={() => setSheet('block')}
              className="min-h-[var(--size-touch)] text-sm text-[var(--color-muted)] underline underline-offset-4"
            >
              Blokir
            </button>
          </>
        )}
      </div>

      {sheet === 'report' ? (
        <div className="mt-6">
          <ReportSheet
            onSubmit={(category, note) => {
              void (async () => {
                try {
                  await api('/reports', {
                    method: 'POST',
                    body: {
                      targetType: 'user',
                      targetId: profile.alias,
                      category,
                      ...(note ? { note } : {}),
                    },
                  });
                  setNotice('Laporanmu kami terima.');
                } finally {
                  setSheet('none');
                }
              })();
            }}
            onClose={() => setSheet('none')}
          />
        </div>
      ) : null}

      {sheet === 'block' ? (
        <div className="mt-6">
          <BlockDialog
            alias={profile.alias}
            onConfirm={() => {
              void (async () => {
                try {
                  await api(`/users/${profile.alias}/block`, { method: 'POST', body: {} });
                  router.push('/home');
                } finally {
                  setSheet('none');
                }
              })();
            }}
            onCancel={() => setSheet('none')}
          />
        </div>
      ) : null}
    </main>
  );
}
