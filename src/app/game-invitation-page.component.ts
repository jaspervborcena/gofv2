import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ParticipantRecord, Raffle, RaffleService } from './raffle.service';
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
  useCustomNumber = false;
  customNumber = '';
  mobileNumber = '';
  remarks = '';
  errorMessage = '';
  isJoining = false;
  joined = false;
  alreadyParticipated = false;
  isUserSignedIn = false;
  assignedNumber = '';
  isExpired = false;

  async ngOnInit(): Promise<void> {
    this.route.paramMap.subscribe(async (params) => {
      this.game = null;
      this.name = '';
      this.useCustomNumber = false;
      this.customNumber = '';
      this.mobileNumber = '';
      this.remarks = '';
      this.errorMessage = '';
      this.isJoining = false;
      this.joined = false;
      this.alreadyParticipated = false;
      this.isUserSignedIn = false;
      this.assignedNumber = '';
      this.isExpired = false;

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

      const signedInUser = await firstValueFrom(this.raffleService.user$);
      this.isUserSignedIn = !!signedInUser;
      const participant = signedInUser
        ? await this.raffleService.findUserParticipantForGame(this.game.gameUid, signedInUser.uid)
        : null;
      if (participant) {
        this.showExistingParticipant(participant);
        return;
      }

      if (signedInUser && !this.name.trim()) {
        this.name = await this.raffleService.getUserFullName(signedInUser.uid);
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

    const digitCount = this.game.digitCount ?? 3;
    const usedNumbers = new Set(this.game.players.map((player) => player.assignedNumber));
    const assignedNumber = this.useCustomNumber
      ? this.parseCustomNumber(this.customNumber, digitCount)
      : this.game.numberMode === 'ordered'
      ? this.game.players.length + 1
      : this.createRandomNumber(digitCount, usedNumbers);
    if (assignedNumber === null) {
      this.errorMessage = `Enter a number from 1 to ${10 ** digitCount - 1}.`;
      return;
    }

    const duplicateName = this.game.players.some((player) => player.name.trim().toLocaleLowerCase() === this.name.trim().toLocaleLowerCase());
    if (duplicateName) {
      this.errorMessage = `The name "${this.name.trim()}" has already joined this raffle.`;
      return;
    }

    const duplicateNumber = this.game.players.some((player) => player.assignedNumber === assignedNumber);
    if (duplicateNumber) {
      this.errorMessage = `The number ${String(assignedNumber).padStart(digitCount, '0')} is already in use.`;
      return;
    }

    const signedInUser = await firstValueFrom(this.raffleService.user$);
    if (!signedInUser) {
      this.saveInvitationDraft(this.game.gameId);
      await this.router.navigate(['/signin'], {
        queryParams: { returnUrl: `/games/${this.game.gameId}/join` }
      });
      return;
    }

    this.isJoining = true;
    this.errorMessage = '';

    try {
      const existingParticipant = await this.raffleService.findUserParticipantForGame(this.game.gameUid, signedInUser.uid);
      if (existingParticipant) {
        this.showExistingParticipant(existingParticipant);
        this.isJoining = false;
        return;
      }
    } catch {
      this.errorMessage = 'Your participation could not be checked. Please try again.';
      this.isJoining = false;
      return;
    }

    try {
      await this.raffleService.saveUserFullName(signedInUser.uid, this.name);
    } catch {
      this.errorMessage = 'Your name could not be saved. Please try again.';
      this.isJoining = false;
      return;
    }

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
    } catch (error) {
      const existingParticipant = await this.raffleService.findUserParticipantForGame(this.game.gameUid, signedInUser.uid).catch(() => null);
      if (existingParticipant) {
        this.showExistingParticipant(existingParticipant);
        return;
      }
      this.errorMessage = this.raffleService.getFirestoreErrorMessage(error, 'You could not join this game. Please try again.');
    } finally {
      this.isJoining = false;
    }
  }

  saveDraftBeforeSignIn(): void {
    if (this.game) {
      this.saveInvitationDraft(this.game.gameId);
    }
  }

  private showExistingParticipant(participant: ParticipantRecord): void {
    if (!this.game) {
      return;
    }

    this.name = participant.name;
    this.assignedNumber = participant.ticketCode
      ?? String(participant.assignedNumber).padStart(this.game.digitCount ?? 3, '0');
    this.alreadyParticipated = true;
    this.joined = true;
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
      useCustomNumber: this.useCustomNumber,
      customNumber: this.customNumber,
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
      const values = JSON.parse(draft) as { name?: string; useCustomNumber?: boolean; customNumber?: string; mobileNumber?: string; remarks?: string };
      this.name = values.name ?? '';
      this.useCustomNumber = values.useCustomNumber ?? false;
      this.customNumber = values.customNumber ?? '';
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

  private parseCustomNumber(value: string, digitCount: number): number | null {
    if (!/^\d+$/.test(value.trim()) || value.trim().length > digitCount) {
      return null;
    }

    const number = Number(value.trim());
    return number >= 1 && number <= 10 ** digitCount - 1 ? number : null;
  }

  private createRandomNumber(digitCount: number, usedNumbers: Set<number>): number {
    const minimum = 10 ** (digitCount - 1);
    const maximum = 10 ** digitCount - 1;
    let number = Math.floor(minimum + Math.random() * (maximum - minimum + 1));
    while (usedNumbers.has(number)) {
      number = Math.floor(minimum + Math.random() * (maximum - minimum + 1));
    }
    return number;
  }
}
