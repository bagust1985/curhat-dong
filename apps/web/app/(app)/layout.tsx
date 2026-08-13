import type { ReactNode } from 'react';

import { AppChrome } from '../../components/app-chrome';
import { SessionProvider } from '../../lib/session';

/**
 * The signed-in half of the app — E15-T06.
 *
 * A route group rather than the root layout on purpose: `SessionProvider` asks
 * the refresh cookie for a session as soon as it mounts, and the landing and
 * legal pages must not make a request about a visitor who has done nothing yet
 * (E15-T05). Those pages sit outside this group and stay static.
 *
 * `AppChrome` (Revisi 2) renders the bottom nav on every screen here except
 * the ones that need the screen to themselves — see its own comment.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AppChrome>{children}</AppChrome>
    </SessionProvider>
  );
}
