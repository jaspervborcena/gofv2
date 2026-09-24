import { Module } from '@nestjs/common';
import { RaffleController } from './raffle.controller';
import { WinnerStreamService } from './winner-stream.service';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';

@Module({
  controllers: [RaffleController, PaymentController],
  providers: [WinnerStreamService, PaymentService]
})
export class AppModule {}
