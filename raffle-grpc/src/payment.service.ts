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
  email?: string;
  provider: Provider;
  packageId: PlanId;
  durationMonths?: number;
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

interface MayaCheckoutRecord {
  id?: string;
  requestReferenceNumber?: string;
  status?: string;
  paymentStatus?: string;
  totalAmount?: { value?: number | string; amount?: number | string; currency?: string };
}

const PACKAGE_PRICES: Record<PlanId, number> = {
  basic: 149,
  standard: 599
};

const MONTHLY_SPINS: Record<PlanId, number> = {
  basic: 500,
  standard: 3000
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
      email: user.email ?? '',
      provider: request.provider,
      packageId: request.packageId,
      durationMonths,
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
    await orderRef.update({
      externalOrderId: checkout.checkoutId,
      updatedAt: FieldValue.serverTimestamp()
    });
    return {
      paymentOrderId: orderRef.id,
      paymentId: checkout.checkoutId,
      qrCode: checkout.redirectUrl,
      redirectUrl: checkout.redirectUrl,
      amount,
      discountAmount,
      currency: 'PHP'
    };
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

  getPayPalClientId(): string {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    if (!clientId) {
      throw new InternalServerErrorException('PayPal is not configured on the payment backend.');
    }
    return clientId;
  }

  async capturePayPalOrder(user: AuthenticatedUser, externalOrderId: string): Promise<Record<string, string>> {
    const database = firestore();
    const matches = await database.collection('payment_orders')
      .where('externalOrderId', '==', externalOrderId)
      .limit(1)
      .get();
    if (matches.empty) {
      throw new BadRequestException('The PayPal order could not be found.');
    }

    const orderRef = matches.docs[0].ref;
    const order = matches.docs[0].data() as PaymentOrder & { status: string; externalTransactionId?: string };
    if (order.userId !== user.uid || order.provider !== 'paypal') {
      throw new BadRequestException('This PayPal order does not belong to your account.');
    }
    if (order.status === 'paid') {
      return { status: 'paid' };
    }

    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new InternalServerErrorException('PayPal is not configured on the payment backend.');
    }

    const baseUrl = process.env.PAYPAL_API_BASE_URL ?? 'https://api-m.sandbox.paypal.com';
    const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
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

    const captureResponse = await fetch(`${baseUrl}/v2/checkout/orders/${encodeURIComponent(externalOrderId)}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'Content-Type': 'application/json'
      },
      body: '{}'
    });
    const captureResult = await captureResponse.json() as {
      status?: string;
      purchase_units?: Array<{ payments?: { captures?: Array<{ id?: string; status?: string; amount?: { value?: string } }> } }>;
    };
    if (!captureResponse.ok) {
      throw new BadGatewayException('PayPal could not capture this payment.');
    }

    const capture = captureResult.purchase_units?.[0]?.payments?.captures?.find((item) => item.status === 'COMPLETED');
    const capturedAmount = Number(capture?.amount?.value);
    if (captureResult.status !== 'COMPLETED'
      || !capture?.id
      || !Number.isFinite(capturedAmount)
      || capturedAmount !== Number(order.amount)) {
      throw new BadRequestException('The captured PayPal payment does not match the order amount.');
    }

    const subscriptionId = await this.activatePaidOrder(orderRef, order, capture.id);
    return { status: 'paid', subscriptionId };
  }

  async checkMayaPaymentStatus(user: AuthenticatedUser, paymentOrderId: string): Promise<{ status: 'pending' | 'paid' | 'failed' }> {
    const orderRef = firestore().collection('payment_orders').doc(paymentOrderId);
    const snapshot = await orderRef.get();
    if (!snapshot.exists) {
      throw new BadRequestException('The Maya payment order could not be found.');
    }

    const order = snapshot.data() as PaymentOrder & { status: 'pending' | 'paid' | 'failed'; externalOrderId?: string };
    if (order.userId !== user.uid || order.provider !== 'maya') {
      throw new BadRequestException('This Maya payment order does not belong to your account.');
    }
    if (order.status === 'paid' || order.status === 'failed') {
      return { status: order.status };
    }

    return { status: await this.verifyMayaPayment(orderRef, order) };
  }

  async handleMayaWebhook(event: Record<string, any>): Promise<void> {
    const requestReferenceNumber = event['requestReferenceNumber']
      ?? event['resource']?.['requestReferenceNumber'];
    if (typeof requestReferenceNumber !== 'string' || !requestReferenceNumber) {
      throw new BadRequestException('Maya webhook is missing its merchant reference number.');
    }

    const orderRef = firestore().collection('payment_orders').doc(requestReferenceNumber);
    const snapshot = await orderRef.get();
    if (!snapshot.exists) {
      return;
    }
    const order = snapshot.data() as PaymentOrder & { status: 'pending' | 'paid' | 'failed'; externalOrderId?: string };
    if (order.provider !== 'maya' || order.status !== 'pending') {
      return;
    }

    // Treat the webhook as a signal only; verify the transaction from Maya before activation.
    await this.verifyMayaPayment(orderRef, order);
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
    const order = orderSnapshot.data() as PaymentOrder & { status?: string };
    if (order.provider !== 'paypal' || order.status === 'paid') {
      return;
    }

    const paidAmount = Number(resource?.['amount']?.['value'] ?? resource?.['purchase_units']?.[0]?.['amount']?.['value']);
    if (!Number.isFinite(paidAmount) || paidAmount !== Number(order.amount)) {
      throw new BadRequestException('PayPal payment amount does not match the internal order.');
    }

    await this.activatePaidOrder(orderSnapshot.ref, order, String(resource?.['id'] ?? externalOrderId));
  }

  private async activatePaidOrder(
    orderRef: FirebaseFirestore.DocumentReference,
    order: PaymentOrder,
    externalTransactionId: string
  ): Promise<string> {
    const database = firestore();
    const subscriptionRef = database.collection('subscriptions').doc(orderRef.id);
    const coupon = order.couponCode
      ? await this.findUsableCoupon({ uid: order.userId, email: order.email }, order.couponCode, order.packageId)
      : null;
    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + Math.max(1, Number(order.durationMonths ?? 1)));
    const userRef = database.collection('users').doc(order.userId);

    await database.runTransaction(async (transaction) => {
      const currentOrder = await transaction.get(orderRef);
      if (!currentOrder.exists || currentOrder.data()?.['status'] === 'paid') {
        return;
      }
      const existingSubscription = await transaction.get(subscriptionRef);
      const couponSnapshot = coupon ? await transaction.get(coupon.ref) : null;
      const couponData = couponSnapshot?.data() as CouponRecord | undefined;
      if (coupon && (!couponSnapshot?.exists
        || couponData?.status !== 'active'
        || Number(couponData.redemptionsUsed ?? 0) >= Number(couponData.maxRedemptions ?? 0))) {
        throw new BadRequestException('The promo code has reached its redemption limit.');
      }

      if (!existingSubscription.exists) {
        transaction.set(subscriptionRef, {
          subscriptionId: subscriptionRef.id,
          uid: order.userId,
          email: order.email ?? '',
          planType: order.packageId,
          status: 'active',
          ...(order.couponCode ? { promoCode: order.couponCode } : {}),
          amountPaid: order.amount,
          currency: order.currency,
          isTrial: false,
          startDate: now.toISOString(),
          endDate: endDate.toISOString(),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          paymentOrderId: orderRef.id
        });
      }
      if (coupon && couponSnapshot) {
        transaction.update(coupon.ref, {
          redemptionsUsed: Number(couponData?.redemptionsUsed ?? 0) + 1,
          updatedAt: FieldValue.serverTimestamp()
        });
      }
      transaction.set(userRef, {
        plan: order.packageId,
        spinsRemaining: MONTHLY_SPINS[order.packageId],
        spinPeriod: now.toISOString().slice(0, 7)
      }, { merge: true });
      transaction.update(orderRef, {
        status: 'paid',
        externalTransactionId,
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    return subscriptionRef.id;
  }

  private async verifyMayaPayment(
    orderRef: FirebaseFirestore.DocumentReference,
    order: PaymentOrder & { status: 'pending' | 'paid' | 'failed'; externalOrderId?: string }
  ): Promise<'pending' | 'paid' | 'failed'> {
    if (!order.externalOrderId) {
      return 'pending';
    }

    const checkout = await this.getMayaCheckout(order.externalOrderId);
    if (!checkout || checkout.id !== order.externalOrderId || checkout.requestReferenceNumber !== orderRef.id) {
      return 'pending';
    }

    const paymentStatus = String(checkout.paymentStatus ?? '').toUpperCase();
    if (paymentStatus === 'PAYMENT_SUCCESS') {
      const amount = Number(checkout.totalAmount?.amount ?? checkout.totalAmount?.value);
      if (!Number.isFinite(amount)
        || amount !== Number(order.amount)
        || checkout.totalAmount?.currency !== order.currency) {
        throw new BadRequestException('The Maya payment does not match the order amount or currency.');
      }
      await this.activatePaidOrder(orderRef, order, checkout.id);
      return 'paid';
    }

    if (['PAYMENT_FAILED', 'PAYMENT_EXPIRED', 'PAYMENT_CANCELLED', 'PAYMENT_INVALID'].includes(paymentStatus)
      || String(checkout.status ?? '').toUpperCase() === 'EXPIRED') {
      await orderRef.update({ status: 'failed', updatedAt: FieldValue.serverTimestamp() });
      return 'failed';
    }

    return 'pending';
  }

  private async getMayaCheckout(checkoutId: string): Promise<MayaCheckoutRecord | null> {
    const secretKey = process.env.MAYA_SECRET_KEY;
    if (!secretKey) {
      throw new InternalServerErrorException('Maya payment verification is not configured.');
    }

    const response = await fetch(
      `${this.getMayaApiBaseUrl()}/checkout/v1/checkouts/${encodeURIComponent(checkoutId)}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
          Accept: 'application/json'
        }
      }
    );
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new BadGatewayException('Maya payment status could not be verified.');
    }

    return await response.json() as MayaCheckoutRecord;
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

  private getMayaApiBaseUrl(): string {
    const configuredBaseUrl = process.env.MAYA_API_BASE_URL?.trim();
    if (configuredBaseUrl) {
      return configuredBaseUrl.replace(/\/+$/, '');
    }

    const legacyCheckoutUrl = process.env.MAYA_CHECKOUT_URL?.trim();
    if (legacyCheckoutUrl) {
      return new URL(legacyCheckoutUrl).origin;
    }

    return process.env.MAYA_ENVIRONMENT === 'sandbox'
      ? 'https://pg-sandbox.paymaya.com'
      : 'https://pg.maya.ph';
  }

  private async createMayaCheckout(paymentOrderId: string, packageId: PlanId, durationMonths: number, amount: number): Promise<{ checkoutId: string; redirectUrl: string }> {
    const secretKey = process.env.MAYA_SECRET_KEY;
    if (!secretKey) {
      throw new InternalServerErrorException('Maya is not configured on the payment backend.');
    }

    const response = await fetch(`${this.getMayaApiBaseUrl()}/checkout/v1/checkouts`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requestReferenceNumber: paymentOrderId,
        totalAmount: { value: amount.toFixed(2), currency: 'PHP' },
        items: [{
          name: `Game of Fortunes ${packageId} plan (${durationMonths} month(s))`,
          quantity: '1',
          amount: { value: amount.toFixed(2) },
          totalAmount: { value: amount.toFixed(2) }
        }]
      })
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new BadGatewayException('Maya Checkout rejected the configured secret key. Check that it belongs to the configured Maya environment.');
      }
      throw new BadGatewayException('Maya Checkout could not create this order.');
    }
    const result = await response.json() as { checkoutId?: string; redirectUrl?: string };
    if (!result.checkoutId || !result.redirectUrl) {
      throw new BadGatewayException('Maya did not return a checkout ID and hosted checkout URL.');
    }
    return { checkoutId: result.checkoutId, redirectUrl: result.redirectUrl };
  }
}
