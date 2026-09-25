import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PaymentService } from './payment.service';

@Controller('webhooks')
export class WebhookController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('paypal')
  @HttpCode(HttpStatus.OK)
  async paypal(@Headers() headers: Record<string, string | string[] | undefined>, @Body() event: Record<string, any>): Promise<{ received: boolean }> {
    await this.paymentService.handlePayPalWebhook(headers, event);
    return { received: true };
  }
}