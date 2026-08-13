import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';

import { Public } from '../auth/jwt-auth.guard.js';
import { HealthService } from './health.service.js';

/**
 * Health endpoints — E01, dibuat `@Public()` di E17.
 *
 * Guard JWT global berlaku ke seluruh controller, jadi tanpa `@Public()` kedua
 * endpoint ini balas 401. Akibatnya bukan cuma kosmetik: healthcheck Docker
 * menandai container `unhealthy` selamanya, dan health gate di pipeline deploy
 * (E17-T04) tidak akan pernah lolos — setiap deploy berakhir rollback ke versi
 * lama meski versi barunya sehat.
 *
 * Keduanya memang aman dibuka: `live` tidak menyentuh dependency apa pun, dan
 * `ready` cuma menjawab bisa/tidak mencapai Postgres dan Redis — tanpa detail
 * koneksi, tanpa data.
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Process is up. Never touches dependencies. */
  @Get('live')
  live() {
    return this.health.live();
  }

  /**
   * Ready to accept traffic. Returns 503 when a required dependency is down so
   * the load balancer stops routing here instead of serving broken requests.
   */
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const report = await this.health.ready();
    res.status(report.ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return report;
  }
}
