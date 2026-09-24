import { Body, Controller, Post } from '@nestjs/common';
import { Observable } from 'rxjs';
import { WinnerEvent, WinnerStreamService } from './winner-stream.service';

interface SubscribeRequest {
  raffleId: string;
}

@Controller()
export class RaffleController {
  constructor(private readonly winnerStream: WinnerStreamService) {}

  subscribeWinners(request: SubscribeRequest): Observable<WinnerEvent> {
    return this.winnerStream.subscribe(request.raffleId);
  }

  healthCheck(): Observable<{ status: string }> {
    return this.winnerStream.healthCheck();
  }

  @Post('winners')
  async publishWinner(@Body() event: WinnerEvent): Promise<{ accepted: boolean }> {
    if (!event?.raffleId || !event.spinId || !event.winnerId || !event.winnerName) {
      return { accepted: false };
    }

    this.winnerStream.emitWinner({
      raffleId: event.raffleId,
      spinId: event.spinId,
      winnerId: event.winnerId,
      winnerName: event.winnerName,
      prize: event.prize || ''
    });
    return { accepted: true };
  }
}
