/**
 * Admin sidebar — DESIGN-REF §1 and §3.
 *
 * `minRole` is display metadata only. Authorisation is enforced by the API
 * (E14-T02); hiding a menu item is a courtesy, never a security control.
 */

import type { AdminRole } from '@curhat/types';

export interface AdminNavItem {
  href: string;
  label: string;
  minRole: AdminRole;
  /** Shows a live count badge; Critical burns red when non-zero. */
  badge?: 'moderation-critical' | 'appeals-pending';
}

export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: '/', label: 'Dashboard', minRole: 'customer_support' },
  { href: '/moderation', label: 'Moderation', minRole: 'moderator', badge: 'moderation-critical' },
  { href: '/appeals', label: 'Banding', minRole: 'moderator', badge: 'appeals-pending' },
  { href: '/users', label: 'Users', minRole: 'moderator' },
  { href: '/content', label: 'Content', minRole: 'moderator' },
  { href: '/listeners', label: 'Listeners', minRole: 'moderator' },
  { href: '/categories', label: 'Kategori', minRole: 'content_manager' },
  { href: '/support-resources', label: 'Support Resources', minRole: 'super_admin' },
  { href: '/ai-config', label: 'AI Config', minRole: 'super_admin' },
  { href: '/notifications', label: 'Notifikasi', minRole: 'content_manager' },
  { href: '/analytics', label: 'Analytics', minRole: 'customer_support' },
  { href: '/audit', label: 'Audit Log', minRole: 'super_admin' },
  { href: '/settings', label: 'Settings', minRole: 'super_admin' },
] as const;
