import { describe, expect, it } from 'vitest';
import { Reflector } from '@nestjs/core';

import { HealthController } from './health.controller.js';
import { IS_PUBLIC } from '../auth/jwt-auth.guard.js';

/**
 * Health endpoints stay public — E17-T06.
 *
 * Not a style rule. The global JWT guard applies to every controller, and a
 * 401 here is invisible in development while being fatal in production: Docker
 * marks the container unhealthy forever, and the deploy pipeline's health gate
 * (E17-T04) never passes, so every deploy rolls back a version that was
 * actually fine.
 *
 * Found by the first real deployment, not by any test — hence this one.
 */
describe('health controller', () => {
  it('is reachable without a token', () => {
    const isPublic = new Reflector().get<boolean>(IS_PUBLIC, HealthController);
    expect(isPublic).toBe(true);
  });
});
