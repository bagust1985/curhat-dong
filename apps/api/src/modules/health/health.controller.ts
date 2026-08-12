import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';

import { HealthService } from './health.service.js';

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
