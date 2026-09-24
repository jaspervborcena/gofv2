import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Raffle, RaffleService } from './raffle.service';
import { FREE_MAX_PLAYERS } from './plan-schema';

@Component({
  selector: 'app-game-invitation-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './game-invitation-page.component.html',
  styleUrl: './game-invitation-page.component.scss'
})
export class GameInvitationPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly raffleService = inject(RaffleService);

  game: Raffle | null = null;
  name = '';
  mobileNumber = '';
  remarks = '';
  errorMessage = '';
  isJoining = false;
  joined = false;
  assignedNumber = '';
  isExpired = false;

  async ngOnInit(): Promise<void> {
    this.route.paramMap.subscribe(async (params) => {
      const gameId = params.get('id');
      if (!gameId) {
        await this.router.navigate(['/raffle-unavailable'], {
          queryParams: {
            title: 'Invitation unavailable',
            message: 'This invitation link is missing a game ID.'
          }
        });
        return;
      }

      const signedInUser = await firstValueFrom(this.raffleService.user$);
      if (!signedInUser) {
        this.saveInvitationDraft(gameId);
        await this.router.navigate(['/signin'], {
          queryParams: { returnUrl: `/games/${gameId}/join` }
        });
        return;
      }

      this.game = await this.raffleService.findRaffle(gameId);
      this.restoreInvitationDraft(gameId);
      if (!this.game) {
        await this.router.navigate(['/raffle-unavailable'], {
          queryParams: {
            title: 'Invitation unavailable',
            message: 'This game invitation is no longer available.'
          }
        });
        return;
      }

      if (this.game && !this.raffleService.isRaffleActive(this.game)) {
        await this.router.navigate(['/raffle-unavailable'], {
          queryParams: {
            title: 'Invitation expired',
            message: 'This invitation link has expired and is no longer accepting entries.'
          }
        });
      }
    });
  }

  async acceptInvitation(): Promise<void> {
    if (!this.game || this.isExpired) {
      this.errorMessage = 'This invitation link has expired and can no longer be used.';
      return;
    }

    if (!this.name.trim() || this.isJoining) {
      this.errorMessage = 'Enter your name to join the game.';
      return;
    }

    if (this.game.players.length >= FREE_MAX_PLAYERS) {
      this.errorMessage = `This raffle already has ${FREE_MAX_PLAYERS} players and cannot accept more entries.`;
      return;
    }

    this.isJoining = true;
    this.errorMessage = '';
    const digitCount = this.game.digitCount ?? 3;
    const assignedNumber = this.game.numberMode === 'ordered'
      ? this.game.players.length + 1
      : Math.floor(10 ** (digitCount - 1) + Math.random() * (10 ** digitCount - 10 ** (digitCount - 1)));

    const player = {
      id: `${this.game.gameUid}-${Date.now()}`,
      name: this.name.trim(),
      assignedNumber,
      drawn: false,
      mobileNumber: this.mobileNumber.trim() || undefined,
      remarks: this.remarks.trim() || undefined
    };

    try {
      await this.raffleService.joinRaffle(this.game, player);
      this.clearInvitationDraft(this.game.gameId);
      this.assignedNumber = String(assignedNumber).padStart(digitCount, '0');
      this.joined = true;
    } catch {
      this.errorMessage = 'You could not join this game. Please sign in and try again.';
    } finally {
      this.isJoining = false;
    }
  }

  openGame(): void {
    if (this.game) {
      this.router.navigate(['/raffles', this.game.gameId]);
    }
  }

  private invitationDraftKey(gameId: string): string {
    return `gofv2-invitation-draft-${gameId}`;
  }

  private saveInvitationDraft(gameId: string): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }

    sessionStorage.setItem(this.invitationDraftKey(gameId), JSON.stringify({
      name: this.name,
      mobileNumber: this.mobileNumber,
      remarks: this.remarks
    }));
  }

  private restoreInvitationDraft(gameId: string): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }

    const draft = sessionStorage.getItem(this.invitationDraftKey(gameId));
    if (!draft) {
      return;
    }

    try {
      const values = JSON.parse(draft) as { name?: string; mobileNumber?: string; remarks?: string };
      this.name = values.name ?? '';
      this.mobileNumber = values.mobileNumber ?? '';
      this.remarks = values.remarks ?? '';
    } catch {
      this.clearInvitationDraft(gameId);
    }
  }

  private clearInvitationDraft(gameId: string): void {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(this.invitationDraftKey(gameId));
    }
  }
}
