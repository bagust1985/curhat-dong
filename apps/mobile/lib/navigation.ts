/**
 * Tabs and deep links — E16-T02, E16-T09. DESIGN-REF §1, PRD §23.
 *
 * ## The five slots differ from the web, deliberately and visibly
 *
 * Mobile follows DESIGN-REF §1 exactly: HOME · EXPLORE · [+ CURHAT] · LISTEN ·
 * PROFILE, with the create action as a floating button in the middle.
 *
 * The **web** bottom bar follows the brand mock instead (Beranda · Chat ·
 * Komunitas · Notifikasi · Akun, decided 12 Aug 2026, see
 * `apps/web/components/bottom-nav.tsx`). That means the two platforms currently
 * navigate differently, which is a product decision nobody has actually made —
 * it fell out of two documents disagreeing. Recorded here rather than silently
 * picked, because whichever way it resolves, one of the two has to change.
 */

export type TabKey = 'home' | 'explore' | 'listen' | 'profile';

export interface TabDefinition {
  key: TabKey;
  /** Expo Router route name inside `app/(tabs)/`. */
  name: string;
  label: string;
  glyph: string;
}

export const TABS: readonly TabDefinition[] = [
  { key: 'home', name: 'index', label: 'Home', glyph: '🏠' },
  { key: 'explore', name: 'explore', label: 'Explore', glyph: '🧭' },
  { key: 'listen', name: 'listen', label: 'Listen', glyph: '👂' },
  { key: 'profile', name: 'profile', label: 'Profil', glyph: '👤' },
];

/**
 * Where a notification tap should land — E16-T09.
 *
 * The server sends a deep link path (E12-T07). It is mapped here rather than
 * pushed blindly for one reason: a payload arriving from outside the app must
 * not be able to steer navigation anywhere it likes. Anything unrecognised
 * lands on the notification list, which is always a safe destination.
 */
const ALLOWED_PREFIXES: readonly string[] = [
  '/post/',
  '/room/',
  '/ai',
  '/notifications',
  '/listen',
  '/listener/request',
  '/moderation/actions',
  '/settings',
  '/profile/',
];

export const NOTIFICATION_FALLBACK = '/notifications';

export function resolveDeepLink(target: string | null | undefined): string {
  if (!target || typeof target !== 'string') return NOTIFICATION_FALLBACK;

  // Absolute URLs, protocol-relative paths and traversal are all refused
  // outright rather than sanitised — there is no legitimate notification that
  // needs them.
  if (!target.startsWith('/') || target.startsWith('//') || target.includes('..')) {
    return NOTIFICATION_FALLBACK;
  }

  return ALLOWED_PREFIXES.some((prefix) => target === prefix || target.startsWith(prefix))
    ? target
    : NOTIFICATION_FALLBACK;
}

/**
 * Routes where the Android back button must not leave the app.
 *
 * These are mid-flow screens: backing out of onboarding step 5 to the home
 * screen of the phone loses everything the person just answered, and backing
 * out of a room looks like leaving the conversation.
 */
export const BACK_GUARDED_ROUTES: readonly string[] = [
  '/onboarding',
  '/curhat/baru',
  '/room',
  '/auth',
];

export function isBackGuarded(pathname: string): boolean {
  return BACK_GUARDED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}
