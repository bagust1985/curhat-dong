import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { err, ok, requestsOf, stubFetch } from '../test/fetch-stub';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useParams: () => ({ id: 'post-1' }),
}));

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const POST = {
  id: 'post-1',
  title: 'Capek banget minggu ini',
  body: 'Rasanya semua numpuk barengan dan aku nggak tau harus mulai dari mana.',
  mood: 'capek',
  intent: 'cuma_didengar',
  categorySlug: 'kerjaan',
  categoryName: 'Kerjaan',
  authorAlias: 'senja.tenang',
  isAnonymous: false,
  allowComments: true,
  responseCount: 1,
  reactionCounts: { peluk: 2 },
  commentCount: 1,
  createdAt: new Date().toISOString(),
  isOwn: false,
  status: undefined as string | undefined,
};

const COMMENT = {
  id: 'c-1',
  body: 'aku dengerin kok. nggak harus langsung beres semuanya.',
  authorAlias: 'kopi.pagi',
  isOwn: false,
  isMarkedHelpful: false,
  parentId: null,
  createdAt: new Date().toISOString(),
  replies: [],
};

function stubPost(
  overrides: Partial<typeof POST> = {},
  options: { comments?: unknown[]; prompts?: unknown[]; postError?: ReturnType<typeof err> } = {},
) {
  return stubFetch((url) => {
    if (url.includes('/auth/refresh')) return ok({ accessToken: 'token' });
    if (url.endsWith('/v1/me')) {
      return ok({
        alias: 'aku',
        avatar: null,
        bio: null,
        isListener: false,
        joinedAt: '2026-01-01T00:00:00Z',
        helpfulCount: 0,
        hasCompletedOnboarding: true,
        topics: [],
      });
    }
    if (url.includes('/felt-heard/pending')) return ok(options.prompts ?? []);
    if (url.includes('/comments')) return ok({ items: options.comments ?? [COMMENT] });
    if (url.includes('/v1/posts/post-1')) {
      return options.postError ?? ok({ ...POST, ...overrides });
    }
    return ok({});
  });
}

async function renderPost() {
  const { default: PostDetailPage } = await import('../app/(app)/post/[id]/page');
  const { SessionProvider } = await import('../lib/session');
  render(
    <SessionProvider>
      <PostDetailPage />
    </SessionProvider>,
  );
}

/**
 * Post detail — E15-T11. DESIGN-REF §2.5, PRD §9.
 */
describe('states that must not look like errors', () => {
  it('tells the author their own post is under review', async () => {
    stubPost({ isOwn: true, status: 'held' });
    await renderPost();

    expect(
      await screen.findByText('Curhatmu kami tinjau dulu sebentar ya'),
    ).toBeTruthy();
    expect(screen.getByText(/ini bukan hukuman/i)).toBeTruthy();
  });

  it('shows a plain gone screen for a deleted post', async () => {
    stubPost({}, { postError: err(404, 'NOT_FOUND') });
    await renderPost();

    expect(await screen.findByRole('heading', { name: 'Curhatnya udah nggak ada' })).toBeTruthy();
    // No speculation about who removed it or why.
    expect(document.body.textContent).not.toMatch(/moderat|dilanggar|melanggar/i);
  });

  it('replaces the composer with an explanation when comments are locked', async () => {
    stubPost({ allowComments: false });
    await renderPost();

    await screen.findByRole('heading', { name: 'Capek banget minggu ini' });
    expect(screen.queryByLabelText('Tulis balasan')).toBeNull();
    expect(screen.getByText(/menutup balasan buat curhat ini/i)).toBeTruthy();
  });
});

describe('mark helpful', () => {
  it('is offered to the post author only', async () => {
    stubPost({ isOwn: true });
    await renderPost();

    await screen.findByRole('heading', { name: 'Capek banget minggu ini' });
    expect(screen.getByRole('button', { name: /membantu/i })).toBeTruthy();
  });

  it('is not offered to a reader who did not write the post', async () => {
    stubPost({ isOwn: false });
    await renderPost();

    await screen.findByRole('heading', { name: 'Capek banget minggu ini' });
    // PRD §9: the badge means "this helped *me*", so only the author can give it.
    expect(screen.queryByRole('button', { name: /membantu/i })).toBeNull();
  });
});

describe('felt heard prompt', () => {
  const PROMPT = {
    promptId: 'fh-1',
    targetType: 'post',
    targetId: 'post-1',
    question: 'Kamu merasa didengar?',
  };

  it('appears below the content, never over it', async () => {
    stubPost({}, { prompts: [PROMPT] });
    await renderPost();

    const dialog = await screen.findByRole('dialog');
    // The post itself, not the comment articles below it.
    const article = screen.getAllByRole('article')[0]!;
    // Ordering, not styling: the prompt must not be able to cover the curhat
    // the person is in the middle of reading.
    expect(article.compareDocumentPosition(dialog) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is not shown for a prompt belonging to another post', async () => {
    stubPost({}, { prompts: [{ ...PROMPT, targetId: 'post-lain' }] });
    await renderPost();

    await screen.findByRole('heading', { name: 'Capek banget minggu ini' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('disappears once answered and does not come back on the same view', async () => {
    const user = userEvent.setup();
    const spy = stubPost({}, { prompts: [PROMPT] });
    await renderPost();

    await user.click(await screen.findByRole('button', { name: 'Iya, lumayan bikin lega' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(requestsOf(spy)).toContain('POST /v1/felt-heard/answer');
  });

  it('records a dismissal as a dismissal, not as "no"', async () => {
    const user = userEvent.setup();
    const spy = stubPost({}, { prompts: [PROMPT] });
    await renderPost();

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', {
      name: 'Lewati pertanyaan ini, jangan hitung sebagai jawaban',
    }));

    await waitFor(() => {
      expect(requestsOf(spy)).toContain('POST /v1/felt-heard/fh-1/dismiss');
    });
    // A dismissal counted as "no" would turn the North Star into a measure of
    // how annoying the prompt is (E06-T06).
    expect(requestsOf(spy)).not.toContain('POST /v1/felt-heard/answer');
  });
});

describe('replying', () => {
  it('warns about personal data in a reply too', async () => {
    const user = userEvent.setup();
    stubPost();
    await renderPost();

    await user.type(
      await screen.findByLabelText('Tulis balasan'),
      'wa aku aja di 081234567890',
    );

    expect(
      screen.getByText(/Sepertinya curhatanmu berisi informasi pribadi/i),
    ).toBeTruthy();
  });

  it('sends a reply as a child of the comment being replied to', async () => {
    const user = userEvent.setup();
    const spy = stubPost();
    await renderPost();

    await user.click(await screen.findByRole('button', { name: 'Balas' }));
    await user.type(screen.getByLabelText('Balas komentar ini'), 'makasih ya udah dengerin');
    await user.click(screen.getByRole('button', { name: 'Kirim balasan' }));

    await waitFor(() => expect(requestsOf(spy)).toContain('POST /v1/posts/post-1/comments'));
  });
});
