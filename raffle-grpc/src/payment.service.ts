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
  baseAmount: number;
  discountAmount: number;
  currency: 'PHP';
  status: 'pending' | 'paid' | 'failed';
  couponCode?: string;
  createdAt: FieldValue;
  updatedAt: FieldValue;
}

interface CouponRecord {
  couponCode: string;
  appliesTo?: { plan?: string };
  product?: string;
  description?: string;
  discountAmount?: number;
  durationDays?: number;
  maxRedemptions?: number;
  redemptionsUsed?: number;
  restrictions?: { newUsersOnly?: boolean; region?: string };
  status?: string;
  validUntil?: { toMillis?: () => number } | string | Date;
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
    const coupon = request.promoCode
      ? await this.findUsableCoupon(user, request.promoCode, request.packageId)
      : null;
    const baseAmount = PACKAGE_PRICES[request.packageId] * durationMonths;
    const discountAmount = coupon ? Math.min(baseAmount, Math.max(0, Number(coupon.data.discountAmount ?? 0))) : 0;
    const amount = baseAmount - discountAmount;
    const orderRef = firestore().collection('payment_orders').doc();
    const order: PaymentOrder = {
      userId: user.uid,
      provider: request.provider,
      packageId: request.packageId,
      amount,
      baseAmount,
      discountAmount,
      currency: 'PHP',
      status: coupon && amount === 0 ? 'paid' : 'pending',
      ...(coupon ? { couponCode: coupon.code } : {}),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    await orderRef.set(order);

    if (coupon && amount === 0) {
      const subscriptionId = await this.redeemCoupon(coupon, user, request.packageId, orderRef.id);
      return { paymentOrderId: orderRef.id, subscriptionId, status: 'paid', amount, currency: 'PHP' };
    }

    if (request.provider === 'paypal') {
      const paypalOrder = await this.createPayPalOrder(orderRef.id, request.packageId, durationMonths, amount);
      await orderRef.update({ externalOrderId: paypalOrder.id, updatedAt: FieldValue.serverTimestamp() });
      return { orderId: paypalOrder.id, approvalUrl: paypalOrder.approvalUrl, paymentOrderId: orderRef.id, amount, discountAmount, currency: 'PHP' };
    }

    const checkout = await this.createMayaCheckout(orderRef.id, request.packageId, durationMonths, amount);
    await orderRef.update({ externalOrderId: checkout.checkoutId, updatedAt: FieldValue.serverTimestamp() });
    return { checkoutId: checkout.checkoutId, qrCode: checkout.qrCode, paymentOrderId: orderRef.id, amount, discountAmount, currency: 'PHP' };
  }

  private async findUsableCoupon(user: AuthenticatedUser, code: string, packageId: PlanId): Promise<{ ref: FirebaseFirestore.DocumentReference; code: string; data: CouponRecord } | null> {
    const normalizedCode = code.trim().toUpperCase();
    const snapshot = await firestore().collection('coupons').where('couponCode', '==', normalizedCode).limit(1).get();
    if (snapshot.empty) {
      throw new BadRequestException('The promo code is invalid.');
    }

    const couponSnapshot = snapshot.docs[0];
    const coupon = couponSnapshot.data() as CouponRecord;
    const validUntil = this.couponDate(coupon.validUntil);
    const maxRedemptions = Number(coupon.maxRedemptions ?? 0);
    const redemptionsUsed = Number(coupon.redemptionsUsed ?? 0);
    if (coupon.product !== 'game-of-fortunes'
      || coupon.status !== 'active'
      || coupon.appliesTo?.plan !== 'monthly'
      || !validUntil
      || validUntil.getTime() <= Date.now()
      || redemptionsUsed >= maxRedemptions) {
      throw new BadRequestException('The promo code is not valid for this plan.');
    }
    if (coupon.restrictions?.region && coupon.restrictions.region !== 'PH') {
      throw new BadRequestException('The promo code is not available in your region.');
    }
    if (coupon.restrictions?.newUsersOnly) {
      const existingSubscription = await firestore().collection('subscriptions')
        .where('uid', '==', user.uid)
        .limit(1)
        .get();
      if (!existingSubscription.empty) {
        throw new BadRequestException('This promo code is only available to new users.');
      }
    }

    return { ref: couponSnapshot.ref, code: coupon.couponCode, data: coupon };
  }

  private async redeemCoupon(coupon: { ref: FirebaseFirestore.DocumentReference; code: string; data: CouponRecord }, user: AuthenticatedUser, packageId: PlanId, paymentOrderId: string): Promise<string> {
    const database = firestore();
    const subscriptionRef = database.collection('subscriptions').doc();
    const durationDays = Math.max(1, Math.floor(Number(coupon.data.durationDays ?? 30)));
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    await database.runTransaction(async (transaction) => {
      const couponSnapshot = await transaction.get(coupon.ref);
      const currentCoupon = couponSnapshot.data() as CouponRecord | undefined;
      const used = Number(currentCoupon?.redemptionsUsed ?? 0);
      const maximum = Number(currentCoupon?.maxRedemptions ?? 0);
      if (!currentCoupon || currentCoupon.status !== 'active' || used >= maximum) {
        throw new BadRequestException('The promo code has reached its redemption limit.');
      }
      transaction.update(coupon.ref, {
        redemptionsUsed: used + 1,
        updatedAt: FieldValue.serverTimestamp()
      });
      transaction.set(subscriptionRef, {
        subscriptionId: subscriptionRef.id,
        uid: user.uid,
        email: user.email ?? '',
        planType: packageId,
        status: 'active',
        promoCode: coupon.code,
        amountPaid: 0,
        currency: 'PHP',
        isTrial: false,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        paymentOrderId
      });
    });
    return subscriptionRef.id;
  }

  private couponDate(value: CouponRecord['validUntil']): Date | null {
    if (!value) {
      return null;
    }
    if (value instanceof Date) {
      return Number.isFinite(value.getTime()) ? value : null;
    }
    if (typeof value === 'object' && value !== null && typeof value.toMillis === 'function') {
      return new Date(value.toMillis());
    }
    if (typeof value !== 'string') {
      return null;
    }
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  async handlePayPalWebhook(headers: Record<string, string | string[] | undefined>, event: Record<string, any>): Promise<void> {
    const verificationStatus = await this.verifyPayPalWebhook(headers, event);
    if (verificationStatus !== 'SUCCESS') {
      throw new BadRequestException('PayPal webhook signature verification failed.');
    }

    if (event['event_type'] !== 'PAYMENT.CAPTURE.COMPLETED' && event['event_type'] !== 'CHECKOUT.ORDER.COMPLETED') {
      return;
    }

    const resource = event['resource'] as Record<string, any> | undefined;
    const externalOrderId = event['event_type'] === 'CHECKOUT.ORDER.COMPLETED'
      ? resource?.['id']
      : resource?.['supplementary_data']?.['related_ids']?.['order_id'];
    if (typeof externalOrderId !== 'string') {
      throw new BadRequestException('PayPal webhook is missing its order ID.');
    }

    const matches = await firestore().collection('payment_orders')
      .where('externalOrderId', '==', externalOrderId)
      .limit(1)
      .get();
    if (matches.empty) {
      throw new BadRequestException('No internal payment order matches this PayPal order.');
    }

    const orderSnapshot = matches.docs[0];
    const order = orderSnapshot.data() as { amount?: number; status?: string; userId?: string; packageId?: PlanId; provider?: Provider; couponCode?: string };
    if (order.provider !== 'paypal' || order.status === 'paid') {
      return;
    }

    const paidAmount = Number(resource?.['amount']?.['value'] ?? resource?.['purchase_units']?.[0]?.['amount']?.['value']);
    if (!Number.isFinite(paidAmount) || paidAmount !== Number(order.amount)) {
      throw new BadRequestException('PayPal payment amount does not match the internal order.');
    }

    if (order.couponCode) {
      const coupon = await this.findUsableCoupon({ uid: order.userId ?? '' }, order.couponCode, order.packageId as PlanId);
      if (coupon) {
        await this.redeemCoupon(coupon, { uid: order.userId ?? '' }, order.packageId as PlanId, orderSnapshot.id);
      }
    }

    await orderSnapshot.ref.update({
      status: 'paid',
      externalTransactionId: resource?.['id'] ?? null,
      updatedAt: FieldValue.serverTimestamp()
    });
  }

  private async verifyPayPalWebhook(headers: Record<string, string | string[] | undefined>, event: Record<string, any>): Promise<string> {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    const transmissionId = this.headerValue(headers, 'paypal-transmission-id');
    const transmissionTime = this.headerValue(headers, 'paypal-transmission-time');
    const transmissionSig = this.headerValue(headers, 'paypal-transmission-sig');
    const certUrl = this.headerValue(headers, 'paypal-cert-url');
    const authAlgo = this.headerValue(headers, 'paypal-auth-algo');
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (!webhookId || !transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo || !clientId || !clientSecret) {
      throw new BadRequestException('PayPal webhook verification is not configured.');
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
      throw new BadGatewayException('PayPal authentication failed during webhook verification.');
    }
    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!token.access_token) {
      throw new BadGatewayException('PayPal did not return an access token for webhook verification.');
    }

    const response = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: webhookId,
        webhook_event: event
      })
    });
    if (!response.ok) {
      throw new BadGatewayException('PayPal webhook verification request failed.');
    }
    const result = (await response.json()) as { verification_status?: string };
    return result.verification_status ?? '';
  }

  private headerValue(headers: Record<string, string | string[] | undefined>, name: string): string {
    const value = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] ?? '' : value ?? '';
  }

  private async createPayPalOrder(paymentOrderId: string, packageId: PlanId, durationMonths: number, amount: number): Promise<{ id: string; approvalUrl: string }> {
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
    const order = (await orderResponse.json()) as { id?: string; links?: Array<{ href?: string; rel?: string }> };
    const approvalUrl = order.links?.find((link) => link.rel === 'approve')?.href;
    if (!order.id || !approvalUrl) {
      throw new BadGatewayException('PayPal did not return an order ID.');
    }
    return { id: order.id, approvalUrl };
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
