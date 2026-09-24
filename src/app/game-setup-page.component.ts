import { Component, OnInit, inject } from '@angular/core';
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
export class GameSetupPageComponent implements OnInit {
  private readonly raffleService = inject(RaffleService);
  private readonly router = inject(Router);

  gameName = '';
  digitCount = 3;
  numberMode: NumberMode = 'random';
  spinMode: SpinMode = 'simultaneous';
  startAt = this.toDateTimeLocalValue(new Date());
  startAtDraft = this.startAt;
  closeAt = this.toDateTimeLocalValue(new Date(new Date(this.startAt).getTime() + 24 * 60 * 60 * 1000));
  closeAtDraft = this.closeAt;
  closeTimeCustomized = false;
  remarks = '';
  isSaving = false;
  errorMessage = '';
  private readonly draftStorageKey = 'gofv2-game-setup-draft';

  ngOnInit(): void {
    this.restoreDraft();
  }

  get requiresSignIn(): boolean {
    return this.errorMessage === 'Please sign in before creating a game.';
  }

  get latestCloseAt(): string {
    const startDate = new Date(this.startAt);
    return Number.isNaN(startDate.getTime()) ? '' : this.toDateTimeLocalValue(this.addOneMonth(startDate));
  }

  onStartTimeDraftChange(value: string): void {
    this.startAtDraft = value;
    this.startAt = value;
    const startDate = new Date(value);
    if (!Number.isNaN(startDate.getTime())) {
      this.closeTimeCustomized = false;
      this.closeAtDraft = this.toDateTimeLocalValue(new Date(startDate.getTime() + 24 * 60 * 60 * 1000));
      this.closeAt = this.closeAtDraft;
    }
  }

  onCloseTimeDraftChange(value: string): void {
    this.closeAtDraft = value;
    this.closeAt = value;
    this.closeTimeCustomized = true;
  }

  async createGame(): Promise<void> {
    const name = this.gameName.trim();
    const startDate = new Date(this.startAt);
    const closeDate = new Date(this.closeAt);

    const latestCloseDate = new Date(this.latestCloseAt);
    if (!name || this.digitCount < 3 || this.digitCount > 6 || !this.startAt || !this.closeAt || Number.isNaN(startDate.getTime()) || Number.isNaN(closeDate.getTime()) || closeDate <= startDate || closeDate > latestCloseDate || this.isSaving) {
      this.errorMessage = 'Choose a close time after the start and within one month of it.';
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';

    try {
      const creatorId = this.raffleService.currentUserId;
      if (!creatorId) {
        this.saveDraft();
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
      this.clearDraft();
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

  private addOneMonth(date: Date): Date {
    const latestDate = new Date(date);
    latestDate.setMonth(latestDate.getMonth() + 1);
    return latestDate;
  }

  private saveDraft(): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }

    sessionStorage.setItem(this.draftStorageKey, JSON.stringify({
      gameName: this.gameName,
      digitCount: this.digitCount,
      numberMode: this.numberMode,
      spinMode: this.spinMode,
      startAt: this.startAt,
      closeAt: this.closeAt,
      remarks: this.remarks
    }));
  }

  private restoreDraft(): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }

    const storedDraft = sessionStorage.getItem(this.draftStorageKey);
    if (!storedDraft) {
      return;
    }

    try {
      const draft = JSON.parse(storedDraft) as Partial<GameSetupPageComponent>;
      this.gameName = typeof draft.gameName === 'string' ? draft.gameName : this.gameName;
      this.digitCount = typeof draft.digitCount === 'number' ? draft.digitCount : this.digitCount;
      this.numberMode = draft.numberMode === 'ordered' ? 'ordered' : 'random';
      this.spinMode = draft.spinMode === 'per-digit' ? 'per-digit' : 'simultaneous';
      this.startAt = typeof draft.startAt === 'string' ? draft.startAt : this.startAt;
      this.startAtDraft = this.startAt;
      this.closeAt = typeof draft.closeAt === 'string' ? draft.closeAt : this.closeAt;
      this.closeAtDraft = this.closeAt;
      this.closeTimeCustomized = true;
      this.remarks = typeof draft.remarks === 'string' ? draft.remarks : this.remarks;
    } catch {
      sessionStorage.removeItem(this.draftStorageKey);
    }
  }

  private clearDraft(): void {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(this.draftStorageKey);
    }
  }
}
