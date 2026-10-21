import { Component, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';
import { ActiveSpin, DrawItem, JoinedGameLiveState, ParticipantRecord, Raffle, RaffleService } from './raffle.service';

@Component({
  selector: 'app-game-spectator-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './game-spectator-page.component.html',
  styleUrl: './game-spectator-page.component.scss'
})
export class GameSpectatorPageComponent implements OnDestroy, OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly raffleService = inject(RaffleService);
  private readonly zone = inject(NgZone);
  private routeSubscription?: Subscription;
  private stopWatchingSpin?: () => void;
  private stopWatchingJoinedGames?: () => void;
  private countdownTimer?: number;
  private spinStartTimer?: number;
  private spinEndTimer?: number;
  private numberTicker?: number;
  private activeSpinId?: string;

  raffle: Raffle | null = null;
  participant: ParticipantRecord | null = null;
  joinedGames: JoinedGameLiveState[] = [];
  selectedGameIndex = 0;
  activeTab: 'live' | 'entry' | 'results' = 'live';
  isLoading = true;
  errorMessage = '';
  spinCountdown: number | null = null;
  isSpinning = false;
  spinningNumber = '';
  revealedWinner: { name: string; number: string } | null = null;

  ngOnInit(): void {
    this.routeSubscription = this.route.paramMap.subscribe((params) => {
      void this.loadGame(params.get('id'));
    });
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
    this.stopWatchingSpin?.();
    this.stopWatchingJoinedGames?.();
    this.clearSpinTimers();
  }

  private async loadGame(gameId: string | null): Promise<void> {
    this.stopWatchingSpin?.();
    this.clearSpinTimers();
    this.raffle = null;
    this.participant = null;
    this.revealedWinner = null;
    this.activeSpinId = undefined;
    this.errorMessage = '';
    this.isLoading = true;

    if (!gameId) {
      await this.showUnavailable('This game link is missing a game ID.');
      return;
    }

    try {
      const currentUser = await firstValueFrom(this.raffleService.user$);
      if (!currentUser) {
        await this.router.navigate(['/signin'], {
          queryParams: { returnUrl: `/games/${gameId}/spectate` }
        });
        return;
      }

      const raffle = await this.raffleService.findRaffle(gameId);
      if (!raffle) {
        await this.showUnavailable('This game could not be found.');
        return;
      }

      if (raffle.creatorId === currentUser.uid) {
        await this.router.navigate(['/raffles', raffle.gameId]);
        return;
      }

      const participant = await this.raffleService.findUserParticipantForGame(raffle.gameUid, currentUser.uid);
      if (!participant) {
        if (this.raffleService.isRaffleActive(raffle)) {
          await this.router.navigate(['/games', raffle.gameId, 'join']);
        } else {
          await this.showUnavailable('You need to join this game before you can spectate.');
        }
        return;
      }

      this.raffle = raffle;
      this.participant = participant;
      this.isLoading = false;
      this.stopWatchingJoinedGames?.();
      this.stopWatchingJoinedGames = this.raffleService.watchUserJoinedGames(
        currentUser.uid,
        (games) => this.zone.run(() => {
          this.joinedGames = games;
          this.selectedGameIndex = Math.max(0, games.findIndex((game) => game.gameUid === raffle.gameUid));
        }),
        (error) => this.zone.run(() => {
          this.errorMessage = `Joined-game updates stopped: ${error.message}`;
        })
      );
      this.watchSpin(raffle.gameUid);
    } catch (error) {
      await this.showUnavailable(error instanceof Error
        ? `This game could not be loaded: ${error.message}`
        : 'This game could not be loaded. Please try again.');
    }
  }

  get results(): DrawItem[] {
    return [...(this.raffle?.history ?? [])].sort((left, right) =>
      right.timestamp.localeCompare(left.timestamp));
  }

  get entryTicketNumber(): string {
    if (!this.participant) {
      return '';
    }
    return this.participant.ticketCode
      ?? String(this.participant.assignedNumber).padStart(this.raffle?.digitCount ?? 3, '0');
  }

  previousGame(): void {
    if (this.joinedGames.length > 1) {
      const previous = (this.selectedGameIndex - 1 + this.joinedGames.length) % this.joinedGames.length;
      void this.openGame(this.joinedGames[previous]);
    }
  }

  nextGame(): void {
    if (this.joinedGames.length > 1) {
      const next = (this.selectedGameIndex + 1) % this.joinedGames.length;
      void this.openGame(this.joinedGames[next]);
    }
  }

  private openGame(game: JoinedGameLiveState): Promise<boolean> {
    return this.router.navigate(['/games', game.gameId, 'spectate']);
  }

  private watchSpin(gameUid: string): void {
    this.stopWatchingSpin = this.raffleService.watchActiveSpin(
      gameUid,
      (spin) => this.zone.run(() => {
        if (!spin || !this.raffle) {
          return;
        }
        if (spin.phase === 'complete') {
          this.finishSpin(spin);
        } else if (spin.spinId !== this.activeSpinId) {
          this.startSpin(spin);
        }
      }),
      (error) => this.zone.run(() => {
        this.errorMessage = `Live spin updates stopped: ${error.message}`;
      })
    );
  }

  private startSpin(spin: ActiveSpin): void {
    this.clearSpinTimers();
    this.activeSpinId = spin.spinId;
    this.revealedWinner = null;
    this.spinningNumber = '0'.repeat(spin.ticketNumber.length);
    const remaining = spin.scheduledStartAt - Date.now();
    this.spinCountdown = remaining > 0 ? Math.ceil(remaining / 1000) : null;

    if (remaining > 0) {
      this.countdownTimer = window.setInterval(() => {
        const timeLeft = spin.scheduledStartAt - Date.now();
        this.spinCountdown = timeLeft > 0 ? Math.ceil(timeLeft / 1000) : null;
      }, 100);
    }
    this.spinStartTimer = window.setTimeout(() => {
      if (this.countdownTimer !== undefined) {
        window.clearInterval(this.countdownTimer);
        this.countdownTimer = undefined;
      }
      this.spinCountdown = null;
      this.isSpinning = true;
      this.numberTicker = window.setInterval(() => {
        this.spinningNumber = spin.ticketNumber.replace(/[0-9A-Z]/gi, () =>
          '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 36)]);
      }, 100);
      this.spinEndTimer = window.setTimeout(
        () => this.finishSpin(spin),
        Math.max(0, spin.roundEndsAt - Date.now())
      );
    }, Math.max(0, remaining));
  }

  private finishSpin(spin: ActiveSpin): void {
    this.clearSpinTimers();
    this.activeSpinId = spin.spinId;
    this.isSpinning = false;
    this.spinCountdown = null;
    this.spinningNumber = spin.ticketNumber;
    this.revealedWinner = { name: spin.winnerName, number: spin.ticketNumber };
  }

  private clearSpinTimers(): void {
    if (this.countdownTimer !== undefined) {
      window.clearInterval(this.countdownTimer);
      this.countdownTimer = undefined;
    }
    if (this.spinStartTimer !== undefined) {
      window.clearTimeout(this.spinStartTimer);
      this.spinStartTimer = undefined;
    }
    if (this.spinEndTimer !== undefined) {
      window.clearTimeout(this.spinEndTimer);
      this.spinEndTimer = undefined;
    }
    if (this.numberTicker !== undefined) {
      window.clearInterval(this.numberTicker);
      this.numberTicker = undefined;
    }
  }

  private async showUnavailable(message: string): Promise<void> {
    await this.router.navigate(['/raffle-unavailable'], {
      queryParams: { title: 'Spectator view unavailable', message }
    });
  }
}
