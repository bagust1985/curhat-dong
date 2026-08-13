import type { ReactNode } from 'react';

import { SessionProvider } from '../../lib/session';

/**
 * The signed-in half of the app — E15-T06.
 *
 * A route group rather than the root layout on purpose: `SessionProvider` asks
 * the refresh cookie for a session as soon as it mounts, and the landing and
 * legal pages must not make a request about a visitor who has done nothing yet
 * (E15-T05). Those pages sit outside this group and stay static.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
