import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Auth } from '@angular/fire/auth';
import { Firestore } from '@angular/fire/firestore';
import { provideRouter } from '@angular/router';
import {
  getPromoCodeErrorMessage,
  isValidSubscriptionDuration,
  PlansPageComponent
} from './plans-page.component';

describe('getPromoCodeErrorMessage', () => {
  it('replaces Firestore permission errors with invalid-code feedback', () => {
    const error = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'permission-denied'
    });

    expect(getPromoCodeErrorMessage(error)).toBe('This promo code is invalid or unavailable.');
  });

  it('preserves useful non-permission error messages', () => {
    expect(getPromoCodeErrorMessage(new Error('The promo code has expired.')))
      .toBe('The promo code has expired.');
  });
});

describe('PlansPageComponent subscription duration', () => {
  let component: PlansPageComponent;
  let fixture: ComponentFixture<PlansPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlansPageComponent],
      providers: [
        provideRouter([]),
        { provide: Auth, useValue: { currentUser: null } },
        { provide: Firestore, useValue: {} }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PlansPageComponent);
    component = fixture.componentInstance;
  });

  it('accepts only whole-number durations from 1 through 12 months', () => {
    expect(isValidSubscriptionDuration(1)).toBeTrue();
    expect(isValidSubscriptionDuration(12)).toBeTrue();
    expect(isValidSubscriptionDuration(0)).toBeFalse();
    expect(isValidSubscriptionDuration(1.5)).toBeFalse();
    expect(isValidSubscriptionDuration(13)).toBeFalse();
  });

  it('shows duration validation and withholds the total and checkout for zero months', async () => {
    component.upgradeOpen = true;
    component.duration = 0;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.duration-error')?.textContent)
      .toContain('Duration must be a whole number between 1 and 12 months.');
    expect(fixture.nativeElement.querySelector('.price-summary').textContent).toContain('Total Due: ₱—');
    expect(fixture.nativeElement.querySelector('.payment-method-tabs')).toBeNull();

    await component.submitUpgrade();

    expect(component.submitted).toBeFalse();
    expect(component.isDurationValid).toBeFalse();
  });

  it('advertises the fixed PHP checkout prices and matches Basic in the upgrade dialog', () => {
    fixture.detectChanges();

    const planCards = fixture.nativeElement.querySelectorAll('.plan-card') as NodeListOf<HTMLElement>;
    expect(planCards[1].textContent).toContain('₱149/month');
    expect(planCards[2].textContent).toContain('₱599/month');
    expect(planCards[3].textContent).toContain('₱1,799/month');
    expect(fixture.nativeElement.querySelector('.exchange-note').textContent)
      .toContain('PHP prices shown are the fixed monthly checkout amounts.');

    component.openUpgrade('basic');
    component.paymentMethod = 'maya';
    fixture.detectChanges();

    const summary = fixture.nativeElement.querySelector('.price-summary').textContent as string;
    expect(summary).toContain('Plan Price: ₱149');
    expect(summary).toContain('Total Due: ₱149');
  });
});
