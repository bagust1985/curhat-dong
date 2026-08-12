import { Body, Controller, Post } from '@nestjs/common';

import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/jwt-auth.guard.js';
import { reportSchema, type ReportDto } from '../comments/comments.dto.js';
import { ReportsService } from './reports.service.js';

@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post('reports')
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(reportSchema)) body: ReportDto,
  ): Promise<{ status: 'received'; message: string }> {
    await this.reports.submit({ reporterId: user.userId, ...body });
    return { status: 'received', message: 'Laporanmu kami terima.' };
  }
}
