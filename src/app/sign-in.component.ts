import { Component, inject } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { RaffleService } from './raffle.service';
import { FREE_MONTHLY_SPINS } from './plan-schema';

const LEGAL_ACCEPTANCE_STORAGE_KEY = 'gof-legal-acceptance';
const LEGAL_POLICY_VERSION = 'draft-1';

@Component({
  selector: 'app-sign-in',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sign-in.component.html',
  styleUrls: ['./sign-in.component.scss']
})
export class SignInComponent {
  private readonly raffleService = inject(RaffleService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);

  step: 'email' | 'signin' | 'signup' = 'email';
  privacyAccepted = false;
  termsAccepted = false;
  consentAccepted = false;
  email = '';
  password = '';
  confirm = '';
  error: string | null = null;
  loading = false;

  constructor() {
    this.consentAccepted = this.hasStoredLegalAcceptance();
  }

  private get returnUrl(): string {
    const requestedUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    return requestedUrl?.startsWith('/') ? requestedUrl : '/';
  }

  acceptPolicies(): void {
    if (!this.privacyAccepted || !this.termsAccepted) {
      return;
    }

    this.error = null;
    this.consentAccepted = true;
    try {
      this.document.defaultView?.localStorage.setItem(LEGAL_ACCEPTANCE_STORAGE_KEY, JSON.stringify({
        version: LEGAL_POLICY_VERSION,
        privacy: true,
        terms: true,
        acceptedAt: new Date().toISOString()
      }));
    } catch {
      // Keep consent for the current session if browser storage is unavailable.
    }
  }

  private hasStoredLegalAcceptance(): boolean {
    try {
      const storedValue = this.document.defaultView?.localStorage.getItem(LEGAL_ACCEPTANCE_STORAGE_KEY);
      const acceptance = storedValue ? JSON.parse(storedValue) as { version?: string; privacy?: boolean; terms?: boolean } : null;
      return acceptance?.version === LEGAL_POLICY_VERSION && acceptance.privacy === true && acceptance.terms === true;
    } catch {
      return false;
    }
  }

  private requireLegalAcceptance(): boolean {
    if (this.consentAccepted) {
      return true;
    }

    this.error = 'Please review and accept both policies before continuing.';
    return false;
  }

  async continue(): Promise<void> {
    this.error = null;
    if (!this.requireLegalAcceptance()) {
      return;
    }

    if (!this.email.trim()) {
      this.error = 'Please enter an email.';
      return;
    }

    this.step = 'signup';
  }

  async signInWithGoogle(): Promise<void> {
    this.error = null;
    if (!this.requireLegalAcceptance()) {
      return;
    }

    this.loading = true;

    try {
      await this.raffleService.signInWithGoogle();
      await this.router.navigateByUrl(this.returnUrl);
    } catch (err) {
      this.error = this.raffleService.getAuthErrorMessage(err, 'Google sign in failed.');
    } finally {
      this.loading = false;
    }
  }

  async signIn(): Promise<void> {
    this.error = null;
    if (!this.requireLegalAcceptance()) {
      return;
    }

    if (!this.email.trim()) {
      this.error = 'Please enter an email.';
      return;
    }
    if (!this.password) {
      this.error = 'Please enter your password.';
      return;
    }

    this.loading = true;
    try {
      await this.raffleService.signInWithEmail(this.email.trim(), this.password);
      await this.router.navigateByUrl(this.returnUrl);
    } catch (err) {
      this.error = this.raffleService.getAuthErrorMessage(err, 'Sign in failed.');
    } finally {
      this.loading = false;
    }
  }

  async signUp(): Promise<void> {
    this.error = null;
    if (!this.requireLegalAcceptance()) {
      return;
    }

    if (!this.password || !this.confirm) {
      this.error = 'Please fill password and confirm password.';
      return;
    }
    if (this.password !== this.confirm) {
      this.error = 'Passwords do not match.';
      return;
    }

    this.loading = true;
    try {
      const credential = await this.raffleService.signUpWithEmail(this.email.trim(), this.password);
      const now = new Date().toISOString();
      await this.raffleService.saveUserProfile({
        id: credential.user.uid,
        uid: credential.user.uid,
        displayName: credential.user.displayName ?? '',
        email: credential.user.email ?? this.email.trim(),
        role: 'guest',
        plan: 'free',
        playersCount: 0,
        spinsRemaining: FREE_MONTHLY_SPINS,
        spinPeriod: new Date().toISOString().slice(0, 7),
        createdAt: now,
        lastActiveAt: now
      });
      await this.router.navigateByUrl(this.returnUrl);
    } catch (err) {
      this.error = this.raffleService.getAuthErrorMessage(err, 'Sign up failed.');
    } finally {
      this.loading = false;
    }
  }
}
