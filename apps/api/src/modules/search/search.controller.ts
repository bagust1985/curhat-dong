import { Controller, Get, Header, Query } from '@nestjs/common';

import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/jwt-auth.guard.js';
import { searchQuerySchema, type SearchQueryDto } from './search.dto.js';
import { SearchService, type SearchResults } from './search.service.js';

/**
 * `GET /search` — TECH-SPEC §3.2, DESIGN-REF §2.13.
 *
 * Authenticated like every content endpoint: search reaches curhat, and curhat
 * is not public (non-negotiable #5). It is also what makes the two-way block
 * filter possible — an anonymous search has no "both directions" to check.
 */
@Controller()
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /**
   * `X-Robots-Tag` here as well as on the web app.
   *
   * The web layer already sends it for `/:path*` (E05-T11), but a crawler that
   * finds the API directly would otherwise get an unmarked JSON body full of
   * curhat excerpts. Two layers, because the cost of missing this is that
   * someone's curhat turns up in a search engine.
   */
  @Get('search')
  @Header('X-Robots-Tag', 'noindex, nofollow, noarchive')
  async run(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(searchQuerySchema)) query: SearchQueryDto,
  ): Promise<SearchResults> {
    return this.search.search(user.userId, query);
  }
}
