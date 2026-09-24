import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DrawItem, Raffle, RaffleService } from './raffle.service';
import { environment } from '../environments/environment';

interface RaffleEntry {
  id?: string;
  name: string;
  number: string;
}

@Component({
  selector: 'app-raffle-machine-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './raffle-machine-page.component.html',
  styleUrl: './raffle-machine-page.component.scss'
})
export class RaffleMachinePageComponent implements OnDestroy, OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly raffleService = inject(RaffleService);
  standaloneRaffle = false;
  private readonly stopSound = new Audio('/assets/slot-stop.mp3');
  private readonly winSound = new Audio('/assets/slot-win.mp3');

  raffle: Raffle | null = null;
  gameName = 'Lucky Draws';
  gameDescription = 'Winner takes all';
  activeTab: 'names' | 'text' | 'history' | 'winners' = 'names';
  reels = ['0', '0', '0'];
  reelPositions = [0, 0, 0];
  reelStrip = Array.from({ length: 100 }, (_, index) => index % 10);
  reelDurations = [1000, 3000, 5000, 7000, 9000, 11000];
  confettiPieces = Array.from({ length: 28 }, (_, index) => index);
  reelTransitionEnabled = false;
  isSpinning = false;
  winner: RaffleEntry | null = null;
  winnerBoxVisible = false;
  participantSaveMessage = '';
  removedMessage = '';
  invitationUrl = '';
  invitationQrUrl = '';
  private spinTimers: number[] = [];
  private spinAnimationFrame?: number;
  private participantSaveTimeout?: number;
  private removeNoticeTimeout?: number;
  joinedName = '';
  pendingPasteEntries: RaffleEntry[] | null = null;
  entries: RaffleEntry[] = [
    { name: 'Mina', number: '248' },
    { name: 'Drew', number: '731' },
    { name: 'Lina', number: '564' },
    { name: 'Kai', number: '902' }
  ];
  namesText = this.formatEntries();

  ngOnInit(): void {
    this.route.paramMap.subscribe(async (params) => {
      const gameId = params.get('id');
      if (!gameId) {
        this.standaloneRaffle = true;
        this.raffle = {
          id: `standalone-${Date.now()}`,
          gameId: String(Date.now() % 100000000).padStart(8, '0'),
          gameUid: `standalone-${Date.now()}`,
          name: 'Lucky Draws',
          creatorId: 'standalone',
          mode: 'simultaneous',
          numberMode: 'random',
          digitCount: 3,
          remarks: 'Winner takes all',
          players: this.entries.map((entry, index) => ({
            id: `standalone-player-${index}`,
            name: entry.name,
            assignedNumber: Number(entry.number),
            drawn: false
          })),
          history: [],
          remainingDraws: 10,
          createdAt: new Date().toISOString(),
          closedAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        };
        return;
      }

      const raffles = await this.raffleService.listRaffles();
      const raffle = raffles.find((item) => item.gameId === gameId || item.id === gameId);
      if (!raffle) {
        return;
      }

      this.raffle = raffle;
      const participantRecords = await this.raffleService.listParticipants(raffle.gameUid);
      this.raffle.history = await this.raffleService.listGameHistory(raffle.gameUid);
      this.raffle.players = participantRecords.map((participant) => ({
        id: participant.id,
        name: participant.name,
        assignedNumber: participant.assignedNumber,
        drawn: participant.status === 'winner',
        status: participant.status,
        ...(participant.mobileNumber ? { mobileNumber: participant.mobileNumber } : {}),
        ...(participant.remarks ? { remarks: participant.remarks } : {})
      }));
      this.gameName = raffle.name;
      this.gameDescription = raffle.remarks || 'Winner takes all';
      this.invitationUrl = raffle.invitationLink ?? '';
      this.invitationQrUrl = raffle.qrCodeUrl ?? '';
      const digitCount = raffle.digitCount ?? 3;
      this.reels = Array(digitCount).fill('0');
      this.reelPositions = Array(digitCount).fill(0);
      this.entries = raffle.players.filter((player) => player.status !== 'inactive' && player.status !== 'removed').map((player) => ({
        id: player.id,
        name: player.name,
        number: String(player.assignedNumber).padStart(digitCount, '0')
      }));
      this.namesText = this.formatEntries();
    });
  }

  get participantCount(): number {
    return this.entries.length;
  }

  get gameHistory(): DrawItem[] {
    return [...(this.raffle?.history ?? [])].reverse();
  }

  get activeWinners(): DrawItem[] {
    return this.gameHistory.filter((item) => item.winnerStatus === 'active' && item.excludedFromList === true);
  }

  winnerTag(entry: RaffleEntry): string | null {
    const record = [...(this.raffle?.history ?? [])]
      .reverse()
      .find((item) => this.normalizeName(item.winnerName) === this.normalizeName(entry.name) && item.drawnNumber === entry.number);
    if (!record) {
      return null;
    }

    return record.winnerStatus === 'processed' ? 'Processed' : 'Winner';
  }

  private formatEntries(): string {
    return this.entries.map((entry) => `${entry.number} • ${entry.name}`).join('\n');
  }

  updateNames(text: string): void {
    this.namesText = text;
    const previousEntries = this.entries;
    this.entries = this.parseEntries(text).map((entry, index) => ({
      ...entry,
      id: previousEntries[index]?.id
    }));
    if (this.participantSaveTimeout) {
      window.clearTimeout(this.participantSaveTimeout);
    }
    this.participantSaveTimeout = window.setTimeout(() => {
      this.participantSaveTimeout = undefined;
      void this.persistEntries().catch((error) => this.showParticipantSaveError(error));
    }, 2000);
  }

  async normalizeNamesText(): Promise<void> {
    if (this.participantSaveTimeout) {
      window.clearTimeout(this.participantSaveTimeout);
      this.participantSaveTimeout = undefined;
    }
    this.namesText = this.formatEntries();
    try {
      await this.persistEntries();
      this.participantSaveMessage = 'Participants saved';
    } catch (error) {
      this.showParticipantSaveError(error);
    }
  }

  ngOnDestroy(): void {
    if (this.participantSaveTimeout) {
      window.clearTimeout(this.participantSaveTimeout);
    }
    if (this.spinAnimationFrame) {
      window.cancelAnimationFrame(this.spinAnimationFrame);
    }
    this.spinTimers.forEach((timer) => window.clearTimeout(timer));
  }

  private async persistEntries(): Promise<void> {
    if (!this.raffle || this.standaloneRaffle) {
      return;
    }

    const existingPlayers = new Map(this.raffle.players.map((player) => [
      `${this.normalizeName(player.name)}-${String(player.assignedNumber).padStart(this.raffle?.digitCount ?? 3, '0')}`,
      player
    ]));
    const activePlayers = this.entries.map((entry, index) => {
      const key = `${this.normalizeName(entry.name)}-${entry.number}`;
      const existingPlayer = entry.id
        ? this.raffle!.players.find((player) => player.id === entry.id)
        : this.raffle!.players[index] ?? existingPlayers.get(key);
      return existingPlayer ?? {
        id: entry.id ?? `${this.raffle!.id}-${Date.now()}-${index}`,
        name: entry.name,
        assignedNumber: Number(entry.number),
        drawn: false,
        status: 'active' as const
      };
    });
    this.entries = this.entries.map((entry, index) => ({ ...entry, id: activePlayers[index].id }));
    const activeIds = new Set(activePlayers.map((player) => player.id));
    const removedPlayers = this.raffle.players
      .filter((player) => !activeIds.has(player.id) && !player.drawn && player.status !== 'removed')
      .map((player) => ({ ...player, status: 'inactive' as const, drawn: false }));
    this.raffle.players = [...activePlayers, ...removedPlayers];
    this.raffle.remainingDraws = Math.max(this.raffle.remainingDraws, this.raffle.players.length);
    await this.raffleService.saveRaffle(this.raffle);
  }

  private showParticipantSaveError(error: unknown): void {
    this.participantSaveMessage = error instanceof Error
      ? `Could not save participants: ${error.message}`
      : 'Could not save participants.';
  }

  async createInvitation(): Promise<void> {
    if (!this.raffle || this.standaloneRaffle) {
      return;
    }

    const invitation = await this.raffleService.createGameInvitation(this.raffle.gameId, this.raffle.gameUid, environment.appBaseUrl);
    this.invitationUrl = invitation.inviteUrl;
    this.invitationQrUrl = invitation.qrCodeUrl ?? '';
  }

  private parseEntries(text: string): RaffleEntry[] {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const parts = line.split('•').map((part) => part.trim());
        const starFormat = (parts.length > 1 ? parts[1] : parts[0]).match(/^(\d+)\s*\*\s*(.+)$/);
        const numberPart = starFormat?.[1] ?? (parts.length > 1 ? parts[0] : '');
        const namePart = starFormat?.[2] ?? (parts.length > 1 ? parts[1] : parts[0]);
        return {
          name: namePart || 'Player',
          number: starFormat
            ? numberPart
            : this.raffle?.numberMode === 'ordered'
            ? /^\d+$/.test(numberPart || '') ? numberPart : this.orderedNumber(index)
            : /^\d+$/.test(numberPart || '')
            ? numberPart as string
            : this.randomNumber()
        };
      });
  }

  private orderedNumber(index: number): string {
    return String(index + 1).padStart(this.raffle?.digitCount ?? 3, '0');
  }

  private nextOrderedNumber(entries: RaffleEntry[]): string {
    const nextNumber = entries.reduce((highest, entry) => Math.max(highest, Number(entry.number)), 0) + 1;
    return String(nextNumber).padStart(this.raffle?.digitCount ?? 3, '0');
  }

  private randomNumber(): string {
    const digitCount = this.raffle?.digitCount ?? 3;
    const minimum = 10 ** (digitCount - 1);
    const maximum = 10 ** digitCount - 1;
    return String(Math.floor(minimum + Math.random() * (maximum - minimum + 1)));
  }

  private nextRoundNumber(): string {
    return String((this.raffle?.history.length ?? 0) + 1);
  }

  private normalizeName(name: string): string {
    return name.trim().toLowerCase();
  }

  handleNamesPaste(event: ClipboardEvent): void {
    const target = event.target as HTMLTextAreaElement;
    const pastedText = event.clipboardData?.getData('text/plain') || '';

    if (!pastedText || target.selectionStart !== target.selectionEnd) {
      return;
    }

    const cursorPosition = target.selectionStart;
    const isOnLastLine = !this.namesText.slice(cursorPosition).includes('\n');
    const lastLineStart = this.namesText.lastIndexOf('\n') + 1;
    const lastLineHasText = this.namesText.slice(lastLineStart).trim().length > 0;

    if (!isOnLastLine) {
      return;
    }

    event.preventDefault();
    const pastedEntries = this.parseEntries(pastedText);
    const names = new Set(this.entries.map((entry) => this.normalizeName(entry.name)));
    const hasDuplicate = pastedEntries.some((entry) => {
      const normalizedName = this.normalizeName(entry.name);
      const duplicate = names.has(normalizedName);
      names.add(normalizedName);
      return duplicate;
    });

    if (hasDuplicate) {
      this.pendingPasteEntries = pastedEntries;
      return;
    }

    if (lastLineHasText) {
      this.appendPastedEntries(pastedEntries, false);
    } else {
      this.entries = pastedEntries;
      this.namesText = this.formatEntries();
    }
    target.value = this.namesText;
    target.setSelectionRange(this.namesText.length, this.namesText.length);
  }

  resolveDuplicatePaste(keepCopies: boolean): void {
    if (!this.pendingPasteEntries) {
      return;
    }

    this.appendPastedEntries(this.pendingPasteEntries, keepCopies);
    this.pendingPasteEntries = null;
  }

  private appendPastedEntries(pastedEntries: RaffleEntry[], keepCopies: boolean): void {
    const nextEntries = [...this.entries];
    const names = new Set(nextEntries.map((entry) => this.normalizeName(entry.name)));

    for (const pastedEntry of pastedEntries) {
      const baseName = pastedEntry.name;
      let name = baseName;
      const normalizedName = this.normalizeName(name);

      if (names.has(normalizedName)) {
        if (!keepCopies) {
          continue;
        }

        let copyNumber = 2;
        do {
          name = `${baseName}(${copyNumber})`;
          copyNumber += 1;
        } while (names.has(this.normalizeName(name)));
      }

      const entry = {
        name,
        number: this.raffle?.numberMode === 'ordered'
          ? this.nextOrderedNumber(nextEntries)
          : names.has(normalizedName) ? this.randomNumber() : pastedEntry.number
      };
      nextEntries.push(entry);
      names.add(this.normalizeName(entry.name));
    }

    this.entries = nextEntries;
    this.namesText = this.formatEntries();
  }

  async joinEntry(): Promise<void> {
    const rawName = this.joinedName.trim();
    if (!rawName) {
      return;
    }

    const displayName = rawName.includes('@') ? rawName.split('@')[0] : rawName;
    if (this.entries.some((entry) => this.normalizeName(entry.name) === this.normalizeName(displayName))) {
      return;
    }

    const entry = {
      name: displayName,
      number: this.raffle?.numberMode === 'ordered' ? this.nextOrderedNumber(this.entries) : this.randomNumber()
    };

    if (this.raffle) {
      this.raffle.players = [...this.raffle.players, {
        id: `${this.raffle.id}-${Date.now()}`,
        name: entry.name,
        assignedNumber: Number(entry.number),
        drawn: false
      }];

      if (!this.standaloneRaffle) {
        await this.raffleService.saveRaffle(this.raffle);
      }
    }

    this.entries = [...this.entries, entry];
    this.namesText = this.formatEntries();
    this.joinedName = '';
  }

  spin(): void {
    if (this.isSpinning || !this.entries.length) {
      return;
    }

    this.isSpinning = true;
    this.winner = null;
    this.winnerBoxVisible = false;
    const winner = this.entries[Math.floor(Math.random() * this.entries.length)];
    const digitCount = this.raffle?.digitCount ?? winner.number.length;
    const digits = winner.number.padStart(digitCount, '0').split('');
    const cycleCount = 1;
    const targetPositions = digits.map((digit) => cycleCount * 10 + Number(digit));
    const startPositions = targetPositions.map((position) => position + cycleCount * 10);
    const fastUpPositions = targetPositions.map((position) => position - cycleCount * 10);
    const isPerDigit = this.raffle?.mode === 'per-digit';
    const normalizedDigitCount = Math.max(3, Math.min(6, digitCount));
    const baseDuration = 5000 + (normalizedDigitCount - 3) * 2000;
    const slowdownDuration = 3000;
    const finalDuration = baseDuration + slowdownDuration;
    const durations = digits.map((_, index) => {
      const duration = isPerDigit ? (this.reelDurations[index] ?? baseDuration) : baseDuration;
      return duration + slowdownDuration;
    });
    this.reelTransitionEnabled = false;
    this.reelPositions = startPositions;
    const animationStart = performance.now();
    const animateReels = (now: number): void => {
      const elapsed = now - animationStart;
      this.reelPositions = startPositions.map((start, index) => {
        const duration = durations[index];
        const progress = Math.min(1, elapsed / duration);
        const slowdownStart = Math.max(0, duration - slowdownDuration);
        const upProgress = slowdownStart ? Math.min(1, elapsed / slowdownStart) : 1;
        const slowdownProgress = slowdownStart ? Math.max(0, (elapsed - slowdownStart) / slowdownDuration) : progress;
        const easedSlowdown = 1 - Math.pow(1 - slowdownProgress, 3);
        if (elapsed < slowdownStart) {
          const fastUpProgress = 1 - Math.pow(1 - upProgress, 2.4);
          return Math.round(start + (fastUpPositions[index] - start) * fastUpProgress);
        }

        return Math.round(fastUpPositions[index] + (targetPositions[index] - fastUpPositions[index]) * easedSlowdown);
      });
      if (elapsed < finalDuration) {
        this.spinAnimationFrame = window.requestAnimationFrame(animateReels);
      }
    };
    this.spinAnimationFrame = window.requestAnimationFrame(animateReels);
    this.scheduleSpinTicks(finalDuration, Math.max(0, finalDuration - slowdownDuration));

    window.setTimeout(async () => {
      this.reels = digits;
      this.winner = winner;
      this.winnerBoxVisible = true;
      this.isSpinning = false;
      this.winSound.currentTime = 0;
      void this.winSound.play().catch(() => undefined);

      if (this.raffle) {
        const winningPlayer = this.raffle.players.find((player) =>
          player.name === winner.name
          && String(player.assignedNumber).padStart(this.raffle?.digitCount ?? 3, '0') === winner.number
        );
        if (winningPlayer) {
          winningPlayer.drawn = true;
          winningPlayer.status = 'winner';
        }

        this.raffle.history = [
          ...this.raffle.history,
          {
            id: `${this.raffle.id}-${Date.now()}`,
            roundNumber: this.nextRoundNumber(),
            winnerName: winner.name,
            drawnNumber: winner.number,
            timestamp: new Date().toISOString(),
            participantId: winningPlayer?.id,
            participantName: winner.name,
            winnerStatus: 'active',
              ...(winningPlayer?.mobileNumber ? { participantMobileNumber: winningPlayer.mobileNumber } : {})
          }
        ];
        this.raffle.lastWinner = winner.name;
        this.raffle.lastNumber = winner.number;
        if (!this.standaloneRaffle) {
          await this.raffleService.saveRaffle(this.raffle);
        }
      }
      void this.notifyWinner(winner);
    }, finalDuration);
  }

  private scheduleSpinTicks(totalDuration: number, slowdownStart: number): void {
    const startedAt = performance.now();
    const playTick = (): void => {
      const elapsed = performance.now() - startedAt;
      if (elapsed >= totalDuration || !this.isSpinning) {
        return;
      }

      this.stopSound.pause();
      this.stopSound.currentTime = 0;
      void this.stopSound.play().catch(() => undefined);

      const slowdownProgress = slowdownStart
        ? Math.max(0, Math.min(1, (elapsed - slowdownStart) / (totalDuration - slowdownStart)))
        : 1;
      const tickDelay = elapsed < slowdownStart
        ? 140
        : 500 + Math.pow(slowdownProgress, 1.8) * 3000;
      this.spinTimers.push(window.setTimeout(playTick, tickDelay));
    };

    playTick();
  }

  closeWinnerBox(): void {
    this.winnerBoxVisible = false;
  }

  private async notifyWinner(winner: RaffleEntry): Promise<void> {
    if (!this.raffle) {
      return;
    }

    try {
      await fetch(`${environment.raffleGrpcHttpUrl}/winners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raffleId: this.raffle.id,
          spinId: `spin-${Date.now()}`,
          winnerId: winner.number,
          winnerName: winner.name,
        })
      });
    } catch {
      // The raffle remains usable when the optional local gRPC bridge is offline.
    }
  }

  async addWinnerToList(item: DrawItem): Promise<void> {
    if (this.raffle) {
      this.raffle.history = this.raffle.history.map((historyItem) => historyItem.id === item.id
        ? {
          ...historyItem,
          winnerStatus: 'processed',
          processedAt: new Date().toISOString()
        }
        : historyItem);
    }

    if (!this.entries.some((entry) => entry.name === item.winnerName && entry.number === item.drawnNumber)) {
      this.entries = [...this.entries, { name: item.winnerName, number: item.drawnNumber }];
      this.namesText = this.formatEntries();
    }

    if (this.raffle) {
      const playerIndex = this.raffle.players.findIndex((player) =>
        player.name === item.winnerName
        && String(player.assignedNumber).padStart(this.raffle?.digitCount ?? 3, '0') === item.drawnNumber
      );
      if (playerIndex >= 0) {
        this.raffle.players = this.raffle.players.map((player, index) => index === playerIndex
          ? { ...player, drawn: false, status: 'active' }
          : player);
      } else {
        this.raffle.players = [...this.raffle.players, {
          id: `${this.raffle.id}-${Date.now()}`,
          name: item.winnerName,
          assignedNumber: Number(item.drawnNumber),
          drawn: false,
          status: 'active'
        }];
      }
    }

    if (this.raffle && !this.standaloneRaffle) {
      await this.raffleService.saveRaffle(this.raffle);
    }
  }

  async removeWinner(): Promise<void> {
    if (!this.winner) {
      return;
    }

    const winnerName = this.winner.name;
    const winnerNumber = this.winner.number;
    this.winner = null;
    this.removedMessage = `Player ${winnerNumber} • ${winnerName} has been removed from the game`;
    if (this.removeNoticeTimeout) {
      window.clearTimeout(this.removeNoticeTimeout);
    }
    this.removeNoticeTimeout = window.setTimeout(() => {
      this.removedMessage = '';
      this.removeNoticeTimeout = undefined;
    }, 2000);
    if (this.raffle) {
      const historyIndex = [...this.raffle.history]
        .map((item, index) => ({ item, index }))
        .reverse()
        .find(({ item }) => item.winnerName === winnerName && item.drawnNumber === winnerNumber)?.index;
      if (historyIndex !== undefined) {
        this.raffle.history[historyIndex] = {
          ...this.raffle.history[historyIndex],
          excludedFromList: true
        };
      }
    }
    this.entries = this.entries.filter((entry) => entry.name !== winnerName || entry.number !== winnerNumber);
    this.namesText = this.formatEntries();

    if (this.raffle) {
      this.raffle.players = this.raffle.players.map((player) =>
        player.name === winnerName
        && String(player.assignedNumber).padStart(this.raffle?.digitCount ?? 3, '0') === winnerNumber
          ? { ...player, drawn: true, status: 'winner' }
          : player
      );
      if (!this.standaloneRaffle) {
        await this.raffleService.saveRaffle(this.raffle);
      }
    }
  }
}