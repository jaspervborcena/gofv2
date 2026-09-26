import { CommonModule } from '@angular/common';
import { AfterViewChecked, Component, ElementRef, OnDestroy, NgZone, ViewChild, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { loadScript, PayPalButtonsComponent } from '@paypal/paypal-js';
import QRCode from 'qrcode';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-plans-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './plans-page.component.html',
  styleUrl: './plans-page.component.scss'
})
export class PlansPageComponent implements AfterViewChecked, OnDestroy {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly zone = inject(NgZone);
  @ViewChild('paypalButtonContainer') private paypalButtonContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('cardButtonContainer') private cardButtonContainer?: ElementRef<HTMLDivElement>;
  private paypalButtons: PayPalButtonsComponent[] = [];
  private paypalRenderStarted = false;
  private closeDialogTimer?: number;
  private mayaStatusTimer?: number;
  private mayaStatusCheckInFlight = false;
  paymentMethod: 'paypal' | 'maya' = 'paypal';
  mayaQrImage = '';
  mayaCheckoutLoading = false;
  mayaPaymentOrderId = '';
  mayaStatusMessage = '';
  selectedPlan: 'basic' | 'standard' = 'basic';
  duration = 1;
  promoCode = '';
  referralCode = '';
  upgradeOpen = false;
  submitted = false;
  successMessage = '';
  loading = false;
  errorMessage = '';
  couponMessage = '';
  couponValid = false;
  couponDiscount = 0;

  ngAfterViewChecked(): void {
    if (this.upgradeOpen
      && !(this.couponValid && this.totalPrice === 0)
      && !this.submitted
      && this.paymentMethod === 'paypal'
      && !this.paypalRenderStarted
      && this.paypalButtonContainer
      && this.cardButtonContainer) {
      this.paypalRenderStarted = true;
      void this.renderPayPalButtons();
    }
  }

  ngOnDestroy(): void {
    this.clearCloseDialogTimer();
    this.stopMayaPaymentPolling();
    this.destroyPayPalButtons();
  }

  get planName(): string {
    return this.selectedPlan === 'basic' ? 'Basic' : 'Standard';
  }

  get monthlyPrice(): number {
    return this.selectedPlan === 'basic' ? 149 : 599;
  }

  get totalPrice(): number {
    const baseTotal = this.monthlyPrice * Math.max(1, this.duration);
    return this.couponValid ? Math.max(0, baseTotal - this.couponDiscount) : baseTotal;
  }

  openUpgrade(plan: 'basic' | 'standard'): void {
    this.clearCloseDialogTimer();
    this.stopMayaPaymentPolling();
    this.destroyPayPalButtons();
    this.paypalRenderStarted = false;
    this.paymentMethod = 'paypal';
    this.mayaQrImage = '';
    this.mayaPaymentOrderId = '';
    this.mayaStatusMessage = '';
    this.selectedPlan = plan;
    this.duration = 1;
    this.submitted = false;
    this.successMessage = '';
    this.errorMessage = '';
    this.couponMessage = '';
    this.couponValid = false;
    this.couponDiscount = 0;
    this.upgradeOpen = true;
  }

  closeUpgrade(): void {
    this.clearCloseDialogTimer();
    this.stopMayaPaymentPolling();
    this.upgradeOpen = false;
    this.destroyPayPalButtons();
    this.paypalRenderStarted = false;
  }

  clearCoupon(): void {
    this.couponValid = false;
    this.couponDiscount = 0;
    this.couponMessage = '';
    this.destroyPayPalButtons();
    this.paypalRenderStarted = false;
    this.stopMayaPaymentPolling();
    this.mayaQrImage = '';
    this.mayaPaymentOrderId = '';
    this.mayaStatusMessage = '';
  }

  selectPaymentMethod(method: 'paypal' | 'maya'): void {
    this.paymentMethod = method;
    this.errorMessage = '';
    if (method === 'maya') {
      this.stopMayaPaymentPolling();
      this.destroyPayPalButtons();
      this.paypalRenderStarted = false;
      return;
    }
    this.stopMayaPaymentPolling();
    this.mayaQrImage = '';
    this.mayaPaymentOrderId = '';
    this.mayaStatusMessage = '';
    this.paypalRenderStarted = false;
  }

  async createMayaCheckout(): Promise<void> {
    if (this.mayaCheckoutLoading || this.submitted) {
      return;
    }
    this.mayaCheckoutLoading = true;
    this.errorMessage = '';
    this.stopMayaPaymentPolling();
    this.mayaQrImage = '';
    this.mayaPaymentOrderId = '';
    this.mayaStatusMessage = '';
    try {
      const response = await fetch(`${environment.paymentApiUrl}/payments/maya/checkout`, {
        method: 'POST',
        headers: await this.paymentHeaders(),
        body: JSON.stringify({
          packageId: this.selectedPlan,
          durationMonths: Math.min(12, Math.max(1, Math.floor(Number(this.duration) || 1))),
          promoCode: this.promoCode.trim(),
          referralCode: this.referralCode.trim()
        })
      });
      const result = await response.json() as { qrCode?: string; paymentOrderId?: string; message?: string };
      if (!response.ok || !result.qrCode || !result.paymentOrderId) {
        throw new Error(result.message ?? 'Maya checkout could not be started.');
      }
      this.mayaQrImage = result.qrCode.startsWith('data:image/')
        ? result.qrCode
        : await QRCode.toDataURL(result.qrCode, { width: 240, margin: 1 });
      this.mayaPaymentOrderId = result.paymentOrderId;
      this.mayaStatusMessage = 'Waiting for Maya payment confirmation…';
      this.startMayaPaymentPolling();
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Maya checkout could not be started.';
    } finally {
      this.mayaCheckoutLoading = false;
    }
  }

  async applyPromoCode(): Promise<void> {
    const code = this.promoCode.trim();
    const user = this.auth.currentUser;
    if (!code) {
      this.couponMessage = 'Enter a promo code first.';
      this.couponValid = false;
      return;
    }
    if (!user) {
      this.couponMessage = 'Please sign in before applying a promo code.';
      this.couponValid = false;
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    try {
      const couponSnapshot = await getDoc(doc(this.firestore, 'coupons', code.toUpperCase()));
      if (!couponSnapshot.exists()) {
        throw new Error('This promo code is invalid.');
      }
      const result = couponSnapshot.data() as {
        product?: string;
        appliesTo?: { plan?: string };
        description?: string;
        durationDays?: number;
        discountAmount?: number;
        maxRedemptions?: number;
        redemptionsUsed?: number;
        restrictions?: { region?: string };
        status?: string;
        validUntil?: { toDate?: () => Date } | string;
      };
      const validUntil = typeof result.validUntil === 'object' && typeof result.validUntil.toDate === 'function'
        ? result.validUntil.toDate()
        : new Date(String(result.validUntil ?? ''));
      const isValid = result.product === 'game-of-fortunes'
        && result.appliesTo?.plan === 'monthly'
        && result.status === 'active'
        && Number(result.redemptionsUsed ?? 0) < Number(result.maxRedemptions ?? 0)
        && Number.isFinite(validUntil.getTime())
        && validUntil.getTime() > Date.now()
        && (!result.restrictions?.region || result.restrictions.region === 'PH');
      if (!isValid) {
        throw new Error('This promo code is invalid or unavailable.');
      }
      this.couponValid = true;
      this.couponDiscount = Math.max(0, Number(result.discountAmount ?? 0));
      this.destroyPayPalButtons();
      this.paypalRenderStarted = false;
      const discountMessage = this.couponDiscount >= this.monthlyPrice * Math.max(1, this.duration)
        ? `${result.durationDays ?? 30} days free.`
        : `₱${this.couponDiscount} discount applied.`;
      this.couponMessage = `✓ Coupon valid: ${result.description ?? 'Discount applied'} — ${discountMessage}`;
    } catch (error) {
      this.couponValid = false;
      this.couponDiscount = 0;
      this.couponMessage = error instanceof Error ? error.message : 'This promo code is invalid.';
    } finally {
      this.loading = false;
    }
  }

  async submitUpgrade(): Promise<void> {
    if (this.loading) {
      return;
    }

    if (!(this.couponValid && this.totalPrice === 0)) {
      this.errorMessage = 'Use the PayPal or debit/credit card button above to pay.';
      return;
    }

    const user = this.auth.currentUser;
    if (!user) {
      this.errorMessage = 'Please sign in before starting checkout.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.submitted = false;
    this.successMessage = '';
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${environment.paymentApiUrl}/payments/paypal/order`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          packageId: this.selectedPlan,
          durationMonths: Math.min(12, Math.max(1, Math.floor(Number(this.duration) || 1))),
          promoCode: this.promoCode.trim(),
          referralCode: this.referralCode.trim()
        })
      });
      const result = await response.json() as { approvalUrl?: string; status?: string; message?: string };
      if (!response.ok) {
        throw new Error(result.message ?? 'PayPal checkout could not be started.');
      }

      if (result.status === 'paid') {
        this.showPaymentSuccess('Coupon applied. Your subscription is active for 30 days.');
        return;
      }
      if (!result.approvalUrl) {
        throw new Error('PayPal checkout could not be started.');
      }

      window.location.assign(result.approvalUrl);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'PayPal checkout could not be started.';
    } finally {
      this.loading = false;
    }
  }

  private async renderPayPalButtons(): Promise<void> {
    const user = this.auth.currentUser;
    const paypalHost = this.paypalButtonContainer?.nativeElement;
    const cardHost = this.cardButtonContainer?.nativeElement;
    if (!user || !paypalHost || !cardHost) {
      this.paymentButtonsError('Sign in to load PayPal and card checkout.');
      return;
    }

    try {
      const headers = await this.paymentHeaders();
      const configResponse = await fetch(`${environment.paymentApiUrl}/payments/paypal/config`, { headers });
      const config = await configResponse.json() as { clientId?: string; message?: string };
      if (!configResponse.ok || !config.clientId) {
        throw new Error(config.message ?? 'PayPal checkout is not configured.');
      }

      const paypal = await loadScript({
        clientId: config.clientId,
        currency: 'PHP',
        intent: 'capture',
        components: ['buttons']
      });
      if (!paypal?.Buttons || !paypal.FUNDING || !this.upgradeOpen) {
        return;
      }

      const sharedOptions = {
        createOrder: () => this.createPayPalOrder(),
        onApprove: (data: { orderID: string }) => this.capturePayPalOrder(data.orderID),
        onError: (error: Record<string, unknown>) => {
          this.paymentButtonsError(String(error['message'] ?? 'PayPal checkout could not be completed.'));
        },
        style: { layout: 'vertical' as const, shape: 'rect' as const, height: 48, tagline: false }
      };
      const paypalButton = paypal.Buttons({ ...sharedOptions, fundingSource: paypal.FUNDING['PAYPAL'] });
      const cardButton = paypal.Buttons({
        ...sharedOptions,
        fundingSource: paypal.FUNDING['CARD'],
        style: { ...sharedOptions.style, label: 'pay' }
      });

      if (!paypalButton.isEligible()) {
        throw new Error('PayPal checkout is not available for this account or region.');
      }
      await paypalButton.render(paypalHost);
      this.paypalButtons.push(paypalButton);

      if (cardButton.isEligible()) {
        await cardButton.render(cardHost);
        this.paypalButtons.push(cardButton);
      } else {
        cardHost.textContent = 'Card checkout is not available for this account or region.';
      }
    } catch (error) {
      this.paymentButtonsError(error instanceof Error ? error.message : 'PayPal checkout could not be loaded.');
    }
  }

  private async createPayPalOrder(): Promise<string> {
    const headers = await this.paymentHeaders();
    const response = await fetch(`${environment.paymentApiUrl}/payments/paypal/order`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        packageId: this.selectedPlan,
        durationMonths: Math.min(12, Math.max(1, Math.floor(Number(this.duration) || 1))),
        promoCode: this.promoCode.trim(),
        referralCode: this.referralCode.trim()
      })
    });
    const result = await response.json() as { orderId?: string; status?: string; message?: string };
    if (!response.ok || !result.orderId) {
      throw new Error(result.message ?? 'PayPal order could not be created.');
    }
    return result.orderId;
  }

  private async capturePayPalOrder(orderId: string): Promise<void> {
    this.zone.run(() => {
      this.loading = true;
      this.errorMessage = '';
    });
    try {
      const response = await fetch(`${environment.paymentApiUrl}/payments/paypal/capture`, {
        method: 'POST',
        headers: await this.paymentHeaders(),
        body: JSON.stringify({ orderId })
      });
      const result = await response.json() as { status?: string; message?: string };
      if (!response.ok || result.status !== 'paid') {
        throw new Error(result.message ?? 'Payment could not be confirmed.');
      }
      this.zone.run(() => {
        this.paypalRenderStarted = false;
        this.destroyPayPalButtons();
        this.showPaymentSuccess('Payment complete. Your subscription is active.');
      });
    } catch (error) {
      this.paymentButtonsError(error instanceof Error ? error.message : 'Payment could not be confirmed.');
    } finally {
      this.zone.run(() => this.loading = false);
    }
  }

  private async paymentHeaders(): Promise<HeadersInit> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('Please sign in before starting checkout.');
    }
    return {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json'
    };
  }

  private startMayaPaymentPolling(): void {
    this.stopMayaPaymentPolling();
    void this.checkMayaPaymentStatus();
    this.mayaStatusTimer = window.setInterval(() => void this.checkMayaPaymentStatus(), 5000);
  }

  private stopMayaPaymentPolling(): void {
    if (this.mayaStatusTimer !== undefined) {
      window.clearInterval(this.mayaStatusTimer);
      this.mayaStatusTimer = undefined;
    }
  }

  private async checkMayaPaymentStatus(): Promise<void> {
    if (!this.mayaPaymentOrderId || this.mayaStatusCheckInFlight || !this.upgradeOpen) {
      return;
    }

    this.mayaStatusCheckInFlight = true;
    try {
      const response = await fetch(
        `${environment.paymentApiUrl}/payments/maya/orders/${encodeURIComponent(this.mayaPaymentOrderId)}/status`,
        { method: 'POST', headers: await this.paymentHeaders(), body: '{}' }
      );
      const result = await response.json() as { status?: 'pending' | 'paid' | 'failed'; message?: string };
      if (!response.ok) {
        throw new Error(result.message ?? 'Maya payment status could not be checked.');
      }
      if (result.status === 'paid') {
        this.zone.run(() => {
          this.stopMayaPaymentPolling();
          this.destroyPayPalButtons();
          this.showPaymentSuccess('Maya payment complete. Your subscription is active.');
        });
      } else if (result.status === 'failed') {
        this.zone.run(() => {
          this.stopMayaPaymentPolling();
          this.mayaStatusMessage = 'Maya did not complete this payment. Generate a new QR to try again.';
        });
      }
    } catch (error) {
      this.zone.run(() => {
        this.mayaStatusMessage = error instanceof Error
          ? error.message
          : 'Maya payment status could not be checked. Retrying…';
      });
    } finally {
      this.mayaStatusCheckInFlight = false;
    }
  }

  private paymentButtonsError(message: string): void {
    this.zone.run(() => this.errorMessage = message);
  }

  private showPaymentSuccess(message: string): void {
    this.clearCloseDialogTimer();
    this.submitted = true;
    this.successMessage = message;
    this.closeDialogTimer = window.setTimeout(() => {
      this.zone.run(() => this.closeUpgrade());
    }, 3000);
  }

  private clearCloseDialogTimer(): void {
    if (this.closeDialogTimer !== undefined) {
      window.clearTimeout(this.closeDialogTimer);
      this.closeDialogTimer = undefined;
    }
  }

  private destroyPayPalButtons(): void {
    this.paypalButtons.forEach((button) => void button.close().catch(() => undefined));
    this.paypalButtons = [];
    this.paypalButtonContainer?.nativeElement.replaceChildren();
    this.cardButtonContainer?.nativeElement.replaceChildren();
  }
}
