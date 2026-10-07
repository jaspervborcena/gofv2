import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AppComponent } from './app.component';
import { RaffleService } from './raffle.service';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let userSubject: BehaviorSubject<{ uid: string; displayName: string | null; email: string | null; photoURL?: string | null } | null>;

  beforeEach(async () => {
    localStorage.removeItem('gof-theme');
    document.documentElement.removeAttribute('data-theme');
    userSubject = new BehaviorSubject<{ uid: string; displayName: string | null; email: string | null; photoURL?: string | null } | null>(null);

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        {
          provide: RaffleService,
          useValue: {
            user$: userSubject.asObservable(),
            raffleSpinning: () => false,
            signOut: jasmine.createSpy('signOut'),
            getCurrentUserPlan: jasmine.createSpy('getCurrentUserPlan').and.resolveTo('free'),
            ensureUserSpinFields: jasmine.createSpy('ensureUserSpinFields').and.resolveTo(undefined),
            syncAuthenticatedUserProfile: jasmine.createSpy('syncAuthenticatedUserProfile').and.resolveTo(undefined),
            getUserGreetingName: jasmine.createSpy('getUserGreetingName').and.resolveTo(''),
            getUserProfileSummary: jasmine.createSpy('getUserProfileSummary').and.resolveTo({
              uid: 'abc123',
              fullName: 'Player Example',
              nickname: '',
              email: 'player@example.com',
              phoneNumber: '',
              role: 'Player',
              planName: 'Free',
              spinsRemaining: 25,
              monthlySpinLimit: 25,
              gamesHosted: 0,
              gamesParticipated: 0,
              statsAvailable: true,
              wins: 0,
              losses: 0
            })
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
  });

  it('should create the app', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the router outlet for the landing and game pages', () => {
    const outlet = fixture.nativeElement.querySelector('router-outlet');
    expect(outlet).not.toBeNull();
  });

  it('should use the email local part when display name is missing', () => {
    userSubject.next({ uid: 'abc123', displayName: null, email: 'player@gmail.com' });
    fixture.detectChanges();

    const welcome = fixture.nativeElement.querySelector('.welcome');
    expect(welcome.textContent).toContain('Welcome player!');
  });

  it('should show the signed-in email and UID in the profile', async () => {
    userSubject.next({ uid: 'abc123', displayName: null, email: 'player@gmail.com' });

    await fixture.componentInstance.toggleProfile();
    fixture.detectChanges();

    const details = fixture.nativeElement.querySelector('.profile-details').textContent;
    expect(details).toContain('player@example.com');
    expect(details).toContain('abc123');
  });

  it('should show user initials if the profile photo fails to load', () => {
    userSubject.next({
      uid: 'abc123',
      displayName: 'Pogi Ako',
      email: 'pogi@example.com',
      photoURL: 'https://example.invalid/avatar.jpg'
    });
    fixture.detectChanges();

    const avatar = fixture.nativeElement.querySelector('.profile-trigger img') as HTMLImageElement;
    expect(avatar).not.toBeNull();

    avatar.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.profile-trigger img')).toBeNull();
    expect(fixture.nativeElement.querySelector('.profile-trigger span').textContent.trim()).toBe('PA');
  });

  it('should toggle and persist the selected theme', () => {
    const toggle = fixture.nativeElement.querySelector('.theme-toggle') as HTMLButtonElement;

    toggle.click();
    fixture.detectChanges();

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('gof-theme')).toBe('light');
    expect(toggle.getAttribute('aria-label')).toBe('Switch to dark mode');

    toggle.click();
    fixture.detectChanges();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('gof-theme')).toBe('dark');
  });
});
