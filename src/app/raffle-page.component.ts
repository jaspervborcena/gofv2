import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ActivatedRoute, Router } from '@angular/router';
import { gsap } from 'gsap';
import { BehaviorSubject } from 'rxjs';
import { DrawItem, NumberMode, Player, Raffle, RaffleService, SpinMode } from './raffle.service';
import { FREE_MAX_PLAYERS } from './plan-schema';

@Component({
  selector: 'app-raffle-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './raffle-page.component.html',
  styleUrl: './raffle-page.component.scss'
})
export class RafflePageComponent implements OnDestroy, OnInit {
  private readonly raffleService = inject(RaffleService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly stopSound = new Audio('/assets/slot-stop.mp3');
  private readonly winSound = new Audio('/assets/slot-win.mp3');
  private readonly raffleState$ = new BehaviorSubject<Raffle | null>(null);
  private spinTickTimers: number[] = [];

  raffle: Raffle | null = null;
  isPreviewRaffle = false;
  activeTab: 'raffle' | 'players' | 'history' | 'qr' = 'raffle';
  activePlayersTab: 'names' | 'text' = 'names';
  historySubTab: 'history' | 'winners' = 'history';
  playersText = '';
  editorText = '';
  private savedEditorText = '';
  private editorSaveTimeout?: number;
  private duplicateMessageTimeout?: number;
  private participantMessageTimeout?: number;
  joinedName = '';
  participantSaveMessage = '';
  duplicateNames: string[] = [];
  participantLimitMessage = '';
  spinLimitMessage = '';
  readonly freePlayerLimit = FREE_MAX_PLAYERS;
  exclusionMessage = '';
  private exclusionMessageTimeout?: number;
  playerNumberMode: NumberMode = 'random';
  reels = ['🎰', '🎰', '🎰'];
  reelStrip = Array.from({ length: 100 }, (_, index) => index % 10);
  reelPositions = [0, 0, 0];
  lastWinner: { name: string; number: string } | null = null;
  isSpinning = false;
  spinProgress = 0;
  leftPanelOpen = false;
  rightPanelOpen = false;
  participantPage = 1;
  participantPageSize = 20;

  ngOnDestroy(): void {
    this.clearSpinTickTimers();
    if (this.editorSaveTimeout) {
      window.clearTimeout(this.editorSaveTimeout);
    }
    if (this.duplicateMessageTimeout) {
      window.clearTimeout(this.duplicateMessageTimeout);
    }
    if (this.participantMessageTimeout) {
      window.clearTimeout(this.participantMessageTimeout);
    }
  }

  get editorHasChanges(): boolean {
    return this.editorText !== this.savedEditorText;
  }

  async selectMainTab(tab: 'raffle' | 'players' | 'history' | 'qr'): Promise<void> {
    if (!(await this.confirmEditorChanges())) {
      return;
    }

    this.activeTab = tab;
  }

  async selectPlayersTab(tab: 'names' | 'text'): Promise<void> {
    if (tab !== 'text' && !(await this.confirmEditorChanges())) {
      return;
    }

    this.activePlayersTab = tab;
  }

  handleEditorChange(): void {
    this.detectDuplicateNames();
    this.scheduleEditorSave();
  }

  keepDuplicateNames(): void {
    this.removeDuplicateNames();
  }

  removeDuplicateNames(): void {
    const seen = new Set<string>();
    this.editorText = this.editorText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => {
        const key = this.editorLineName(line).toLocaleLowerCase();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .join('\n');
    this.duplicateNames = [];
    this.assignMissingNumbers();
    this.showDuplicateActionMessage('Duplicate names removed.');
    this.scheduleEditorSave();
  }

  private detectDuplicateNames(): void {
    const counts = new Map<string, string>();
    this.editorText.split('\n').map((line) => line.trim()).filter(Boolean).forEach((line) => {
      const name = this.editorLineName(line);
      counts.set(name.toLocaleLowerCase(), name);
    });
    const occurrences = new Map<string, number>();
    this.editorText.split('\n').map((line) => line.trim()).filter(Boolean).forEach((line) => {
      const key = this.editorLineName(line).toLocaleLowerCase();
      occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
    });
    this.duplicateNames = [...occurrences.entries()]
      .filter(([, count]) => count > 1)
      .map(([key]) => counts.get(key) ?? key);
    if (this.duplicateNames.length && this.editorSaveTimeout) {
      window.clearTimeout(this.editorSaveTimeout);
      this.editorSaveTimeout = undefined;
    }
  }

  private editorLineName(line: string): string {
    const parts = line.split('•').map((part) => part.trim());
    return parts.length > 1 && /^\d+$/.test(parts[0]) ? parts.slice(1).join(' • ') : parts[0];
  }

  private showDuplicateActionMessage(message: string): void {
    this.participantSaveMessage = message;
    if (this.duplicateMessageTimeout) {
      window.clearTimeout(this.duplicateMessageTimeout);
    }
    this.duplicateMessageTimeout = window.setTimeout(() => {
      this.participantSaveMessage = '';
      this.duplicateMessageTimeout = undefined;
    }, 900);
  }

  scheduleEditorSave(): void {
    if (this.duplicateNames.length) {
      return;
    }
    this.participantSaveMessage = 'Auto Saving changes...';
    if (this.editorSaveTimeout) {
      window.clearTimeout(this.editorSaveTimeout);
    }

    this.editorSaveTimeout = window.setTimeout(() => {
      void this.savePlayers().catch((error) => {
        this.participantSaveMessage = error instanceof Error
          ? `Auto save failed: ${error.message}`
          : 'Auto save failed. Please try again.';
      });
    }, 900);
  }

  private async confirmEditorChanges(): Promise<boolean> {
    if (!this.editorHasChanges || this.activePlayersTab !== 'text') {
      return true;
    }

    const saveChanges = window.confirm('You have unsaved participant changes. Click OK to save before leaving, or Cancel to discard them.');
    if (saveChanges) {
      try {
        await this.savePlayers();
        return true;
      } catch {
        return false;
      }
    }

    this.editorText = this.savedEditorText;
    return true;
  }

  get activePlayers(): Player[] {
    return (this.raffle?.players ?? []).filter((player) => !player.drawn);
  }

  get visiblePlayers(): Player[] {
    const start = (this.participantPage - 1) * this.participantPageSize;
    return this.activePlayers.slice(start, start + this.participantPageSize);
  }

  get participantPageCount(): number {
    return Math.max(1, Math.ceil(this.activePlayers.length / this.participantPageSize));
  }

  get hasParticipantPagination(): boolean {
    return this.activePlayers.length > this.participantPageSize;
  }

  get isRaffleCurrent(): boolean {
    return !!this.raffle && this.raffleService.isRaffleActive(this.raffle);
  }

  @HostListener('window:resize')
  updateParticipantPageSize(): void {
    this.participantPageSize = window.innerWidth <= 600 ? 10 : 20;
    this.participantPage = Math.min(this.participantPage, this.participantPageCount);
  }

  goToParticipantPage(page: number): void {
    this.participantPage = Math.max(1, Math.min(page, this.participantPageCount));
  }

  togglePanel(panel: 'left' | 'right'): void {
    if (panel === 'left') {
      this.leftPanelOpen = !this.leftPanelOpen;
      this.rightPanelOpen = false;
      return;
    }

    this.rightPanelOpen = !this.rightPanelOpen;
    this.leftPanelOpen = false;
  }

  ngOnInit(): void {
    this.updateParticipantPageSize();
    this.route.paramMap.subscribe(async (params) => {
      const id = params.get('id');
      if (!id) {
        this.isPreviewRaffle = true;
        this.raffle = this.createPreviewRaffle();
        this.raffleState$.next(this.raffle);
        this.playersText = this.raffle.players.map((player) => player.name).join('\n');
        this.editorText = this.formatEditorText();
        this.savedEditorText = this.editorText;
        this.reelPositions = Array(this.raffle.digitCount ?? 3).fill(0);
        this.reels = Array(this.raffle.digitCount ?? 3).fill('0');
        return;
      }

      const raffles = await this.raffleService.listRaffles();
      this.raffle = raffles.find((item) => item.id === id || item.gameId === id) ?? null;
      if (this.raffle) {
        this.isPreviewRaffle = false;
        const participantRecords = await this.raffleService.listParticipants(this.raffle.gameUid);
        if (participantRecords.length) {
          this.raffle.players = participantRecords.map((participant) => ({
            id: participant.id,
            name: participant.name,
            assignedNumber: participant.assignedNumber,
            drawn: participant.status === 'winner',
            status: participant.status,
            ...(participant.mobileNumber ? { mobileNumber: participant.mobileNumber } : {}),
            ...(participant.remarks ? { remarks: participant.remarks } : {})
          }));
        }
        this.raffleState$.next(this.raffle);
        this.playersText = this.raffle.players.map((player) => player.name).join('\n');
        this.editorText = this.formatEditorText();
        this.savedEditorText = this.editorText;
        this.playerNumberMode = this.raffle.numberMode;
        const digitCount = this.raffle.digitCount ?? 3;
        this.reelPositions = Array(digitCount).fill(0);
        this.reels = Array(digitCount).fill('0');
        return;
      }

      this.isPreviewRaffle = false;
      this.raffleState$.next(null);
      await this.router.navigate(['/raffle-unavailable'], {
        queryParams: {
          title: 'Raffle unavailable',
          message: 'This raffle could not be found, has expired, or is no longer available.'
        }
      });
    });
  }

  async savePlayers(): Promise<void> {
    if (!this.raffle) {
      return;
    }

    this.assignMissingNumbers();

    const entries = this.editorText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const parts = line.split('•').map((part) => part.trim());
        const explicitNumber = parts.length > 1 && /^\d+$/.test(parts[0]) ? Number(parts[0]) : null;
        return {
          name: explicitNumber === null ? parts[0] : parts.slice(1).join(' • '),
          assignedNumber: explicitNumber ?? (this.playerNumberMode === 'ordered' ? index + 1 : this.createRandomNumber())
        };
      });

    const names = entries.map((entry) => entry.name);
    const duplicateNames = this.findDuplicateNames(names);
    if (duplicateNames.length) {
      this.duplicateNames = duplicateNames;
      this.participantSaveMessage = `Duplicate names are not allowed: ${duplicateNames.join(', ')}.`;
      return;
    }
    this.playersText = names.join('\n');
    this.raffle.players = entries
      .filter((entry) => entry.name)
      .map((entry, index) => ({
      id: `${this.raffle!.id}-${index}`,
      name: entry.name,
      assignedNumber: entry.assignedNumber,
      drawn: false
    }));
    this.editorText = this.formatEditorText();
    this.savedEditorText = this.editorText;
    this.participantPage = 1;
    this.raffle.remainingDraws = Math.max(this.raffle.remainingDraws, this.raffle.players.length);
    this.raffle.numberMode = this.playerNumberMode;
    await this.saveRaffleIfPersisted();
    this.participantSaveMessage = 'Participants saved';
  }

  assignMissingNumbers(): void {
    if (!this.raffle || !this.editorText.trim()) {
      return;
    }

    const usedNumbers = new Set<number>();
    let nextOrderedNumber = 1;
    let lines = this.editorText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length > this.freePlayerLimit) {
      lines = lines.slice(0, this.freePlayerLimit);
      this.participantLimitMessage = `Player limit reached: only ${this.freePlayerLimit} players can be added.`;
    }

    this.editorText = lines.map((line, index) => {
      const parts = line.split('•').map((part) => part.trim());
      const explicitNumber = parts.length > 1 && /^\d+$/.test(parts[0]) ? Number(parts[0]) : null;
      const name = explicitNumber === null ? parts[0] : parts.slice(1).join(' • ');
      if (explicitNumber !== null) {
        usedNumbers.add(explicitNumber);
        nextOrderedNumber = Math.max(nextOrderedNumber, explicitNumber + 1);
      }
      let assignedNumber = explicitNumber;
      if (assignedNumber === null) {
        if (this.playerNumberMode === 'ordered') {
          while (usedNumbers.has(nextOrderedNumber)) {
            nextOrderedNumber += 1;
          }
          assignedNumber = nextOrderedNumber;
          nextOrderedNumber += 1;
        } else {
          assignedNumber = this.createRandomNumber(usedNumbers);
        }
      }
      usedNumbers.add(assignedNumber);
      return `${this.formatNumber(assignedNumber)} • ${name}`;
    }).join('\n');
  }

  async joinEntry(): Promise<void> {
    const name = this.joinedName.trim();
    if (!this.raffle || !name) {
      return;
    }

    if (this.raffle.players.length >= this.freePlayerLimit) {
      this.participantLimitMessage = `Player limit reached: only ${this.freePlayerLimit} players can be added.`;
      return;
    }

    const duplicate = this.raffle.players.find((player) => player.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
    if (duplicate) {
      this.showParticipantMessage(`The name "${name}" has already joined this raffle.`);
      return;
    }

    const assignedNumber = this.playerNumberMode === 'ordered'
      ? this.raffle.players.length + 1
      : this.createRandomNumber();
    const player: Player = {
      id: `${this.raffle.id}-${Date.now()}`,
      name,
      assignedNumber,
      drawn: false
    };

    try {
      if (!this.isPreviewRaffle && this.raffle.gameId) {
        await this.raffleService.saveParticipant(this.raffle, player);
      }
    } catch (error) {
      this.participantLimitMessage = error instanceof Error
        ? `Could not save participant: ${error.message}`
        : 'Could not save participant. Please try again.';
      return;
    }

    this.raffle.players = [...this.raffle.players, player];
    this.joinedName = '';
    this.playersText = this.raffle.players.map((player) => player.name).join('\n');
    this.editorText = this.formatEditorText();
    this.participantPage = this.participantPageCount;
    this.raffle.remainingDraws = Math.max(this.raffle.remainingDraws, this.raffle.players.length);
    await this.saveRaffleIfPersisted();
    this.participantLimitMessage = '';
  }

  private findDuplicateNames(names: string[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Map<string, string>();
    names.forEach((name) => {
      const normalizedName = name.trim().toLocaleLowerCase();
      if (seen.has(normalizedName)) {
        duplicates.set(normalizedName, name.trim());
      }
      seen.add(normalizedName);
    });
    return [...duplicates.values()];
  }

  private showParticipantMessage(message: string): void {
    this.participantLimitMessage = message;
    if (this.participantMessageTimeout) {
      window.clearTimeout(this.participantMessageTimeout);
    }
    this.participantMessageTimeout = window.setTimeout(() => {
      this.participantLimitMessage = '';
      this.participantMessageTimeout = undefined;
    }, 2000);
  }

  setPlayerNumberMode(mode: NumberMode): void {
    this.playerNumberMode = mode;
    if (!this.raffle) {
      return;
    }

    const usedNumbers = new Set<number>();
    this.raffle.players = this.raffle.players.map((player, index) => {
      const assignedNumber = mode === 'ordered'
        ? index + 1
        : this.createRandomNumber(usedNumbers);
      usedNumbers.add(assignedNumber);
      return { ...player, assignedNumber };
    });
    this.editorText = this.formatEditorText();
  }

  get excludedWinners(): DrawItem[] {
    return (this.raffle?.history ?? []).filter((item) => item.excludedFromList === true);
  }

  async restoreWinner(historyId?: string): Promise<void> {
    if (!this.raffle) {
      return;
    }

    const historyItem = this.raffle.history.find((item) => item.id === historyId);
    if (!historyItem) {
      return;
    }

    this.raffle.history = this.raffle.history.map((item) => item.id === historyId
      ? { ...item, excludedFromList: false }
      : item);
    const existingPlayer = this.raffle.players.find((player) =>
      player.id === historyItem.participantId
      || (player.name === historyItem.winnerName && this.formatNumber(player.assignedNumber) === historyItem.drawnNumber));
    if (existingPlayer) {
      this.raffle.players = this.raffle.players.map((player) => player.id === existingPlayer.id
        ? { ...player, drawn: false, status: 'active' }
        : player);
    } else {
      this.raffle.players = [...this.raffle.players, {
        id: historyItem.participantId ?? `${this.raffle.id}-${Date.now()}`,
        name: historyItem.winnerName,
        assignedNumber: Number(historyItem.drawnNumber),
        drawn: false,
        status: 'active'
      }];
    }
    this.editorText = this.formatEditorText();
      this.showExclusionMessage(`Restored ${historyItem.drawnNumber} • ${historyItem.winnerName} to the participant list.`);
    await this.saveRaffleIfPersisted();
  }

  async excludeLastWinner(): Promise<void> {
    if (!this.raffle || !this.lastWinner) {
      return;
    }

    const historyIndex = [...this.raffle.history]
      .map((item, index) => ({ item, index }))
      .reverse()
      .find(({ item }) => item.winnerName === this.lastWinner!.name && item.drawnNumber === this.lastWinner!.number)?.index;
    if (historyIndex === undefined) {
      return;
    }

    const item = this.raffle.history[historyIndex];
    const winnerPlayer = this.raffle.players.find((player) =>
      player.id === item.participantId
      || (player.name === item.winnerName && this.formatNumber(player.assignedNumber) === item.drawnNumber));
    this.raffle.history[historyIndex] = {
      ...item,
      excludedFromList: true,
      participantId: item.participantId ?? winnerPlayer?.id
    };
    this.raffle.players = this.raffle.players.filter((player) => player.id !== winnerPlayer?.id);
    this.editorText = this.formatEditorText();
    this.showExclusionMessage(`Excluded ${item.drawnNumber} • ${item.winnerName} from the participant list.`);
    await this.saveRaffleIfPersisted();
  }

  private showExclusionMessage(message: string): void {
    this.exclusionMessage = message;
    if (this.exclusionMessageTimeout) {
      window.clearTimeout(this.exclusionMessageTimeout);
    }
    this.exclusionMessageTimeout = window.setTimeout(() => {
      this.exclusionMessage = '';
      this.exclusionMessageTimeout = undefined;
    }, 2000);
  }

  async updateMode(mode: SpinMode): Promise<void> {
    if (!this.raffle) {
      return;
    }

    this.raffle.mode = mode;
    await this.saveRaffleIfPersisted();
  }

  async spin(): Promise<void> {
    if (!this.raffle || this.isSpinning) {
      return;
    }

    const players = this.raffle.players;
    if (!players.length) {
      this.showExclusionMessage('Please add players before spinning the raffle.');
      return;
    }

    let spinAllowance: { allowed: boolean; spinsRemaining: number };
    try {
      spinAllowance = await this.raffleService.consumeSpin();
    } catch (error) {
      this.spinLimitMessage = error instanceof Error
        ? `Unable to check spins: ${error.message}`
        : 'Unable to check your spins. Please try again.';
      this.isSpinning = false;
      return;
    }
    if (!spinAllowance.allowed) {
      this.spinLimitMessage = 'You do not have enough spins left. Please subscribe to continue.';
      return;
    }
    this.spinLimitMessage = '';

    this.isSpinning = true;
    this.lastWinner = null;
    this.clearSpinTickTimers();
    const winner = players[Math.floor(Math.random() * players.length)];
    const targetReels = this.formatNumber(winner.assignedNumber).split('').map((digit) => Number(digit));

    const digitStates = targetReels.map(() => ({ spinPos: 0 }));
    const maxSpinPos = 80; // rows, kept within the repeated reel strip
    const digitCount = this.raffle.digitCount ?? targetReels.length;
    const fastDuration = 5 + Math.max(0, Math.min(3, digitCount - 3)) * 2;
    const slowdownDuration = 3;

    // Create GSAP timeline
    const tl = gsap.timeline({
      onUpdate: () => {
        this.reelPositions = digitStates.map((state) => state.spinPos);
        this.spinProgress = tl.progress() * 100;
      },
      onComplete: async () => {
        // Animation complete - lock in final values
        this.clearSpinTickTimers();
        this.stopSound.currentTime = 0;
        void this.stopSound.play().catch(() => undefined);
        this.reelPositions = targetReels.map((val) => val);
        this.reels = targetReels.map((num) => num.toString());
        this.lastWinner = { name: winner.name, number: this.formatNumber(winner.assignedNumber) };
        this.isSpinning = false;
        this.spinProgress = 100;
        this.winSound.currentTime = 0;
        void this.winSound.play().catch(() => undefined);

        // Save to Firestore
        this.raffle!.history = [
          ...this.raffle!.history,
          {
            id: `${this.raffle!.id}-${Date.now()}`,
            roundNumber: this.nextRoundNumber(),
            winnerName: winner.name,
            drawnNumber: this.formatNumber(winner.assignedNumber),
            timestamp: new Date().toISOString(),
            participantId: winner.id,
            participantName: winner.name,
            winnerStatus: 'active',
          }
        ];
        this.raffle!.remainingDraws = Math.max(0, this.raffle!.remainingDraws - 1);
        this.raffle!.lastWinner = winner.name;
        this.raffle!.lastNumber = this.formatNumber(winner.assignedNumber);
        await this.saveRaffleIfPersisted();
      }
    });

    const perDigit = this.raffle.mode === 'per-digit';
    digitStates.forEach((state, index) => {
      const delay = perDigit ? index * 0.5 : 0;
      tl.to(state, {
        spinPos: maxSpinPos,
        duration: fastDuration,
        ease: 'power1.inOut'
      }, delay);
      tl.to(state, {
        spinPos: targetReels[index],
        duration: slowdownDuration,
        ease: 'power3.out'
      }, fastDuration + delay);
    });
    this.scheduleSpinTicks(fastDuration, slowdownDuration);
  }

  private scheduleSpinTicks(fastDuration: number, slowdownDuration: number): void {
    const totalDuration = (fastDuration + slowdownDuration) * 1000;
    const slowdownStart = fastDuration * 1000;
    const startedAt = performance.now();

    const playTick = (): void => {
      const elapsed = performance.now() - startedAt;
      if (elapsed >= totalDuration || !this.isSpinning) {
        return;
      }

      this.stopSound.pause();
      this.stopSound.currentTime = 0;
      void this.stopSound.play().catch(() => undefined);

      const slowdownProgress = Math.max(0, Math.min(1, (elapsed - slowdownStart) / (slowdownDuration * 1000)));
      const delay = elapsed < slowdownStart
        ? 140
        : 500 + Math.pow(slowdownProgress, 1.8) * 3000;
      this.spinTickTimers.push(window.setTimeout(playTick, delay));
    };

    playTick();
  }

  private clearSpinTickTimers(): void {
    this.spinTickTimers.forEach((timer) => window.clearTimeout(timer));
    this.spinTickTimers = [];
  }

  private createRandomNumber(usedNumbers?: Set<number>): number {
    const digitCount = this.raffle?.digitCount ?? 3;
    const minimum = 10 ** (digitCount - 1);
    const maximum = 10 ** digitCount - 1;
    let number = Math.floor(minimum + Math.random() * (maximum - minimum + 1));
    while (usedNumbers?.has(number)) {
      number = Math.floor(minimum + Math.random() * (maximum - minimum + 1));
    }
    return number;
  }

  formatNumber(number: number): string {
    return String(number).padStart(this.raffle?.digitCount ?? 3, '0');
  }

  private formatEditorText(): string {
    return (this.raffle?.players ?? [])
      .map((player) => `${this.formatNumber(player.assignedNumber)} • ${player.name}`)
      .join('\n');
  }

  private nextRoundNumber(): string {
    return String((this.raffle?.history.length ?? 0) + 1);
  }

  private createPreviewRaffle(): Raffle {
    const now = new Date();
    const players: Player[] = [
      { id: 'preview-1', name: 'Mina', assignedNumber: 248, drawn: false },
      { id: 'preview-2', name: 'Drew', assignedNumber: 731, drawn: false },
      { id: 'preview-3', name: 'Lina', assignedNumber: 564, drawn: false },
      { id: 'preview-4', name: 'Kai', assignedNumber: 902, drawn: false }
    ];

    return {
      id: 'preview-raffle',
      gameId: '',
      gameUid: 'preview-raffle',
      name: 'Lucky Draws',
      creatorId: 'preview',
      mode: 'simultaneous',
      numberMode: 'ordered',
      digitCount: 3,
      remarks: 'Winner takes all',
      players,
      history: [],
      remainingDraws: players.length,
      createdAt: now.toISOString(),
      startAt: now.toISOString(),
      closeAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      closedAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };
  }

  private async saveRaffleIfPersisted(): Promise<void> {
    if (!this.raffle || this.isPreviewRaffle || !this.raffle.gameId) {
      this.raffleState$.next(this.raffle);
      return;
    }

    await this.raffleService.saveRaffle(this.raffle);
    this.raffleState$.next(this.raffle);
  }

  resetRaffle(): void {
    const digitCount = this.raffle?.digitCount ?? 3;
    this.reels = Array(digitCount).fill('🎰');
    this.reelPositions = Array(digitCount).fill(0);
    this.lastWinner = null;
  }
}
