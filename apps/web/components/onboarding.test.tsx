import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConsentStep, SafetyRulesStep, StepShell } from './onboarding';
import {
  CONSENT_ITEMS,
  REQUIRED_CONSENTS,
  SKIPPABLE_STEPS,
  consentSatisfied,
} from '../lib/onboarding';
import { bodyOf, err, ok, requestsOf, stubFetch } from '../test/fetch-stub';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/**
 * Onboarding — E15-T07. DESIGN-REF §2.3, PRD §25.3.
 */
describe('consent rules', () => {
  it('starts with nothing ticked', () => {
    render(<ConsentStep granted={{}} onToggle={() => {}} />);

    for (const box of screen.getAllByRole('checkbox')) {
      expect((box as HTMLInputElement).checked).toBe(false);
    }
  });

  it('asks for three separate answers, not one', () => {
    render(<ConsentStep granted={{}} onToggle={() => {}} />);
    // A single "I agree to everything" box is explicitly forbidden
    // (DESIGN-REF §2.3 step 5) — it makes the optional item non-optional.
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(CONSENT_ITEMS.filter((item) => item.required)).toHaveLength(2);
  });

  it('holds the gate until both required consents are granted', () => {
    expect(consentSatisfied({})).toBe(false);
    expect(consentSatisfied({ tos_privacy: true })).toBe(false);
    // Analytics alone must never open it.
    expect(consentSatisfied({ analytics: true })).toBe(false);
    expect(consentSatisfied({ tos_privacy: true, sensitive_processing: true })).toBe(true);
    expect(REQUIRED_CONSENTS).toEqual(['tos_privacy', 'sensitive_processing']);
  });

  it('says plainly that refusing analytics costs nothing', () => {
    render(<ConsentStep granted={{}} onToggle={() => {}} />);
    expect(screen.getByText('Boleh nggak diaktifin, semua fitur tetap jalan.')).toBeTruthy();
  });

  it('links the documents being consented to', () => {
    render(<ConsentStep granted={{}} onToggle={() => {}} />);

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('/legal/terms');
    expect(hrefs).toContain('/legal/privacy');
  });
});

describe('safety rules step', () => {
  it('is a separate acknowledgement from consent', () => {
    render(<SafetyRulesStep acknowledged={false} onAcknowledge={() => {}} />);

    expect(screen.getByText(/beda dari persetujuan data/i)).toBeTruthy();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });
});

describe('progress', () => {
  it('exposes the step number to a screen reader, not only as dots', () => {
    render(
      <StepShell step={2} total={7} title="Topik" footer={null}>
        <p>isi</p>
      </StepShell>,
    );

    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('3');
    expect(bar.getAttribute('aria-valuetext')).toBe('Langkah 3 dari 7');
  });
});

describe('the flow (mocked API)', () => {
  const CATEGORIES = [
    { slug: 'kerjaan', name: 'Kerjaan', icon: '💼' },
    { slug: 'hubungan', name: 'Hubungan', icon: '💞' },
  ];

  function stub() {
    return stubFetch((url) => {
      if (url.includes('/auth/refresh')) return ok({ accessToken: 'token' });
      if (url.endsWith('/v1/me')) return err(404, 'NOT_FOUND');
      if (url.includes('/categories')) return ok(CATEGORIES);
      if (url.includes('/alias/suggestions')) {
        return ok([
          { alias: 'senja.tenang', available: true },
          { alias: 'kopi.pagi', available: false },
        ]);
      }
      if (url.includes('/alias/check')) return ok({ available: true });
      if (url.endsWith('/v1/onboarding')) return ok({ alias: 'senja.tenang', topics: [] });
      return ok({});
    });
  }

  async function renderFlow() {
    const { default: OnboardingPage } = await import('../app/(app)/onboarding/page');
    const { SessionProvider } = await import('../lib/session');
    render(
      <SessionProvider>
        <OnboardingPage />
      </SessionProvider>,
    );
  }

  it('walks the seven steps and records every consent answer', async () => {
    const user = userEvent.setup();
    const fetchSpy = stub();
    await renderFlow();

    // 1 welcome
    expect(screen.getByText('Di sini kamu nggak harus terlihat baik-baik saja.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Lanjut' }));

    // 2 reason — skippable
    await user.click(screen.getByRole('radio', { name: 'Mau cerita' }));
    await user.click(screen.getByRole('button', { name: 'Lanjut' }));

    // 3 topics
    await waitFor(() => expect(screen.getByRole('button', { name: /Kerjaan/ })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /Kerjaan/ }));
    await user.click(screen.getByRole('button', { name: 'Lanjut' }));

    // 4 alias
    await user.type(screen.getByLabelText('Nama samaran'), 'senja.tenang');
    await user.click(screen.getByRole('radio', { name: 'Bulan' }));
    await user.click(screen.getByRole('button', { name: 'Lanjut' }));

    // 5 consent — both required ones
    const requiredBoxes = screen.getAllByRole('checkbox').slice(0, 2);
    for (const box of requiredBoxes) await user.click(box);
    await user.click(screen.getByRole('button', { name: 'Lanjut' }));

    // 6 safety rules
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Lanjut' }));

    // 7 done
    await user.click(screen.getByRole('button', { name: 'Masuk ke beranda' }));

    await waitFor(() => {
      expect(requestsOf(fetchSpy)).toContain('POST /v1/onboarding');
    });

    const body = bodyOf(fetchSpy, 'POST /v1/onboarding') as {
      consents: Array<{ consentType: string; granted: boolean }>;
      topics?: string[];
      alias?: string;
    };

    // All three are reported, including the refusal — a "no" is a compliance
    // record too (PRD §25.3), and sending only the grants would lose it.
    expect(body.consents).toHaveLength(3);
    expect(body.consents).toContainEqual({ consentType: 'analytics', granted: false });
    expect(body.consents).toContainEqual({ consentType: 'tos_privacy', granted: true });
    expect(body.alias).toBe('senja.tenang');
    expect(body.topics).toEqual(['kerjaan']);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/home'));
  });

  it('will not continue past consent until both required boxes are ticked', async () => {
    const user = userEvent.setup();
    stub();
    await renderFlow();

    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole('button', { name: 'Lanjut' }));
    }

    await screen.findByRole('heading', { name: 'Persetujuan' });
    const advance = () => screen.getByRole('button', { name: 'Lanjut' }) as HTMLButtonElement;
    expect(advance().disabled).toBe(true);

    // Optional one alone changes nothing.
    await user.click(screen.getAllByRole('checkbox')[2]!);
    expect(advance().disabled).toBe(true);

    await user.click(screen.getAllByRole('checkbox')[0]!);
    expect(advance().disabled).toBe(true);

    await user.click(screen.getAllByRole('checkbox')[1]!);
    expect(advance().disabled).toBe(false);
  });

  it('offers skip on steps 2 and 3 only', async () => {
    const user = userEvent.setup();
    stub();
    await renderFlow();

    expect(SKIPPABLE_STEPS).toEqual([1, 2]);
    expect(screen.queryByRole('button', { name: 'Lewati dulu' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Lanjut' }));
    expect(screen.getByRole('button', { name: 'Lewati dulu' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Lewati dulu' }));
    expect(screen.getByRole('button', { name: 'Lewati dulu' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Lewati dulu' }));
    // Step 4 (alias) is not skippable, and neither are 5 and 6.
    expect(screen.queryByRole('button', { name: 'Lewati dulu' })).toBeNull();
  });

  it('sends the user back to the alias step when the name was taken meanwhile', async () => {
    const user = userEvent.setup();
    stubFetch((url) => {
      if (url.includes('/auth/refresh')) return ok({ accessToken: 'token' });
      if (url.endsWith('/v1/me')) return err(404, 'NOT_FOUND');
      if (url.includes('/categories')) return ok(CATEGORIES);
      if (url.includes('/alias/suggestions')) return ok([]);
      if (url.includes('/alias/check')) return ok({ available: true });
      if (url.endsWith('/v1/onboarding')) return err(409, 'ALIAS_TAKEN');
      return ok({});
    });
    await renderFlow();

    for (let i = 0; i < 4; i++) await user.click(screen.getByRole('button', { name: 'Lanjut' }));
    const boxes = screen.getAllByRole('checkbox');
    await user.click(boxes[0]!);
    await user.click(boxes[1]!);
    await user.click(screen.getByRole('button', { name: 'Lanjut' }));
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Lanjut' }));
    await user.click(screen.getByRole('button', { name: 'Masuk ke beranda' }));

    await screen.findByRole('heading', { name: 'Nama samaran kamu' });
    expect(
      within(screen.getByRole('alert')).getByText(/keburu diambil orang/i),
    ).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });
});
