import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NumberMode, RaffleService, SpinMode } from './raffle.service';

@Component({
  selector: 'app-game-setup-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './game-setup-page.component.html',
  styleUrl: './game-setup-page.component.scss'
})
export class GameSetupPageComponent {
  private readonly raffleService = inject(RaffleService);
  private readonly router = inject(Router);

  gameName = '';
  digitCount = 3;
  numberMode: NumberMode = 'random';
  spinMode: SpinMode = 'simultaneous';
  remarks = '';
  isSaving = false;
  errorMessage = '';

  async createGame(): Promise<void> {
    const name = this.gameName.trim();
    if (!name || this.digitCount < 3 || this.digitCount > 6 || this.isSaving) {
      this.errorMessage = 'Enter a game name and choose between 3 and 6 digits.';
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';

    try {
      const creatorId = this.raffleService.currentUserId;
      if (!creatorId) {
        this.errorMessage = 'Please sign in before creating a game.';
        this.isSaving = false;
        return;
      }

      const raffle = await this.raffleService.createRaffle({
        name,
        creatorId,
        mode: this.spinMode,
        numberMode: this.numberMode,
        digitCount: this.digitCount,
        remarks: this.remarks.trim()
      });
      this.isSaving = false;
      await this.router.navigate(['/raffles', raffle.gameId]);
    } catch (error) {
      this.errorMessage = this.raffleService.getFirestoreErrorMessage(error, 'The game could not be created. Please try again.');
      this.isSaving = false;
    }
  }
}
