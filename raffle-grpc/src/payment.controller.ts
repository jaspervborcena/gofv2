import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { FirebaseAuthGuard, AuthenticatedUser } from './firebase-auth.guard';
import { PaymentService } from './payment.service';

@Controller('payments')
@UseGuards(FirebaseAuthGuard)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get('paypal/config')
  paypalConfig() {
    return { clientId: this.paymentService.getPayPalClientId() };
  }

  @Post('paypal/order')
  createPayPalOrder(@Req() request: Request, @Body() body: Record<string, unknown>) {
    return this.paymentService.createPayment(this.user(request), {
      provider: 'paypal',
      packageId: String(body['packageId'] ?? '' ) as 'basic' | 'standard',
      durationMonths: Number(body['durationMonths'] ?? 1),
      promoCode: this.optionalString(body['promoCode']),
      referralCode: this.optionalString(body['referralCode'])
    });
  }

  @Post('paypal/capture')
  capturePayPalOrder(@Req() request: Request, @Body() body: Record<string, unknown>) {
    return this.paymentService.capturePayPalOrder(
      this.user(request),
      String(body['orderId'] ?? '')
    );
  }

  @Post('maya/checkout')
  createMayaCheckout(@Req() request: Request, @Body() body: Record<string, unknown>) {
    return this.paymentService.createPayment(this.user(request), {
      provider: 'maya',
      packageId: String(body['packageId'] ?? '') as 'basic' | 'standard',
      durationMonths: Number(body['durationMonths'] ?? 1),
      promoCode: this.optionalString(body['promoCode']),
      referralCode: this.optionalString(body['referralCode'])
    });
  }

  @Post('maya/orders/:paymentOrderId/status')
  checkMayaPaymentStatus(@Req() request: Request, @Param('paymentOrderId') paymentOrderId: string) {
    return this.paymentService.checkMayaPaymentStatus(this.user(request), paymentOrderId);
  }

  private user(request: Request): AuthenticatedUser {
    return (request as Request & { user: AuthenticatedUser }).user;
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
}
