import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Raffle, RaffleService } from './raffle.service';

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

  ngOnInit(): void {
    this.route.paramMap.subscribe(async (params) => {
      const gameId = params.get('id');
      if (!gameId) {
        this.errorMessage = 'Invitation link is missing a game ID.';
        return;
      }

      const games = await this.raffleService.listRaffles();
      this.game = games.find((item) => item.gameId === gameId || item.id === gameId) ?? null;
      if (!this.game) {
        this.errorMessage = 'This game invitation is no longer available.';
      }
    });
  }

  async acceptInvitation(): Promise<void> {
    if (!this.game || !this.name.trim() || this.isJoining) {
      this.errorMessage = 'Enter your name to join the game.';
      return;
    }

    this.isJoining = true;
    this.errorMessage = '';
    const digitCount = this.game.digitCount ?? 3;
    const assignedNumber = this.game.numberMode === 'ordered'
      ? this.game.players.length + 1
      : Math.floor(10 ** (digitCount - 1) + Math.random() * (10 ** digitCount - 10 ** (digitCount - 1)));

    this.game.players = [...this.game.players, {
      id: `${this.game.gameUid}-${Date.now()}`,
      name: this.name.trim(),
      assignedNumber,
      drawn: false,
      mobileNumber: this.mobileNumber.trim() || undefined,
      remarks: this.remarks.trim() || undefined
    }];
    this.game.remainingDraws = Math.max(this.game.remainingDraws, this.game.players.length);

    try {
      await this.raffleService.saveRaffle(this.game);
      this.assignedNumber = String(assignedNumber).padStart(digitCount, '0');
      this.joined = true;
    } catch {
      this.errorMessage = 'We could not join this game. Please try again.';
    } finally {
      this.isJoining = false;
    }
  }

  openGame(): void {
    if (this.game) {
      this.router.navigate(['/raffles', this.game.gameId]);
    }
  }
}
