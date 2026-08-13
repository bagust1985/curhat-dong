import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FORBIDDEN_TONE,
  SupportiveIntervention,
  type SupportiveInterventionData,
} from './supportive-intervention';

afterEach(() => {
  document.body.innerHTML = '';
});

const WITH_RESOURCES: SupportiveInterventionData = {
  message: 'Apa yang kamu rasain sekarang berat banget, dan kamu nggak harus nanggung sendirian.',
  resources: [
    { name: 'Layanan Contoh', channel: 'phone', value: '021 1234 5678', hours: '24 jam' },
    { name: 'Chat Contoh', channel: 'whatsapp', value: '+628123456789', hours: '09.00–21.00' },
  ],
  usingFallback: false,
  alternatives: [],
};

const EMPTY: SupportiveInterventionData = {
  message: 'Kamu nggak sendirian di ini.',
  resources: [],
  usingFallback: true,
  alternatives: [
    { label: 'Ngobrol sama DONG AI', action: '/ai' },
    { label: 'Cari Listener', action: '/listener/request' },
  ],
};

/**
 * Supportive Intervention — E15-T10. PRD §8, §15.1, CLAUDE.md non-negotiable #2.
 *
 * These are copy-review rules written as assertions. The screen is the one
 * place in the product where a careless sentence added later does real harm,
 * and a reviewer will not re-read it on every unrelated change.
 */
describe('what must never appear', () => {
  for (const data of [WITH_RESOURCES, EMPTY]) {
    it(`carries no score, level, diagnosis or punishment (${data.usingFallback ? 'empty' : 'with resources'})`, () => {
      render(
        <SupportiveIntervention
          data={data}
          onClose={() => {}}
          onTalkToAi={() => {}}
          onFindListener={() => {}}
        />,
      );

      const text = document.body.textContent ?? '';
      for (const pattern of FORBIDDEN_TONE) {
        expect(text, String(pattern)).not.toMatch(pattern);
      }
    });
  }

  it('offers no action that does something to the user', () => {
    render(
      <SupportiveIntervention
        data={WITH_RESOURCES}
        onClose={() => {}}
        onTalkToAi={() => {}}
        onFindListener={() => {}}
      />,
    );

    const labels = screen.getAllByRole('button').map((button) => button.textContent ?? '');
    // Every button leads somewhere the user chose. Nothing blocks, removes,
    // reports or restricts them.
    expect(labels.join(' ')).not.toMatch(/blokir|hapus|laporkan|tutup akun|banding/i);
  });
});

describe('what must always appear', () => {
  it('gives a calm way out as a real button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <SupportiveIntervention
        data={WITH_RESOURCES}
        onClose={onClose}
        onTalkToAi={() => {}}
        onFindListener={() => {}}
      />,
    );

    const close = screen.getByRole('button', { name: 'Aku mengerti, tutup' });
    await user.click(close);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('makes every resource dialable rather than copyable', () => {
    render(
      <SupportiveIntervention
        data={WITH_RESOURCES}
        onClose={() => {}}
        onTalkToAi={() => {}}
        onFindListener={() => {}}
      />,
    );

    const links = screen.getAllByRole('link');
    expect(links[0]?.getAttribute('href')).toBe('tel:02112345678');
    expect(links[1]?.getAttribute('href')).toBe('https://wa.me/628123456789');
  });

  it('is honest when there is no verified list instead of showing an empty heading', () => {
    render(
      <SupportiveIntervention
        data={EMPTY}
        onClose={() => {}}
        onTalkToAi={() => {}}
        onFindListener={() => {}}
      />,
    );

    expect(screen.getByText(/nggak punya daftar nomor bantuan yang sudah kami pastikan benar/i))
      .toBeTruthy();
    // And it still offers something real to do.
    expect(screen.getByRole('button', { name: 'Ngobrol sama DONG AI' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cari Listener sekarang' })).toBeTruthy();
  });

  it('keeps sentences short enough to read in this state', () => {
    render(
      <SupportiveIntervention
        data={EMPTY}
        onClose={() => {}}
        onTalkToAi={() => {}}
        onFindListener={() => {}}
      />,
    );

    // Per element: `document.body.textContent` runs a heading straight into the
    // paragraph after it, which measures a sentence nobody ever reads.
    const blocks = Array.from(document.querySelectorAll('p, h1, h2, button, a'));
    const sentences = blocks.flatMap((block) =>
      (block.textContent ?? '')
        .split(/[.!?]\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean),
    );

    expect(sentences.length).toBeGreaterThan(3);

    for (const sentence of sentences) {
      // PRD §23.1: clarity beats style here. A 40-word sentence is one somebody
      // in distress will not finish.
      expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(32);
    }
  });
});
