import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

/**
 * PostgreSQL full-text search — E13. PRD §13; TECH-SPEC §2.4, §3.2.
 *
 * No Elasticsearch (out of scope for Phase 1) and, just as deliberately, no
 * dependency on chat or AI: private room messages and DONG AI conversations
 * are not searchable, and the way that is guaranteed is that this module
 * cannot reach them.
 */
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
