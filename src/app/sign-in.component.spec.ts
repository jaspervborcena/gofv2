import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { RaffleService } from './raffle.service';
import { SignInComponent } from './sign-in.component';

describe('SignInComponent', () => {
  let fixture: ComponentFixture<SignInComponent>;
  let raffleService: {
    signInWithGoogle: jasmine.Spy;
    signInWithEmail: jasmine.Spy;
    signUpWithEmail: jasmine.Spy;
    getAuthErrorMessage: jasmine.Spy;
  };

  beforeEach(async () => {
    localStorage.removeItem('gof-legal-acceptance');
    raffleService = {
      signInWithGoogle: jasmine.createSpy('signInWithGoogle').and.resolveTo(undefined),
      signInWithEmail: jasmine.createSpy('signInWithEmail').and.resolveTo(undefined),
      signUpWithEmail: jasmine.createSpy('signUpWithEmail'),
      getAuthErrorMessage: jasmine.createSpy('getAuthErrorMessage').and.returnValue('Sign in failed.')
    };

    await TestBed.configureTestingModule({
      imports: [SignInComponent],
      providers: [
        provideRouter([]),
        { provide: RaffleService, useValue: raffleService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: () => null } } }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SignInComponent);
    fixture.detectChanges();
  });

  it('requires both policy checkboxes before showing authentication actions', () => {
    expect(fixture.nativeElement.querySelector('.consent-gate')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.google-btn')).toBeNull();
    expect(fixture.nativeElement.querySelector('.consent-continue').disabled).toBeTrue();
  });

  it('accepts and persists both policies before continuing', () => {
    const checkboxes = fixture.nativeElement.querySelectorAll('input[type="checkbox"]');
    checkboxes[0].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.consent-continue').disabled).toBeTrue();

    checkboxes[1].click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.consent-continue').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.consent-gate')).toBeNull();
    expect(fixture.nativeElement.querySelector('.google-btn')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem('gof-legal-acceptance') ?? '{}').terms).toBeTrue();
  });

  it('blocks authentication methods before policy acceptance', async () => {
    await fixture.componentInstance.signInWithGoogle();

    expect(raffleService.signInWithGoogle).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error).toContain('accept both policies');
  });
});