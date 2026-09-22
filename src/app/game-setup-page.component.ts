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
  startAt = this.toDateTimeLocalValue(new Date());
  closeAt = this.toDateTimeLocalValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  remarks = '';
  isSaving = false;
  errorMessage = '';

  get requiresSignIn(): boolean {
    return this.errorMessage === 'Please sign in before creating a game.';
  }

  async createGame(): Promise<void> {
    const name = this.gameName.trim();
    const startDate = new Date(this.startAt);
    const closeDate = new Date(this.closeAt);

    if (!name || this.digitCount < 3 || this.digitCount > 6 || !this.startAt || !this.closeAt || Number.isNaN(startDate.getTime()) || Number.isNaN(closeDate.getTime()) || closeDate <= startDate || this.isSaving) {
      this.errorMessage = 'Choose a valid start time and close time. The close time must be after the start time.';
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
        remarks: this.remarks.trim(),
        startAt: startDate.toISOString(),
        closeAt: closeDate.toISOString()
      });
      this.isSaving = false;
      await this.router.navigate(['/raffles', raffle.gameId]);
    } catch (error) {
      this.errorMessage = this.raffleService.getFirestoreErrorMessage(error, 'The game could not be created. Please try again.');
      this.isSaving = false;
    }
  }

  private toDateTimeLocalValue(date: Date): string {
    const timezoneOffset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - timezoneOffset);
    return localDate.toISOString().slice(0, 16);
  }
}
