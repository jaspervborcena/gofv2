import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-plans-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './plans-page.component.html',
  styleUrl: './plans-page.component.scss'
})
export class PlansPageComponent {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  selectedPlan: 'basic' | 'standard' = 'basic';
  duration = 1;
  promoCode = '';
  referralCode = '';
  paymentMethod: 'maya' | 'paypal' = 'paypal';
  upgradeOpen = false;
  submitted = false;
  successMessage = '';
  loading = false;
  errorMessage = '';
  couponMessage = '';
  couponValid = false;
  couponDiscount = 0;

  get planName(): string {
    return this.selectedPlan === 'basic' ? 'Basic' : 'Standard';
  }

  get monthlyPrice(): number {
    return this.selectedPlan === 'basic' ? 60 : 599;
  }

  get totalPrice(): number {
    const baseTotal = this.monthlyPrice * Math.max(1, this.duration);
    return this.couponValid ? Math.max(0, baseTotal - this.couponDiscount) : baseTotal;
  }

  openUpgrade(plan: 'basic' | 'standard'): void {
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
    this.upgradeOpen = false;
  }

  clearCoupon(): void {
    this.couponValid = false;
    this.couponDiscount = 0;
    this.couponMessage = '';
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

    if (this.paymentMethod !== 'paypal') {
      this.errorMessage = 'Maya checkout is not connected yet. Please choose PayPal.';
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
        this.submitted = true;
        this.successMessage = 'Coupon applied. Your subscription is active for 30 days.';
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
}
