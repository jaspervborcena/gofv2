import { Module } from '@nestjs/common';
import { RaffleController } from './raffle.controller';
import { WinnerStreamService } from './winner-stream.service';

@Module({
  controllers: [RaffleController],
  providers: [WinnerStreamService]
})
export class AppModule {}
