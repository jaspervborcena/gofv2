import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export interface WinnerEvent {
  raffleId: string;
  spinId: string;
  winnerId: string;
  winnerName: string;
  prize: string;
}

@Injectable()
export class WinnerStreamService {
  private readonly streams = new Map<string, Subject<WinnerEvent>>();

  subscribe(raffleId: string): Observable<WinnerEvent> {
    const stream = this.getStream(raffleId);
    return new Observable<WinnerEvent>((subscriber) => {
      const subscription = stream.subscribe(subscriber);
      return () => subscription.unsubscribe();
    });
  }

  emitWinner(event: WinnerEvent): void {
    this.getStream(event.raffleId).next(event);
  }

  private getStream(raffleId: string): Subject<WinnerEvent> {
    let stream = this.streams.get(raffleId);
    if (!stream) {
      stream = new Subject<WinnerEvent>();
      this.streams.set(raffleId, stream);
    }
    return stream;
  }
}
