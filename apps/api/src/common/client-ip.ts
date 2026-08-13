import type { Request } from 'express';

/**
 * The real client IP — E17 (VPS bersama, di belakang Cloudflare + nginx).
 *
 * `request.ip` is the *last* hop, and on this deployment that is nginx on
 * 127.0.0.1. Using it means every rate limit bucket, every age-gate cooldown
 * and every audit ip hash collapses onto one value — a rate limit that applies
 * to everybody at once, and a cooldown one person can trigger for the whole
 * internet.
 *
 * That failure is silent: nothing errors, the limits simply stop being
 * per-person. It only surfaces as "why did a stranger get rate limited".
 *
 * Order matters. `CF-Connecting-IP` is set by Cloudflare and stripped from
 * anything a client sends, so it is the only header here that cannot be
 * forged from outside — it is checked first and trusted alone when present.
 * `X-Forwarded-For` is a chain a client can prepend to, so the **left-most**
 * entry is attacker-controlled and the useful one is the last hop we added.
 */
export function clientIpOf(request: Request): string {
  const cloudflare = request.header('cf-connecting-ip');
  if (cloudflare) return cloudflare.trim();

  const forwarded = request.header('x-forwarded-for');
  if (forwarded) {
    const chain = forwarded
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    // The right-most entry is the one nginx appended; anything left of it came
    // from the client and may be invented.
    const nearest = chain[chain.length - 1];
    if (nearest) return nearest;
  }

  return request.ip ?? 'unknown';
}
