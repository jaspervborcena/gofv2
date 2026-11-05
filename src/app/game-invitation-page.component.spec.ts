import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { GameInvitationPageComponent } from './game-invitation-page.component';
import { Raffle, RaffleService } from './raffle.service';

describe('GameInvitationPageComponent', () => {
  let component: GameInvitationPageComponent;
  let fixture: ComponentFixture<GameInvitationPageComponent>;
  let joinInvitationRaffle: jasmine.Spy;

  beforeEach(async () => {
    joinInvitationRaffle = jasmine.createSpy().and.resolveTo(2);

    await TestBed.configureTestingModule({
      imports: [GameInvitationPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: RaffleService,
          useValue: {
            user$: of({ uid: 'invitee' }),
            findUserParticipantForGame: async () => null,
            saveUserFullName: async () => undefined,
            joinInvitationRaffle,
            watchActiveSpin: () => () => undefined,
            getFirestoreErrorMessage: (error: unknown, fallback: string) =>
              error instanceof Error ? error.message : fallback
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(GameInvitationPageComponent);
    component = fixture.componentInstance;
    component.game = {
      id: 'game-uid',
      gameId: 'game',
      gameUid: 'game-uid',
      name: 'QA raffle',
      creatorId: 'host',
      mode: 'simultaneous',
      numberMode: 'ordered',
      digitCount: 3,
      players: [],
      history: [],
      remainingDraws: 1,
      createdAt: '2026-11-05T00:00:00.000Z',
      startAt: '2026-11-05T00:00:00.000Z',
      closeAt: '2026-11-12T00:00:00.000Z',
      closedAt: '2026-11-12T00:00:00.000Z'
    } satisfies Raffle;
    component.name = 'Invite Frank QA';
  });

  it('uses the ticket number atomically allocated by the server', async () => {
    await component.acceptInvitation();

    expect(joinInvitationRaffle).toHaveBeenCalledWith(component.game, {
      name: 'Invite Frank QA'
    });
    expect(component.assignedNumber).toBe('002');
  });

  it('reports a custom number conflict returned by the server', async () => {
    component.useCustomNumber = true;
    component.customNumber = '1';
    joinInvitationRaffle.and.rejectWith(new Error('The number 001 is already in use.'));

    await component.acceptInvitation();

    expect(joinInvitationRaffle).toHaveBeenCalledWith(component.game, {
      name: 'Invite Frank QA',
      customNumber: 1
    });
    expect(component.errorMessage).toBe('The number 001 is already in use.');
  });
});
