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

  it('shows the free player limit from the plan configuration in both player tabs', () => {
    component.activeTab = 'players';
    fixture.detectChanges();

    ['names', 'text'].forEach((tab) => {
      component.activePlayersTab = tab as 'names' | 'text';
      fixture.detectChanges();
      const notice = fixture.nativeElement.querySelector('.free-plan-notice') as HTMLElement;

      expect(notice).toBeTruthy();
      expect(notice.textContent).toContain(`players list is limited to ${component.playerLimit}`);
      expect(notice.textContent).toContain(`more than ${component.playerLimit} players`);
      expect(notice.textContent).not.toContain('200');
    });
  });

  it('warns and prevents saving duplicate ticket numbers in the list editor', async () => {
    component.activeTab = 'players';
    component.activePlayersTab = 'text';
    fixture.detectChanges();

    component.editorText = '111 • Alpha\n111 • Beta';
    component.handleEditorChange();
    fixture.detectChanges();

    const notice = fixture.nativeElement.querySelector('.duplicate-notice[role="alert"]') as HTMLElement;
    expect(notice.textContent).toContain('Duplicate ticket numbers found: 111');

    const originalPlayers = [...component.raffle!.players];
    await component.savePlayers();

    expect(component.raffle!.players).toEqual(originalPlayers);
    expect(component.participantSaveMessage).toBe('Duplicate ticket numbers are not allowed: 111.');
  });

  it('labels successful preview list edits as temporary', async () => {
    component.activeTab = 'players';
    component.activePlayersTab = 'text';
    component.editorText = '111 • Alpha\nB02 • Beta\n306 • Gamma';

    await component.savePlayers();
    fixture.detectChanges();

    expect(component.raffle!.players.map((player) => player.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(component.participantSaveMessage)
      .toBe('Demo participants updated. Changes are temporary and will reset when you reload.');
    expect(fixture.nativeElement.textContent).toContain('Demo list edits are temporary and reset when you reload.');
    expect(component.participantSaveMessage).not.toBe('Participants saved');
  });

  it('detects numeric tickets with different zero padding as duplicates', () => {
    component.editorText = '111 • Alpha\n0111 • Beta';

    component.handleEditorChange();

    expect(component.duplicateTicketNumbers).toEqual(['111']);
  });

  it('opens Game History from View All Winners even after visiting Excluded', () => {
    component.historySubTab = 'winners';

    component.viewAllWinners();

    expect(component.activeTab).toBe('history');
    expect(component.historySubTab).toBe('history');
  });

  it('explains that numeric tickets must be between 1 and the digit limit', async () => {
    component.activeTab = 'players';
    component.joinedName = 'Zero Ticket';
    component.useJoinedNumber = true;
    component.joinedNumber = '000';

    await component.joinEntry();

    expect(component.participantLimitMessage).toBe('Enter a number from 1 to 999.');
    expect(component.raffle!.players.some((player) => player.name === 'Zero Ticket')).toBeFalse();
  });

  it('keeps the format guidance for invalid ticket characters', async () => {
    component.joinedName = 'Invalid Ticket';
    component.useJoinedNumber = true;
    component.joinedNumber = '12-';

    await component.joinEntry();

    expect(component.participantLimitMessage).toBe('Enter up to 3 letters or numbers.');
  });

  it('lets the raffle panel grow to fit the winner banner and draw controls', () => {
    component.lastWinner = { name: 'Mina', number: '248' };
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.raffle-detail').classList).toContain('has-winner');
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
