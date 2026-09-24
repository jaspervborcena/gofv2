import { BadGatewayException, BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import type { AuthenticatedUser } from './firebase-auth.guard';

type Provider = 'paypal' | 'maya';
type PlanId = 'basic' | 'standard';

interface CreatePaymentRequest {
  provider: Provider;
  packageId: PlanId;
  durationMonths?: number;
  promoCode?: string;
  referralCode?: string;
}

interface PaymentOrder {
  userId: string;
  provider: Provider;
  packageId: PlanId;
  amount: number;
  currency: 'PHP';
  status: 'pending' | 'paid' | 'failed';
  createdAt: FieldValue;
  updatedAt: FieldValue;
}

const PACKAGE_PRICES: Record<PlanId, number> = {
  basic: 60,
  standard: 599
};

function firestore() {
  const app = getApps()[0] ?? initializeApp();
  return getFirestore(app);
}

@Injectable()
export class PaymentService {
  async createPayment(user: AuthenticatedUser, request: CreatePaymentRequest): Promise<Record<string, string | number>> {
    if (request.provider !== 'paypal' && request.provider !== 'maya') {
      throw new BadRequestException('Unsupported payment provider.');
    }
    if (request.packageId !== 'basic' && request.packageId !== 'standard') {
      throw new BadRequestException('Unsupported subscription package.');
    }

    const durationMonths = Math.min(12, Math.max(1, Math.floor(Number(request.durationMonths ?? 1))));
    const amount = PACKAGE_PRICES[request.packageId] * durationMonths;
    const orderRef = firestore().collection('payment_orders').doc();
    const order: PaymentOrder = {
      userId: user.uid,
      provider: request.provider,
      packageId: request.packageId,
      amount,
      currency: 'PHP',
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    await orderRef.set(order);

    if (request.provider === 'paypal') {
      const orderId = await this.createPayPalOrder(orderRef.id, request.packageId, durationMonths, amount);
      await orderRef.update({ externalOrderId: orderId, updatedAt: FieldValue.serverTimestamp() });
      return { orderId, paymentOrderId: orderRef.id, amount, currency: 'PHP' };
    }

    const checkout = await this.createMayaCheckout(orderRef.id, request.packageId, durationMonths, amount);
    await orderRef.update({ externalOrderId: checkout.checkoutId, updatedAt: FieldValue.serverTimestamp() });
    return { checkoutId: checkout.checkoutId, qrCode: checkout.qrCode, paymentOrderId: orderRef.id, amount, currency: 'PHP' };
  }

  private async createPayPalOrder(paymentOrderId: string, packageId: PlanId, durationMonths: number, amount: number): Promise<string> {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new InternalServerErrorException('PayPal is not configured on the payment backend.');
    }

    const baseUrl = process.env.PAYPAL_API_BASE_URL ?? 'https://api-m.sandbox.paypal.com';
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });
    if (!tokenResponse.ok) {
      throw new BadGatewayException('PayPal authentication failed.');
    }
    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!token.access_token) {
      throw new BadGatewayException('PayPal did not return an access token.');
    }

    const orderResponse = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: paymentOrderId,
          description: `Game of Fortunes ${packageId} plan for ${durationMonths} month(s)`,
          amount: { currency_code: 'PHP', value: amount.toFixed(2) }
        }]
      })
    });
    if (!orderResponse.ok) {
      throw new BadGatewayException('PayPal order creation failed.');
    }
    const order = (await orderResponse.json()) as { id?: string };
    if (!order.id) {
      throw new BadGatewayException('PayPal did not return an order ID.');
    }
    return order.id;
  }

  private async createMayaCheckout(paymentOrderId: string, packageId: PlanId, durationMonths: number, amount: number): Promise<{ checkoutId: string; qrCode: string }> {
    const publicKey = process.env.MAYA_PUBLIC_KEY;
    const secretKey = process.env.MAYA_SECRET_KEY;
    const checkoutUrl = process.env.MAYA_CHECKOUT_URL;
    if (!publicKey || !secretKey || !checkoutUrl) {
      throw new InternalServerErrorException('Maya is not configured on the payment backend.');
    }

    const response = await fetch(checkoutUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requestReferenceNumber: paymentOrderId,
        totalAmount: { value: amount, currency: 'PHP' },
        redirectUrl: {
          success: process.env.MAYA_SUCCESS_URL ?? '',
          failure: process.env.MAYA_FAILURE_URL ?? '',
          cancel: process.env.MAYA_CANCEL_URL ?? ''
        },
        items: [{ name: `Game of Fortunes ${packageId} (${durationMonths} month(s))`, totalAmount: { value: amount, currency: 'PHP' } }]
      })
    });
    if (!response.ok) {
      throw new BadGatewayException('Maya checkout creation failed.');
    }
    const checkout = (await response.json()) as { checkoutId?: string; qrCode?: string; redirectUrl?: string };
    if (!checkout.checkoutId || !(checkout.qrCode ?? checkout.redirectUrl)) {
      throw new BadGatewayException('Maya did not return checkout details.');
    }
    return { checkoutId: checkout.checkoutId, qrCode: checkout.qrCode ?? checkout.redirectUrl! };
  }
}
