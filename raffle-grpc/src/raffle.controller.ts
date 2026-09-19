import { Body, Controller, Post } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import { credentials, loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { join } from 'node:path';
import { WinnerEvent, WinnerStreamService } from './winner-stream.service';

interface SubscribeRequest {
  raffleId: string;
}

@Controller()
export class RaffleController {
  private readonly nativeClient?: any;

  constructor(private readonly winnerStream: WinnerStreamService) {
    const nativeGrpcUrl = process.env.NATIVE_GRPC_URL;
    if (nativeGrpcUrl) {
      const packageDefinition = loadSync(join(__dirname, '..', 'proto', 'raffle.proto'));
      const rafflePackage = loadPackageDefinition(packageDefinition) as any;
      const target = nativeGrpcUrl.replace(/^https?:\/\//, '');
      this.nativeClient = new rafflePackage.raffle.RaffleService(target, credentials.createSsl());
    }
  }

  @GrpcMethod('RaffleService', 'SubscribeWinners')
  subscribeWinners(request: SubscribeRequest): Observable<WinnerEvent> {
    return this.winnerStream.subscribe(request.raffleId);
  }

  @GrpcMethod('RaffleService', 'HealthCheck')
  healthCheck(): Observable<{ status: string }> {
    return this.winnerStream.healthCheck();
  }

  @Post('winners')
  @GrpcMethod('RaffleService', 'PublishWinner')
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
    if (this.nativeClient) {
      await new Promise<void>((resolve, reject) => {
        this.nativeClient.PublishWinner(event, (error: Error | null) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
    return { accepted: true };
  }
}
