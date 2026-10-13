import { Module } from '@nestjs/common';
import { RaffleController } from './raffle.controller';
import { WinnerStreamService } from './winner-stream.service';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { WebhookController } from './webhook.controller';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';

@Module({
  controllers: [RaffleController, PaymentController, WebhookController, ContactController],
  providers: [WinnerStreamService, PaymentService, ContactService]
})
export class AppModule {}
