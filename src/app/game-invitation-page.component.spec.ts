import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { GameInvitationPageComponent } from './game-invitation-page.component';
import { ParticipantRecord, Raffle, RaffleService } from './raffle.service';

describe('GameInvitationPageComponent', () => {
  let component: GameInvitationPageComponent;
  let fixture: ComponentFixture<GameInvitationPageComponent>;
  let listParticipants: jasmine.Spy;
  let joinRaffle: jasmine.Spy;
  let participants: ParticipantRecord[];

  beforeEach(async () => {
    participants = [{
      id: 'game-alice',
      gameId: 'game',
      gameUid: 'game-uid',
      userId: 'alice',
      name: 'Alice QA',
      assignedNumber: 1,
      status: 'active',
      joinedAt: '2026-11-05T00:00:00.000Z'
    }];
    listParticipants = jasmine.createSpy().and.callFake(async () => participants);
    joinRaffle = jasmine.createSpy().and.resolveTo(undefined);

    await TestBed.configureTestingModule({
      imports: [GameInvitationPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: RaffleService,
          useValue: {
            user$: of({ uid: 'invitee' }),
            findUserParticipantForGame: async () => null,
            listParticipants,
            saveUserFullName: async () => undefined,
            joinRaffle,
            watchActiveSpin: () => () => undefined,
            getFirestoreErrorMessage: (_error: unknown, fallback: string) => fallback
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

  it('assigns the next ordered number after persisted participants', async () => {
    await component.acceptInvitation();

    expect(listParticipants).toHaveBeenCalledWith('game-uid');
    expect(joinRaffle).toHaveBeenCalledWith(component.game, jasmine.objectContaining({
      name: 'Invite Frank QA',
      assignedNumber: 2
    }));
    expect(component.assignedNumber).toBe('002');
  });

  it('rejects a custom number already held by a persisted participant', async () => {
    component.useCustomNumber = true;
    component.customNumber = '1';

    await component.acceptInvitation();

    expect(joinRaffle).not.toHaveBeenCalled();
    expect(component.errorMessage).toBe('The number 001 is already in use.');
  });

  it('reports when every random ticket number is already occupied', async () => {
    component.game!.numberMode = 'random';
    component.game!.digitCount = 1;
    participants = Array.from({ length: 9 }, (_, index) => ({
      id: `game-player-${index}`,
      gameId: 'game',
      gameUid: 'game-uid',
      name: `Player ${index}`,
      assignedNumber: index + 1,
      status: 'active' as const,
      joinedAt: '2026-11-05T00:00:00.000Z'
    }));

    await component.acceptInvitation();

    expect(joinRaffle).not.toHaveBeenCalled();
    expect(component.errorMessage).toBe('This raffle has no available ticket numbers.');
  });
});
