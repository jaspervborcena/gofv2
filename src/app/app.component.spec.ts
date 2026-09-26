import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AppComponent } from './app.component';
import { RaffleService } from './raffle.service';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let userSubject: BehaviorSubject<{ uid: string; displayName: string | null; email: string | null } | null>;

  beforeEach(async () => {
    userSubject = new BehaviorSubject<{ uid: string; displayName: string | null; email: string | null } | null>(null);

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        {
          provide: RaffleService,
          useValue: {
            user$: userSubject.asObservable(),
            signOut: jasmine.createSpy('signOut'),
            getCurrentUserPlan: jasmine.createSpy('getCurrentUserPlan').and.resolveTo('free'),
            ensureUserSpinFields: jasmine.createSpy('ensureUserSpinFields').and.resolveTo(undefined),
            getUserProfileSummary: jasmine.createSpy('getUserProfileSummary').and.resolveTo({
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
});
