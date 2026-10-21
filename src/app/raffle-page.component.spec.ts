import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RafflePageComponent } from './raffle-page.component';
import { RaffleService } from './raffle.service';

describe('RafflePageComponent', () => {
  let component: RafflePageComponent;
  let fixture: ComponentFixture<RafflePageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RafflePageComponent],
      providers: [
        provideRouter([]),
        {
          provide: RaffleService,
          useValue: {
            setRaffleSpinning: () => undefined,
            consumeSpin: async () => ({ allowed: true, spinsRemaining: 1 }),
            currentUserId: null,
            isRaffleActive: () => true,
            findRaffle: async () => null,
            findUserParticipantForGame: async () => null,
            getCurrentUserPlan: async () => 'free',
            listParticipants: async () => [],
            saveRaffleIfPersisted: async () => undefined,
            raffleSpinning: () => false,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RafflePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the preview raffle when no game id is supplied', () => {
    expect(component.raffle).toBeTruthy();
    expect(component.isPreviewRaffle).toBeTrue();
  });

  it('keeps phone numbers and remarks hidden until their columns are revealed', () => {
    expect(component.phoneNumbersVisible).toBeFalse();
    expect(component.participantRemarksVisible).toBeFalse();

    component.togglePhoneNumbersVisibility();
    expect(component.phoneNumbersVisible).toBeTrue();
    expect(component.participantRemarksVisible).toBeFalse();

    component.toggleParticipantRemarksVisibility();
    expect(component.participantRemarksVisible).toBeTrue();
  });
});
