import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { RaffleService } from './raffle.service';
import { FREE_MONTHLY_SPINS } from './plan-schema';

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

  step: 'email' | 'signin' | 'signup' = 'email';
  email = '';
  password = '';
  confirm = '';
  error: string | null = null;
  loading = false;

  private get returnUrl(): string {
    const requestedUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    return requestedUrl?.startsWith('/') ? requestedUrl : '/';
  }

  async continue(): Promise<void> {
    this.error = null;
    if (!this.email.trim()) {
      this.error = 'Please enter an email.';
      return;
    }

    this.loading = true;
    try {
      const methods = await this.raffleService.fetchSignInMethodsForEmail(this.email.trim());
      if (methods.includes('password')) {
        this.step = 'signin';
      } else {
        this.step = 'signup';
      }
    } catch (err) {
      this.error = this.raffleService.getAuthErrorMessage(err, 'Unable to check email.');
    } finally {
      this.loading = false;
    }
  }

  async signInWithGoogle(): Promise<void> {
    this.error = null;
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
