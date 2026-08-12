import { Controller, Get, Query } from '@nestjs/common';

import { SupportResourcesService, type SupportiveIntervention } from './support-resources.service.js';

@Controller()
export class SupportResourcesController {
  constructor(private readonly resources: SupportResourcesService) {}

  /**
   * Crisis resources for a region — PRD §15.2.
   *
   * Returns the full intervention payload, including the honest alternatives
   * shown when no verified hotline exists. A wrong number is worse than none:
   * someone in crisis dials it, fails, and feels more alone.
   */
  @Get('support-resources')
  async list(@Query('region') region?: string): Promise<SupportiveIntervention> {
    return this.resources.buildIntervention(region ?? 'ID');
  }
}
