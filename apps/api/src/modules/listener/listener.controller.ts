import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';

import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/jwt-auth.guard.js';
import { AvailabilityService } from './availability.service.js';
import { ListenerEscalateService, type EscalationResult } from './listener-escalate.service.js';
import { ListenerRequestsService, type RequestStatusView } from './listener-requests.service.js';
import { ListenerService, type ListenerProfileView, type ListenerStats } from './listener.service.js';
import {
  activateSchema,
  availabilitySchema,
  createRequestSchema,
  updateProfileSchema,
  type ActivateDto,
  type AvailabilityDto,
  type CreateRequestDto,
  type UpdateProfileDto,
} from './listener.dto.js';
import { OffersService, type AcceptedSession, type OfferView } from './offers.service.js';

@Controller()
export class ListenerController {
  constructor(
    private readonly listener: ListenerService,
    private readonly availability: AvailabilityService,
    private readonly requests: ListenerRequestsService,
    private readonly offers: OffersService,
    private readonly escalate: ListenerEscalateService,
  ) {}

  // --- Listener side ------------------------------------------------------

  @Get('listener/guidelines')
  guidelines() {
    return this.listener.guidelines();
  }

  @Post('listener/activate')
  async activate(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(activateSchema)) body: ActivateDto,
  ): Promise<ListenerProfileView> {
    return this.listener.activate(user.userId, body);
  }

  @Get('listener/profile')
  async profile(@CurrentUser() user: AuthenticatedUser): Promise<ListenerProfileView> {
    return this.listener.profile(user.userId);
  }

  @Put('listener/profile')
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileDto,
  ): Promise<ListenerProfileView> {
    return this.listener.updateProfile(user.userId, body);
  }

  @Put('listener/availability')
  async setAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(availabilitySchema)) body: AvailabilityDto,
  ): Promise<{ isAvailable: boolean }> {
    // Deliberately unguarded by capacity or cooldown: a listener may step out
    // at any moment, including mid-offer (PRD §11.2).
    return this.availability.set(user.userId, body.isAvailable);
  }

  @Get('listener/stats')
  async stats(@CurrentUser() user: AuthenticatedUser): Promise<ListenerStats> {
    return this.listener.stats(user.userId);
  }

  @Get('listener/offers')
  async pendingOffers(@CurrentUser() user: AuthenticatedUser): Promise<OfferView[]> {
    return this.offers.pendingFor(user.userId);
  }

  @Post('listener/matches/:id/accept')
  async accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<AcceptedSession> {
    return this.offers.accept(user.userId, id);
  }

  @Post('listener/matches/:id/decline')
  async decline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ status: 'declined' }> {
    return this.offers.decline(user.userId, id);
  }

  @Post('listener/sessions/:id/escalate')
  async escalateSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<EscalationResult> {
    return this.escalate.escalate(user.userId, id);
  }

  // --- Requester side -----------------------------------------------------

  @Post('listener/requests')
  async createRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createRequestSchema)) body: CreateRequestDto,
  ): Promise<RequestStatusView> {
    return this.requests.create(user.userId, body);
  }

  @Get('listener/requests/current')
  async currentRequest(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RequestStatusView | null> {
    return this.requests.current(user.userId);
  }

  @Get('listener/requests/:id')
  async requestStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<RequestStatusView> {
    return this.requests.status(user.userId, id);
  }

  @Post('listener/requests/:id/cancel')
  async cancelRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ status: 'cancelled' }> {
    return this.requests.cancel(user.userId, id);
  }

  @Get('listeners/:id')
  async publicProfile(@Param('id') id: string) {
    return this.listener.publicProfile(id);
  }
}
