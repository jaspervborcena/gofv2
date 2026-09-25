import { Module } from '@nestjs/common';
import { RaffleController } from './raffle.controller';
import { WinnerStreamService } from './winner-stream.service';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { WebhookController } from './webhook.controller';

@Module({
  controllers: [RaffleController, PaymentController, WebhookController],
  providers: [WinnerStreamService, PaymentService]
})
export class AppModule {}
