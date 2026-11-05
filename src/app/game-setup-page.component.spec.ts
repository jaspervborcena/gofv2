import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GameSetupPageComponent } from './game-setup-page.component';
import { RaffleService } from './raffle.service';

describe('GameSetupPageComponent', () => {
  let component: GameSetupPageComponent;
  let createRaffle: jasmine.Spy;

  beforeEach(async () => {
    sessionStorage.removeItem('gofv2-game-setup-draft');
    createRaffle = jasmine.createSpy('createRaffle');

    await TestBed.configureTestingModule({
      imports: [GameSetupPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: RaffleService,
          useValue: {
            currentUserId: null,
            createRaffle,
            getFirestoreErrorMessage: () => 'The game could not be created.'
          }
        }
      ]
    }).compileComponents();

    component = TestBed.createComponent(GameSetupPageComponent).componentInstance;
  });

  afterEach(() => {
    sessionStorage.removeItem('gofv2-game-setup-draft');
  });

  it('reports a missing game name instead of an unrelated close-time error', async () => {
    component.gameName = '  ';

    await component.createGame();

    expect(component.errorMessage).toBe('Enter a game name.');
    expect(createRaffle).not.toHaveBeenCalled();
  });

  it('preserves the sign-in prompt when the game details are valid', async () => {
    component.gameName = 'Test raffle';

    await component.createGame();

    expect(component.errorMessage).toBe('Please sign in before creating a game.');
    expect(component.requiresSignIn).toBeTrue();
    expect(createRaffle).not.toHaveBeenCalled();
  });
});
