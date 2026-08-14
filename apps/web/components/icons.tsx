/**
 * Navigation icons — E18-T03.
 *
 * These replaced the emoji glyphs the nav used to carry. Emoji were the wrong
 * tool in three ways that all showed up at once: every platform draws its own
 * (an Apple bell and a Windows bell are not the same picture), each one brings
 * its own colours into a palette that is trying to say something with colour,
 * and at 18px they turn to mud.
 *
 * Every icon here is one stroke weight on `currentColor`, so it inherits the
 * state it sits in — muted when the row is idle, `primary-fg` when the row is
 * the active pill — without a single colour being declared twice.
 *
 * Geometry is deliberately conventional. A navigation icon that needs to be
 * learned has failed; these are the shapes people already read as home, search
 * and bell everywhere else.
 */

export type IconProps = { className?: string };

/** Shared frame: 24-unit grid, round joins, no fill. */
function frame(children: React.ReactNode, className?: string) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export function HomeIcon({ className }: IconProps) {
  return frame(
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.75 9.5V20h12.5V9.5" />
    </>,
    className,
  );
}

export function ChatIcon({ className }: IconProps) {
  return frame(<path d="M20 14.5a2.5 2.5 0 0 1-2.5 2.5H8l-4 3.5V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5z" />, className);
}

export function UsersIcon({ className }: IconProps) {
  return frame(
    <>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M2.75 19.5v-.75A4.75 4.75 0 0 1 7.5 14h3a4.75 4.75 0 0 1 4.75 4.75v.75" />
      <path d="M16.5 5.2a3.25 3.25 0 0 1 0 5.6" />
      <path d="M17.5 14.2a4.75 4.75 0 0 1 3.75 4.55v.75" />
    </>,
    className,
  );
}

export function BellIcon({ className }: IconProps) {
  return frame(
    <>
      <path d="M18 9.5a6 6 0 1 0-12 0c0 5.5-2.25 7-2.25 7h16.5S18 15 18 9.5" />
      <path d="M13.75 20a2 2 0 0 1-3.5 0" />
    </>,
    className,
  );
}

export function HeartIcon({ className }: IconProps) {
  return frame(
    <path d="M12 20s-7.5-4.7-7.5-10A4.25 4.25 0 0 1 12 7.5a4.25 4.25 0 0 1 7.5 2.5c0 5.3-7.5 10-7.5 10z" />,
    className,
  );
}

export function CompassIcon({ className }: IconProps) {
  return frame(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8z" />
    </>,
    className,
  );
}

export function SearchIcon({ className }: IconProps) {
  return frame(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>,
    className,
  );
}

export function PersonIcon({ className }: IconProps) {
  return frame(
    <>
      <circle cx="12" cy="8" r="3.75" />
      <path d="M4.5 20v-.75A5.25 5.25 0 0 1 9.75 14h4.5a5.25 5.25 0 0 1 5.25 5.25V20" />
    </>,
    className,
  );
}
