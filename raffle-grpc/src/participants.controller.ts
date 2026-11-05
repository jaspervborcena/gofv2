import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedUser, FirebaseAuthGuard } from './firebase-auth.guard';
import { ParticipantsService } from './participants.service';

@Controller('participants')
@UseGuards(FirebaseAuthGuard)
export class ParticipantsController {
  constructor(private readonly participantsService: ParticipantsService) {}

  @Post('games/:gameUid/join')
  joinGame(
    @Req() request: Request,
    @Param('gameUid') gameUid: string,
    @Body() body: Record<string, unknown>
  ): Promise<{ assignedNumber: number }> {
    return this.participantsService.joinGame(this.user(request), gameUid, body);
  }

  private user(request: Request): AuthenticatedUser {
    return (request as Request & { user: AuthenticatedUser }).user;
  }
}
