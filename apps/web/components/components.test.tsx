import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { REACTIONS, REACTION_LABELS, REPORT_CATEGORIES } from '@curhat/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BottomNav, NAV_ITEMS } from './bottom-nav';
import { IntentBadge, IntentSelector, MoodChip, MoodPicker, MoodStrip } from './chips';
import { ChatBubble, CommentItem, EmptyState, ListenerCard } from './conversation';
import { CurhatCard } from './curhat-card';
import { ReactionBar, ReactionPicker } from './reaction-bar';
import {
  BLOCK_CONSEQUENCES,
  BlockDialog,
  DestructiveConfirm,
  FeltHeardSheet,
  ReportSheet,
  SafetyResourceCard,
} from './safety';
import { MOODS, MOOD_VOCABULARY } from '../lib/vocabulary';

afterEach(() => {
  document.body.innerHTML = '';
});

/**
 * E15-T02..T04.
 *
 * Rendered rather than grepped: "every icon has a screen reader label" is a
 * claim about what a reader lands on, and only a query by accessible name
 * actually checks it.
 */
describe('mood, intent and category (E15-T02)', () => {
  it('announces a mood by name, never as an emoji', () => {
    render(<MoodChip mood="patah_hati" />);

    // "💔" would be announced as "broken heart" — true, and useless.
    expect(screen.getByRole('img', { name: 'Mood: patah hati' })).toBeTruthy();
  });

  it('gives all 11 moods a reachable accessible name in the picker', () => {
    render(<MoodPicker value={null} onChange={() => {}} />);

    const group = screen.getByRole('radiogroup', { name: 'Pilih mood' });
    for (const mood of MOODS) {
      expect(
        within(group).getByRole('radio', { name: MOOD_VOCABULARY[mood].a11yLabel }),
        mood,
      ).toBeTruthy();
    }
    expect(within(group).getAllByRole('radio')).toHaveLength(11);
  });

  it('exposes selection through aria-checked, not only styling', () => {
    render(<MoodPicker value="capek" onChange={() => {}} />);

    const selected = screen.getByRole('radio', { name: MOOD_VOCABULARY.capek.a11yLabel });
    expect(selected.getAttribute('aria-checked')).toBe('true');

    const other = screen.getByRole('radio', { name: MOOD_VOCABULARY.senang.a11yLabel });
    expect(other.getAttribute('aria-checked')).toBe('false');
  });

  it('reports the picked mood', async () => {
    const onChange = vi.fn();
    render(<MoodPicker value={null} onChange={onChange} />);

    await userEvent.click(screen.getByRole('radio', { name: MOOD_VOCABULARY.cemas.a11yLabel }));
    expect(onChange).toHaveBeenCalledWith('cemas');
  });

  it('labels intent as what the author is looking for', () => {
    render(<IntentBadge intent="cuma_didengar" />);
    expect(screen.getByRole('img', { name: /cuma mau didengar/i })).toBeTruthy();
  });

  it('renders the four intents as one radio group', () => {
    render(<IntentSelector value={null} onChange={() => {}} />);
    expect(screen.getAllByRole('radio')).toHaveLength(4);
  });
});

describe('reactions stay words, not likes (E15-T02, PRD §9)', () => {
  it('renders all six with their empathy word visible', () => {
    render(<ReactionBar counts={{}} mine={[]} onToggle={() => {}} />);

    expect(screen.getAllByRole('button')).toHaveLength(6);
    for (const reaction of REACTIONS) {
      // The word is on screen, not just in the accessible name — this is what
      // stops the row collapsing into a rating.
      expect(screen.getByText(REACTION_LABELS[reaction]), reaction).toBeTruthy();
    }
  });

  it('hides counts by default and shows them when asked', () => {
    const { unmount } = render(
      <ReactionBar counts={{ aku_ngerti: 12 }} mine={[]} onToggle={() => {}} />,
    );

    // On a feed card a count reads as "twelve people already responded, you are
    // not needed".
    expect(screen.queryByText('12')).toBeNull();
    unmount();

    render(<ReactionBar counts={{ aku_ngerti: 12 }} mine={[]} onToggle={() => {}} showCounts />);
    expect(screen.getByText('12')).toBeTruthy();
  });

  it('announces which reactions the viewer already gave', () => {
    render(<ReactionBar counts={{}} mine={['peluk_virtual']} onToggle={() => {}} />);

    const given = screen.getByRole('button', { name: /peluk virtual, sudah kamu beri/i });
    expect(given.getAttribute('aria-pressed')).toBe('true');
  });

  it('says no reaction outranks another, in the picker', () => {
    render(<ReactionPicker mine={[]} onPick={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/Nggak ada yang lebih penting dari yang lain/i)).toBeTruthy();
  });
});

describe('CurhatCard variants (E15-T02)', () => {
  const base = {
    postId: '11111111-1111-4111-8111-111111111111',
    excerpt: 'Hari ini rasanya berat banget dan aku nggak tau harus cerita ke siapa.',
    mood: 'capek' as const,
    intent: 'cuma_didengar' as const,
    categoryName: 'Kerjaan',
    authorLabel: 'PurnamaSunyi',
    isAnonymous: false,
    replyCount: 0,
    createdAtLabel: '2 jam lalu',
  };

  it('says "no replies yet" in words rather than showing a zero', () => {
    render(<CurhatCard {...base} />);
    expect(screen.getByText('Belum ada balasan')).toBeTruthy();
  });

  it('explains the butuh-didengar variant instead of relying on an accent', () => {
    render(<CurhatCard {...base} variant="butuh-didengar" />);
    // Colour alone would be invisible to a colour-blind or screen-reader user.
    expect(screen.getByText(/Belum banyak yang balas/i)).toBeTruthy();
  });

  it('tells the author a held post is only visible to them', () => {
    render(<CurhatCard {...base} variant="held" />);
    expect(screen.getByText(/kami tinjau dulu sebentar/i)).toBeTruthy();
    expect(screen.getByText(/Baru kamu yang bisa lihat ini/i)).toBeTruthy();
  });

  it('marks an anonymous author as anonymous for a screen reader', () => {
    render(<CurhatCard {...base} isAnonymous authorLabel="Anonymous #4821" />);
    expect(screen.getByText(/Ditulis anonim, kode/i)).toBeTruthy();
  });

  it('never shows a follower, view or ranking figure', () => {
    render(<CurhatCard {...base} replyCount={3} />);

    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/pengikut|follower|dilihat|views|peringkat|rank/i);
  });

  it('names which curhat the open button refers to', () => {
    // A feed of cards would otherwise announce "Baca" twenty times.
    render(<CurhatCard {...base} title="Capek sama kerjaan" onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: /Baca curhat: Capek sama kerjaan/i })).toBeTruthy();
  });
});

describe('conversation pieces (E15-T03)', () => {
  const comment = {
    commentId: 'c1',
    authorLabel: 'LangitTenang',
    body: 'Aku ngerti banget rasanya. Kamu nggak sendirian.',
    createdAtLabel: '1 jam lalu',
    isHelpful: false,
    canMarkHelpful: false,
  };

  it('offers mark-helpful only to the post author', () => {
    const { unmount } = render(<CommentItem {...comment} />);
    expect(screen.queryByRole('button', { name: /membantu/i })).toBeNull();
    unmount();

    render(<CommentItem {...comment} canMarkHelpful onMarkHelpful={() => {}} />);
    expect(screen.getByRole('button', { name: /Tandai balasan dari LangitTenang/i })).toBeTruthy();
  });

  it('words the helpful badge in the author’s own voice', () => {
    render(<CommentItem {...comment} isHelpful />);
    expect(screen.getByText('Jawaban ini membantu gue')).toBeTruthy();
  });

  it('nests replies exactly one level', () => {
    render(
      <CommentItem
        {...comment}
        replies={[{ ...comment, commentId: 'c2', body: 'Setuju banget.' }]}
      />,
    );

    expect(screen.getByText('Setuju banget.')).toBeTruthy();
  });

  it('marks a streaming bubble busy without announcing every token', () => {
    render(<ChatBubble messageId="m1" body="Aku dengerin" from="other" streaming />);

    const paragraph = screen.getByText(/Aku dengerin/);
    expect(paragraph.getAttribute('aria-busy')).toBe('true');
    // `polite`, not `assertive`: an assertive live region would interrupt the
    // reader on every token.
    expect(paragraph.getAttribute('aria-live')).toBe('polite');
  });

  it('keeps the streaming caret out of the message text', () => {
    // If the caret were concatenated into `body`, every token would rewrite the
    // text node and the bubble would jump.
    render(<ChatBubble messageId="m1" body="Aku dengerin" from="other" streaming />);

    const paragraph = screen.getByText(/Aku dengerin/);
    const caret = paragraph.querySelector('[aria-hidden="true"]');
    expect(caret).not.toBeNull();
    expect(paragraph.textContent?.startsWith('Aku dengerin')).toBe(true);
  });

  it('never paints a human reply in the AI colour (E18-T01)', () => {
    // Lavender means "this is not a person" everywhere in the product. A
    // listener's message rendered in it would be the one visual lie this
    // design system must not tell, so `human` is the default and has to stay
    // the default.
    render(<ChatBubble messageId="m1" body="Aku dengerin" from="other" />);
    const bubble = screen.getByText('Aku dengerin').parentElement;
    expect(bubble?.className).not.toContain('tint-lavender');
  });

  it('paints a DONG AI reply in the AI colour', () => {
    render(<ChatBubble messageId="m1" body="Aku di sini" from="other" tone="ai" />);
    const bubble = screen.getByText('Aku di sini').parentElement;
    expect(bubble?.className).toContain('tint-lavender');
  });

  it('states listener availability in words, not just a dot', () => {
    render(<ListenerCard alias="BayuRanum" topics={['Kerjaan']} isAvailable={false} />);
    expect(screen.getByText('Sedang nggak available')).toBeTruthy();
  });

  it('phrases a listener’s felt-heard figure as a sentence, not a score', () => {
    render(
      <ListenerCard alias="BayuRanum" topics={[]} isAvailable feltHeardRate={0.82} />,
    );
    // A bare "82%" next to a name is a leaderboard entry (PRD §11).
    expect(screen.getByText(/82% orang yang ngobrol sama dia merasa didengar/)).toBeTruthy();
  });

  it('renders a warm empty state rather than a system message', () => {
    render(<EmptyState context="feed" onAction={() => {}} />);

    expect(screen.getByText('Belum ada yang cerita di sini.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mulai curhat' })).toBeTruthy();
  });

  it('offers no action where inventing one would be pushy', () => {
    render(<EmptyState context="butuhDidengar" onAction={() => {}} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('mood strip on beranda (E18-T01)', () => {
  it('says where each chip goes, not just what it is', () => {
    // "Sedih" announced bare sounds like a statement about the reader rather
    // than a control that opens the composer.
    render(<MoodStrip onPick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Mulai curhat dengan mood Capek' })).toBeTruthy();
  });

  it('hands back the mood it was tapped with', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<MoodStrip onPick={onPick} />);

    await user.click(screen.getByRole('button', { name: 'Mulai curhat dengan mood Sedih' }));
    expect(onPick).toHaveBeenCalledWith('sedih');
  });

  it('offers buttons rather than radios, because tapping navigates away', () => {
    // A radio group that leaves the page on the first arrow key is a trap.
    render(<MoodStrip onPick={() => {}} />);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });
});

describe('bottom nav and FAB (E15-T03)', () => {
  const props = {
    active: 'beranda' as const,
    onNavigate: () => {},
    onCreate: () => {},
  };

  it('renders the five slots the mock specifies', () => {
    render(<BottomNav {...props} />);

    const nav = screen.getByRole('navigation', { name: 'Navigasi utama' });
    expect(within(nav).getAllByRole('button')).toHaveLength(5);
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      'Beranda',
      'Chat',
      'Komunitas',
      'Notifikasi',
      'Akun',
    ]);
  });

  it('keeps "+ Curhat" reachable as a FAB despite having no nav slot', () => {
    // PRD §23 puts this at the centre of the product; the mock's five slots left
    // no room, so it must not simply disappear.
    render(<BottomNav {...props} />);
    expect(screen.getByRole('button', { name: 'Tulis curhat baru' })).toBeTruthy();
  });

  it('disables Komunitas and says why', () => {
    render(<BottomNav {...props} />);

    const komunitas = screen.getByRole('button', { name: 'Komunitas — belum tersedia' });
    expect(komunitas.hasAttribute('disabled')).toBe(true);
  });

  it('enables Komunitas when the flag is on', () => {
    render(<BottomNav {...props} communitiesEnabled />);

    const komunitas = screen.getByRole('button', { name: 'Komunitas' });
    expect(komunitas.hasAttribute('disabled')).toBe(false);
  });

  it('marks the active tab with aria-current, not only a colour', () => {
    render(<BottomNav {...props} active="notifikasi" />);
    expect(screen.getByRole('button', { name: 'Notifikasi' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('announces an unread count rather than only drawing a dot', () => {
    render(<BottomNav {...props} badges={{ notifikasi: 3 }} />);
    expect(screen.getByRole('button', { name: 'Notifikasi, 3 belum dibaca' })).toBeTruthy();
  });
});

describe('Felt Heard sheet (E15-T04, PRD §9)', () => {
  it('offers three answers plus a separate way out', () => {
    render(<FeltHeardSheet onAnswer={() => {}} onDismiss={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('never words dismiss as an answer', () => {
    // A dismissed prompt leaves the metric entirely (E06-T06). If it reads like
    // "no", the North Star starts measuring annoyance.
    render(<FeltHeardSheet onAnswer={() => {}} onDismiss={() => {}} />);

    const dismiss = screen.getByRole('button', {
      name: /Lewati pertanyaan ini, jangan hitung sebagai jawaban/i,
    });
    expect(dismiss.textContent).toBe('Nggak sekarang');
    expect(dismiss.textContent).not.toMatch(/belum|tidak|no/i);
  });

  it('reports dismiss separately from an answer', async () => {
    const onAnswer = vi.fn();
    const onDismiss = vi.fn();
    render(<FeltHeardSheet onAnswer={onAnswer} onDismiss={onDismiss} />);

    await userEvent.click(screen.getByRole('button', { name: /Lewati pertanyaan ini/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('reassures that the answer is private', () => {
    render(<FeltHeardSheet onAnswer={() => {}} onDismiss={() => {}} />);
    expect(screen.getByText(/nggak kelihatan ke siapa pun/i)).toBeTruthy();
  });
});

describe('report sheet (E15-T04)', () => {
  it('offers all ten categories', () => {
    render(<ReportSheet onSubmit={() => {}} onClose={() => {}} />);
    expect(screen.getAllByRole('radio')).toHaveLength(REPORT_CATEGORIES.length);
    expect(REPORT_CATEGORIES).toHaveLength(10);
  });

  it('cannot be submitted without a category', async () => {
    const onSubmit = vi.fn();
    render(<ReportSheet onSubmit={onSubmit} onClose={() => {}} />);

    const submit = screen.getByRole('button', { name: 'Kirim laporan' });
    expect(submit.hasAttribute('disabled')).toBe(true);

    await userEvent.click(screen.getByRole('radio', { name: 'Ancaman' }));
    await userEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith('threat', '');
  });

  it('promises the report is not visible to the person reported', () => {
    render(<ReportSheet onSubmit={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/nggak kelihatan ke orang yang kamu laporkan/i)).toBeTruthy();
  });
});

describe('block dialog is honest about the cost (E15-T04, PRD §15)', () => {
  it('lists every consequence, including the mutual ones', () => {
    render(<BlockDialog alias="SenjaSore" onConfirm={() => {}} onCancel={() => {}} />);

    for (const line of BLOCK_CONSEQUENCES) {
      expect(screen.getByText(line)).toBeTruthy();
    }
    // The one somebody blocking in anger needs to know they are giving up.
    expect(screen.getByText(/nggak akan saling lihat/i)).toBeTruthy();
  });

  it('says the block is not announced to the other person', () => {
    render(<BlockDialog alias="SenjaSore" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/Dia nggak diberi tahu/i)).toBeTruthy();
  });

  it('says it is reversible', () => {
    render(<BlockDialog alias="SenjaSore" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/bisa membatalkan blokir kapan pun/i)).toBeTruthy();
  });
});

describe('support resource is dialable (E15-T04, PRD §15.2)', () => {
  it('turns a phone number into a tel: link', () => {
    render(
      <SafetyResourceCard
        resource={{ name: 'Kemenkes SEJIWA', channel: 'phone', value: '119 ext 8', hours: '24 jam' }}
      />,
    );

    // Somebody on the Level 3 screen must not have to copy a number by hand.
    const link = screen.getByRole('link', { name: /Telepon Kemenkes SEJIWA/i });
    expect(link.getAttribute('href')).toBe('tel:1198');
  });

  it('turns a WhatsApp number into a wa.me link', () => {
    render(
      <SafetyResourceCard
        resource={{ name: 'Layanan Chat', channel: 'whatsapp', value: '+62 811 1111', hours: '09–17' }}
      />,
    );

    expect(screen.getByRole('link').getAttribute('href')).toBe('https://wa.me/628111111');
  });

  it('opens a web resource in a new tab without leaking the referrer', () => {
    render(
      <SafetyResourceCard
        resource={{ name: 'Situs bantuan', channel: 'web', value: 'https://example.org', hours: '24 jam' }}
      />,
    );

    const link = screen.getByRole('link');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });
});

describe('destructive confirm (E15-T04)', () => {
  const consequences = [
    'Semua curhat kamu dilepas dari akun ini dan nggak bisa dikembalikan.',
    'Pesan kamu di ruang privat tetap ada di sisi lawan bicara.',
  ];

  it('renders the consequences above the buttons', () => {
    // The acceptance criterion. A dialog that explains itself below the button
    // is a dialog people have already dismissed.
    render(
      <DestructiveConfirm
        title="Hapus akun?"
        consequences={consequences}
        confirmLabel="Hapus"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    // Asserted as DOM order rather than by searching the text: "Hapus" also
    // appears in the title, so a substring search compares against the wrong
    // thing and passes for the wrong reason.
    const consequence = screen.getByText(consequences[0]!);
    const confirm = screen.getByRole('button', { name: 'Hapus' });

    expect(
      consequence.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('stays locked until the phrase is typed exactly', async () => {
    const onConfirm = vi.fn();
    render(
      <DestructiveConfirm
        title="Hapus akun?"
        consequences={consequences}
        confirmPhrase="HAPUS AKUN"
        confirmLabel="Hapus permanen"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );

    const confirm = screen.getByRole('button', { name: 'Hapus permanen' });
    expect(confirm.hasAttribute('disabled')).toBe(true);

    // A single tap — or a checkbox — is too little friction for something with
    // no way back.
    await userEvent.type(screen.getByRole('textbox'), 'hapus akun');
    expect(confirm.hasAttribute('disabled')).toBe(true);

    await userEvent.clear(screen.getByRole('textbox'));
    await userEvent.type(screen.getByRole('textbox'), 'HAPUS AKUN');
    expect(confirm.hasAttribute('disabled')).toBe(false);

    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('confirms immediately when no phrase is required', async () => {
    const onConfirm = vi.fn();
    render(
      <DestructiveConfirm
        title="Hapus curhat ini?"
        consequences={['Curhat ini hilang dari feed.']}
        confirmLabel="Hapus"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Hapus' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
