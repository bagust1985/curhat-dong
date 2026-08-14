'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

import { ApiError, api } from '../../../../lib/api';
import { MatchFailedState, SearchingState } from '../../../../components/room';
import { Input } from '../../../../components/ui';

/**
 * `/listener/request` — E15-T14. DESIGN-REF §2.10.
 *
 * Topic and emotion come prefilled from wherever the person arrived from — the
 * DONG AI bridge or a post — so nobody has to retype what they just wrote.
 *
 * The searching state promises nothing. There may be nobody available right
 * now, and a screen that implies success makes the failure land harder.
 */

type Phase = 'form' | 'searching' | 'failed';

interface RequestStatus {
  id: string;
  status: 'searching' | 'matched' | 'expired' | 'cancelled';
  roomId?: string | null;
}

function RequestForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [topic, setTopic] = useState(params.get('topic') ?? '');
  const [emotion, setEmotion] = useState(params.get('emotion') ?? '');
  const [phase, setPhase] = useState<Phase>('form');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resume an existing search rather than starting a second one — the API
  // rejects a duplicate anyway (LISTENER_REQUEST_ALREADY_ACTIVE), and landing
  // on an empty form while a search is running is confusing.
  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api<RequestStatus | null>('/listener/requests/current');
        if (data && data.status === 'searching') {
          setRequestId(data.id);
          setPhase('searching');
        }
      } catch {
        /* no active request */
      }
    })();
  }, []);

  useEffect(() => {
    if (phase !== 'searching' || !requestId) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const { data } = await api<RequestStatus>(`/listener/requests/${requestId}`);
        if (cancelled) return;
        if (data.status === 'matched' && data.roomId) {
          router.push(`/room/${data.roomId}`);
        } else if (data.status === 'expired' || data.status === 'cancelled') {
          setPhase('failed');
        }
      } catch {
        /* keep waiting; one failed poll is not a failed search */
      }
    };

    const timer = setInterval(() => void poll(), 5_000);
    void poll();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [phase, requestId, router]);

  const submit = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api<RequestStatus>('/listener/requests', {
        method: 'POST',
        body: { topic: topic.trim(), emotion: emotion.trim() },
      });
      setRequestId(data.id);
      setPhase('searching');
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'LISTENER_REQUEST_ALREADY_ACTIVE') {
        setPhase('searching');
      } else {
        setError('Belum bisa mulai nyari. Coba lagi sebentar lagi ya.');
      }
    }
  }, [emotion, topic]);

  const cancel = useCallback(async () => {
    if (requestId) {
      try {
        await api(`/listener/requests/${requestId}/cancel`, { method: 'POST', body: {} });
      } catch {
        /* cancelling is best-effort */
      }
    }
    setPhase('form');
  }, [requestId]);

  if (phase === 'searching') {
    return (
      <SearchingState
        // Honest and vague, because the real number depends on who is awake.
        estimateLabel="Biasanya beberapa menit. Kadang lebih lama kalau lagi sepi."
        onCancel={() => void cancel()}
      />
    );
  }

  if (phase === 'failed') {
    return (
      <MatchFailedState
        alternatives={[
          { label: 'Ngobrol sama DONG AI dulu', onSelect: () => router.push('/ai') },
          {
            label: 'Tulis di Butuh Didengar',
            onSelect: () => router.push('/curhat/baru'),
          },
          { label: 'Coba cari lagi', onSelect: () => setPhase('form') },
        ]}
      />
    );
  }

  return (
    <section aria-labelledby="request-heading">
      <h1 id="request-heading" className="text-xl font-bold text-[var(--color-text)]">
        Cari orang yang mau dengerin
      </h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Dua pertanyaan aja, biar kami tahu siapa yang cocok nemenin kamu.
      </p>

      <div className="mt-6">
        <label htmlFor="request-topic" className="block text-sm font-semibold text-[var(--color-text)]">
          Ini soal apa?
        </label>
        <Input
          id="request-topic"
          value={topic}
          maxLength={40}
          onChange={(event) => setTopic(event.target.value)}
          className="mt-2"
        />
      </div>

      <div className="mt-4">
        <label
          htmlFor="request-emotion"
          className="block text-sm font-semibold text-[var(--color-text)]"
        >
          Sekarang rasanya gimana?
        </label>
        <Input
          id="request-emotion"
          value={emotion}
          maxLength={40}
          onChange={(event) => setEmotion(event.target.value)}
          className="mt-2"
        />
      </div>

      <p role="alert" className="mt-3 min-h-5 text-sm text-[var(--color-danger)]">
        {error}
      </p>

      <button
        type="button"
        disabled={topic.trim().length === 0 || emotion.trim().length === 0}
        onClick={() => void submit()}
        className="mt-2 min-h-[var(--size-touch)] w-full rounded-[var(--radius-action)] bg-[var(--color-primary)] px-6 font-semibold text-[var(--color-primary-fg)] disabled:opacity-60"
      >
        Cariin aku pendengar
      </button>
    </section>
  );
}

export default function ListenerRequestPage() {
  return (
    <main className="mx-auto max-w-md px-[var(--spacing-gutter)] py-10">
      {/* useSearchParams needs a suspense boundary in the app router. */}
      <Suspense fallback={<p role="status">Sebentar ya…</p>}>
        <RequestForm />
      </Suspense>
    </main>
  );
}
