import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CreateCurhat } from './create-curhat';
import { DRAFT_MAX_AGE_MS, clearDraft, loadDraft, saveDraft, EMPTY_DRAFT } from '../lib/draft';
import { PERSONAL_DATA_WARNING, detectPersonalData } from '../lib/personal-data';
import { bodyOf, ok, requestsOf, stubFetch } from '../test/fetch-stub';

const CATEGORIES = [
  { slug: 'kerjaan', name: 'Kerjaan' },
  { slug: 'hubungan', name: 'Hubungan' },
];

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function fillValidPost(user: ReturnType<typeof userEvent.setup>, body: string) {
  await user.type(screen.getByLabelText('Ceritamu'), body);
  await user.click(screen.getByRole('button', { name: 'Pilih topik' }));
  await user.click(screen.getByRole('button', { name: /Kerjaan/ }));
  await user.click(screen.getByRole('radio', { name: 'Mood: capek' }));
  await user.click(screen.getByRole('radio', { name: /cuma mau didengar|didengarkan/i }));
}

function renderCreate(overrides: Partial<Parameters<typeof CreateCurhat>[0]> = {}) {
  const props = {
    categories: CATEGORIES,
    onClose: vi.fn(),
    onPublished: vi.fn(),
    onOpenAi: vi.fn(),
    onFindListener: vi.fn(),
    ...overrides,
  };
  render(<CreateCurhat {...props} />);
  return props;
}

/**
 * Create curhat — E15-T09. DESIGN-REF §2.6, PRD §7, §15.
 */
describe('mood carried in from the home strip (E18-T01)', () => {
  it('opens with that mood already chosen', () => {
    renderCreate({ initialMood: 'capek' });
    expect(screen.getByRole('radio', { name: 'Mood: capek' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('never lets the mood tap overwrite a saved draft', () => {
    // The failure this guards against is expensive and silent: somebody comes
    // back to a half-written curhat, taps a mood on the way in, and the
    // paragraph they finally managed to write is gone.
    saveDraft({
      ...EMPTY_DRAFT,
      body: 'Udah nulis panjang lebar dan belum sempat kirim.',
      mood: 'sedih',
      savedAt: Date.now(),
    });

    renderCreate({ initialMood: 'senang' });

    expect(screen.getByLabelText('Ceritamu')).toHaveProperty(
      'value',
      'Udah nulis panjang lebar dan belum sempat kirim.',
    );
    expect(screen.getByRole('radio', { name: 'Mood: sedih' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('opens blank when no mood was passed', () => {
    renderCreate();
    for (const mood of ['Mood: capek', 'Mood: sedih']) {
      expect(screen.getByRole('radio', { name: mood }).getAttribute('aria-checked')).toBe('false');
    }
  });
});

describe('anti-doxxing warning', () => {
  it('spots the patterns the server spots', () => {
    expect(detectPersonalData('hubungi aku di 081234567890').map((h) => h.id)).toContain(
      'phone_id',
    );
    expect(detectPersonalData('email aku a.b@contoh.co.id').map((h) => h.id)).toContain('email');
    expect(detectPersonalData('NIK 1234567890123456').map((h) => h.id)).toContain('nik');
  });

  it('stays quiet on ordinary sentences', () => {
    // A detector that fires on normal text teaches people to dismiss it.
    expect(detectPersonalData('aku capek banget sama kerjaan minggu ini')).toEqual([]);
    expect(detectPersonalData('udah 3 hari aku nggak bisa tidur')).toEqual([]);
  });

  it('appears while typing, before any submit', async () => {
    const user = userEvent.setup();
    renderCreate();

    await user.type(
      screen.getByLabelText('Ceritamu'),
      'tolong hubungi aku di 081234567890 ya kalau sempat',
    );

    expect(screen.getByText(PERSONAL_DATA_WARNING)).toBeTruthy();
  });

  it('warns without blocking — the submit button stays live', async () => {
    const user = userEvent.setup();
    stubFetch(() => ok({ postId: 'p1', status: 'published' }));
    renderCreate();

    await fillValidPost(user, 'hubungi aku di 081234567890 kalau kamu mau ngobrol lebih lanjut');

    const submit = screen.getByRole('button', { name: 'Kirim curhat' }) as HTMLButtonElement;
    // Not disabled by the warning. It is the person's own story.
    expect(submit.disabled).toBe(false);
  });

  it('reports the acknowledgement so the server does not have to hold the post', async () => {
    const user = userEvent.setup();
    const spy = stubFetch(() => ok({ postId: 'p1', status: 'published' }));
    renderCreate();

    await fillValidPost(user, 'hubungi aku di 081234567890 kalau kamu mau ngobrol lebih lanjut');
    await user.click(screen.getByRole('checkbox', { name: /tetap mau kirim/i }));
    await user.click(screen.getByRole('button', { name: 'Kirim curhat' }));

    await waitFor(() => expect(requestsOf(spy)).toContain('POST /v1/posts'));
    expect(bodyOf(spy, 'POST /v1/posts')).toMatchObject({
      acknowledgedPersonalDataWarning: true,
    });
  });
});

describe('submit outcomes', () => {
  it('says so plainly when the post is held for review', async () => {
    const user = userEvent.setup();
    stubFetch(() => ok({ postId: 'p1', status: 'held' }));
    renderCreate();

    await fillValidPost(user, 'ada yang berat banget minggu ini dan aku belum cerita ke siapa pun');
    await user.click(screen.getByRole('button', { name: 'Kirim curhat' }));

    expect(
      await screen.findByRole('heading', { name: 'Curhatmu kami tinjau dulu sebentar ya' }),
    ).toBeTruthy();
    // Held is not a punishment, and the copy says that outright.
    expect(screen.getByText(/ini bukan hukuman/i)).toBeTruthy();
  });

  it('opens the supportive intervention instead of an error on a Level 3 response', async () => {
    const user = userEvent.setup();
    stubFetch(() =>
      ok({
        postId: 'p1',
        status: 'held',
        intervention: {
          message: 'Kamu nggak harus nanggung ini sendirian.',
          resources: [],
          usingFallback: true,
          alternatives: [],
        },
      }),
    );
    renderCreate();

    await fillValidPost(user, 'aku ngerasa nggak sanggup lagi jalanin hari-hari belakangan ini');
    await user.click(screen.getByRole('button', { name: 'Kirim curhat' }));

    expect(await screen.findByRole('heading', { name: 'Kamu nggak sendirian.' })).toBeTruthy();
    // No error framing anywhere on that path.
    expect(document.body.textContent).not.toMatch(/gagal|error|ditolak/i);
  });

  it('offers the published post', async () => {
    const user = userEvent.setup();
    stubFetch(() => ok({ postId: 'p42', status: 'published' }));
    const props = renderCreate();

    await fillValidPost(user, 'hari ini lumayan berat tapi aku masih di sini dan itu udah cukup');
    await user.click(screen.getByRole('button', { name: 'Kirim curhat' }));

    await user.click(await screen.findByRole('button', { name: 'Lihat curhatku' }));
    expect(props.onPublished).toHaveBeenCalledWith('p42');
  });
});

describe('draft autosave', () => {
  it('survives the component being unmounted and remounted', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <CreateCurhat
        categories={CATEGORIES}
        onClose={() => {}}
        onPublished={() => {}}
        onOpenAi={() => {}}
        onFindListener={() => {}}
      />,
    );

    await user.type(screen.getByLabelText('Ceritamu'), 'setengah kalimat yang belum selesai');
    await waitFor(() => expect(loadDraft()?.body).toContain('setengah kalimat'));

    unmount();
    document.body.innerHTML = '';

    renderCreate();
    await waitFor(() =>
      expect((screen.getByLabelText('Ceritamu') as HTMLTextAreaElement).value).toBe(
        'setengah kalimat yang belum selesai',
      ),
    );
    expect(screen.getByText(/tulisanmu yang belum kekirim kami simpan/i)).toBeTruthy();
  });

  it('is cleared once the post is submitted', async () => {
    const user = userEvent.setup();
    stubFetch(() => ok({ postId: 'p1', status: 'published' }));
    renderCreate();

    await fillValidPost(user, 'ini cerita yang cukup panjang buat lewat batas minimum karakter');
    await waitFor(() => expect(loadDraft()).not.toBeNull());

    await user.click(screen.getByRole('button', { name: 'Kirim curhat' }));
    await screen.findByRole('heading', { name: 'Udah kekirim 🤍' });

    // A draft that outlives its post is a private copy sitting in a browser for
    // no reason.
    expect(loadDraft()).toBeNull();
  });

  it('drops a draft that has gone stale', () => {
    saveDraft({ ...EMPTY_DRAFT, body: 'lama banget' }, Date.now() - DRAFT_MAX_AGE_MS - 1000);
    expect(loadDraft()).toBeNull();
  });

  it('does not keep an empty draft around', () => {
    saveDraft({ ...EMPTY_DRAFT, body: '   ' });
    expect(loadDraft()).toBeNull();
    clearDraft();
  });
});

describe('the form itself', () => {
  it('holds submit until topic, mood and intent are chosen', async () => {
    const user = userEvent.setup();
    renderCreate();

    const submit = () => screen.getByRole('button', { name: 'Kirim curhat' }) as HTMLButtonElement;
    expect(submit().disabled).toBe(true);

    await user.type(screen.getByLabelText('Ceritamu'), 'cerita yang panjangnya cukup buat dikirim');
    expect(submit().disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Pilih topik' }));
    await user.click(screen.getByRole('button', { name: /Kerjaan/ }));
    expect(submit().disabled).toBe(true);

    await user.click(screen.getByRole('radio', { name: 'Mood: capek' }));
    expect(submit().disabled).toBe(true);

    await user.click(screen.getByRole('radio', { name: /didengar/i }));
    expect(submit().disabled).toBe(false);
  });

  it('explains what anonymous mode actually does', () => {
    renderCreate();
    expect(screen.getByText(/kode acak per curhat, bukan nama samaranmu/i)).toBeTruthy();
  });
});
