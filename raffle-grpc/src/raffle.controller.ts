import { Body, Controller, Post } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import { WinnerEvent, WinnerStreamService } from './winner-stream.service';

interface SubscribeRequest {
  raffleId: string;
}

@Controller()
export class RaffleController {
  constructor(private readonly winnerStream: WinnerStreamService) {}

  @GrpcMethod('RaffleService', 'SubscribeWinners')
  subscribeWinners(request: SubscribeRequest): Observable<WinnerEvent> {
    return this.winnerStream.subscribe(request.raffleId);
  }

  @Post('winners')
  publishWinner(@Body() event: WinnerEvent): { accepted: boolean } {
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
