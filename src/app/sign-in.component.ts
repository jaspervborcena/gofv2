import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RaffleService } from './raffle.service';

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

  step: 'email' | 'signin' | 'signup' = 'email';
  email = '';
  password = '';
  confirm = '';
  error: string | null = null;
  loading = false;

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
      this.error = err instanceof Error ? err.message : 'Unable to check email.';
    } finally {
      this.loading = false;
    }
  }

  async signIn(): Promise<void> {
    this.error = null;
    if (!this.password) {
      this.error = 'Please enter your password.';
      return;
    }

    this.loading = true;
    try {
      await this.raffleService.signInWithEmail(this.email.trim(), this.password);
      this.router.navigate(['/']);
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Sign in failed.';
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
      await this.raffleService.signUpWithEmail(this.email.trim(), this.password);
      this.router.navigate(['/']);
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Sign up failed.';
    } finally {
      this.loading = false;
    }
  }
}
