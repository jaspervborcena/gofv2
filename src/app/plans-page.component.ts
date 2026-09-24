import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-plans-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './plans-page.component.html',
  styleUrl: './plans-page.component.scss'
})
export class PlansPageComponent {
  selectedPlan: 'basic' | 'standard' = 'basic';
  duration = 1;
  promoCode = '';
  referralCode = '';
  paymentMethod: 'maya' | 'paypal' = 'paypal';
  upgradeOpen = false;
  submitted = false;

  get planName(): string {
    return this.selectedPlan === 'basic' ? 'Basic' : 'Standard';
  }

  get monthlyPrice(): number {
    return this.selectedPlan === 'basic' ? 60 : 599;
  }

  get totalPrice(): number {
    return this.monthlyPrice * Math.max(1, this.duration);
  }

  openUpgrade(plan: 'basic' | 'standard'): void {
    this.selectedPlan = plan;
    this.duration = 1;
    this.submitted = false;
    this.upgradeOpen = true;
  }

  closeUpgrade(): void {
    this.upgradeOpen = false;
  }

  submitUpgrade(): void {
    this.submitted = true;
  }
}
