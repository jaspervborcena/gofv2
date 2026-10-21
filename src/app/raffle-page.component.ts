import { Component, HostListener, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ActivatedRoute, Router } from '@angular/router';
import { gsap } from 'gsap';
import confetti from 'canvas-confetti';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { ActiveSpin, DrawItem, NumberMode, Player, Raffle, RaffleService, SpinMode } from './raffle.service';
import { FREE_MAX_PLAYERS, planCatalog } from './plan-schema';

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
  private readonly zone = inject(NgZone);
  private readonly stopSound = new Audio('/assets/slot-stop.mp3');
  private readonly winSound = new Audio('/assets/slot-win.mp3');
  private readonly raffleState$ = new BehaviorSubject<Raffle | null>(null);
  private spinTickTimers: number[] = [];
  private spinTimeline?: gsap.core.Timeline;
  private spinFastDuration = 0;
  private spinSlowdownDuration = 0;
  private stopWatchingSpin?: () => void;
  private scheduledSpinTimer?: number;
  private countdownTimer?: number;
  private activeSpinId?: string;
  private spinEndTimer?: number;
  private finishingSpinId?: string;
  private currentSpin?: { spin: ActiveSpin; winner: Player; ticketNumber: string; targetReels: number[] };

  raffle: Raffle | null = null;
  isGameCreator = false;
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
  private confettiTimers: number[] = [];
  private stopWatchingParticipants?: () => void;
  joinedName = '';
  useJoinedNumber = false;
  joinedNumber = '';
  participantSaveMessage = '';
  duplicateNames: string[] = [];
  participantLimitMessage = '';
  spinLimitMessage = '';
  playerLimit = FREE_MAX_PLAYERS;
  exclusionMessage = '';
  private exclusionMessageTimeout?: number;
  playerNumberMode: NumberMode = 'random';
  reels = ['🎰', '🎰', '🎰'];
  reelStrip = Array.from({ length: 100 }, (_, index) => '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[index % 36]);
  reelPositions = [0, 0, 0];
  lastWinner: { name: string; number: string } | null = null;
  isSpinning = false;
  spinCountdown: number | null = null;
  isRefreshingParticipants = false;
  spinExitDialogOpen = false;
  spinProgress = 0;
  leftPanelOpen = false;
  rightPanelOpen = false;
  participantPage = 1;
  participantPageSize = 20;
  phoneNumbersVisible = false;
  participantRemarksVisible = false;
  ngOnDestroy(): void {
    this.stopParticipantListener();
    this.stopWatchingSpin?.();
    this.raffleService.setRaffleSpinning(false);
    this.clearSpinTickTimers();
    this.clearScheduledSpinTimers();
    this.spinTimeline?.kill();
    this.spinTimeline = undefined;
    this.stopSound.pause();
    this.winSound.pause();
    this.clearConfetti();
    if (this.editorSaveTimeout) {
      window.clearTimeout(this.editorSaveTimeout);
    }
    if (this.duplicateMessageTimeout) {
      window.clearTimeout(this.duplicateMessageTimeout);
    }
    if (this.participantMessageTimeout) {
      window.clearTimeout(this.participantMessageTimeout);
    }
    if (this.exclusionMessageTimeout) {
      window.clearTimeout(this.exclusionMessageTimeout);
    }
  }

  get editorHasChanges(): boolean {
    return this.editorText !== this.savedEditorText;
  }

  get canManageGame(): boolean {
    return this.isPreviewRaffle || this.isGameCreator;
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

  async refreshParticipants(): Promise<void> {
    const gameUid = this.raffle?.gameUid;
    if (!gameUid || !this.canManageGame || this.isPreviewRaffle || this.isRefreshingParticipants) {
      return;
    }

    this.isRefreshingParticipants = true;
    this.participantLimitMessage = '';
    try {
      const participants = await this.raffleService.listParticipants(gameUid);
      if (this.raffle?.gameUid === gameUid) {
        this.applyParticipantRecords(participants);
      }
    } catch (error) {
      if (this.raffle?.gameUid === gameUid) {
        this.participantLimitMessage = error instanceof Error
          ? `Could not refresh participants: ${error.message}`
          : 'Could not refresh participants. Please try again.';
      }
    } finally {
      this.isRefreshingParticipants = false;
    }
  }

  handleEditorChange(): void {
    this.detectDuplicateNames();
    this.scheduleEditorSave();
  }

  keepDuplicateNames(): void {
    const usedNames = new Set<string>();
    this.editorText = this.editorLines()
      .map((line) => {
        const baseName = this.editorLineName(line);
        let name = baseName;
        let copyNumber = 2;
        while (usedNames.has(name.toLocaleLowerCase())) {
          name = `${baseName}(${copyNumber})`;
          copyNumber += 1;
        }
        usedNames.add(name.toLocaleLowerCase());
        const parts = line.split('•').map((part) => part.trim());
        return parts.length > 1 && /^\d+$/.test(parts[0])
          ? `${parts[0]} • ${name}`
          : name;
      })
      .join('\n');
    this.duplicateNames = [];
    this.assignMissingNumbers();
    this.showDuplicateActionMessage('Duplicate copies kept.');
    this.scheduleEditorSave();
  }

  removeDuplicateNames(): void {
    const seen = new Set<string>();
    this.editorText = this.editorLines()
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
    this.editorLines().forEach((line) => {
      const name = this.editorLineName(line);
      counts.set(name.toLocaleLowerCase(), name);
    });
    const occurrences = new Map<string, number>();
    this.editorLines().forEach((line) => {
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

  private editorLines(): string[] {
    return this.editorText.split(/\r\n?|\n/).map((line) => line.trim()).filter(Boolean);
  }

  private showDuplicateActionMessage(message: string): void {
    this.participantSaveMessage = message;
    if (this.duplicateMessageTimeout) {
      window.clearTimeout(this.duplicateMessageTimeout);
    }
    this.duplicateMessageTimeout = window.setTimeout(() => {
      this.participantSaveMessage = '';
      this.duplicateMessageTimeout = undefined;
    }, 2000);
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
      this.stopParticipantListener();
      this.stopWatchingSpin?.();
      this.clearScheduledSpinTimers();
      this.isGameCreator = false;
      this.isPreviewRaffle = false;
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

      this.raffle = await this.raffleService.findRaffle(id);
      if (this.raffle) {
        const currentUser = await firstValueFrom(this.raffleService.user$);
        this.isGameCreator = this.raffle.creatorId === currentUser?.uid;
        if (!this.isGameCreator) {
          const currentUserId = currentUser?.uid ?? null;
          const participant = currentUserId
            ? await this.raffleService.findUserParticipantForGame(this.raffle.gameUid, currentUserId)
            : null;
          if (participant) {
            await this.router.navigate(['/games', this.raffle.gameId, 'join']);
            return;
          }

          if (this.raffleService.isRaffleActive(this.raffle)) {
            await this.router.navigate(['/games', this.raffle.gameId, 'join']);
            return;
          }

          await this.router.navigate(['/raffle-unavailable'], {
            queryParams: {
              title: 'Raffle unavailable',
              message: 'This raffle could not be found, has expired, or is no longer available.'
            }
          });
          return;
        }

        const ownerPlan = await this.raffleService.getCurrentUserPlan(this.raffle.creatorId);
        const catalogPlan = planCatalog.find((item) => item.id === (ownerPlan === 'free' ? 'freemium' : ownerPlan));
        this.playerLimit = catalogPlan?.maxPlayers ?? FREE_MAX_PLAYERS;
        const participantRecords = await this.raffleService.listParticipants(this.raffle.gameUid);
        if (participantRecords.length) {
          this.applyParticipantRecords(participantRecords);
        }
        this.raffleState$.next(this.raffle);
        this.playersText = this.raffle.players.map((player) => player.name).join('\n');
        this.editorText = this.formatEditorText();
        this.savedEditorText = this.editorText;
        this.playerNumberMode = this.raffle.numberMode;
        const digitCount = this.raffle.digitCount ?? 3;
        this.reelPositions = Array(digitCount).fill(0);
        this.reels = Array(digitCount).fill('0');
        this.watchGameParticipants(this.raffle.gameUid);
        this.watchActiveSpin(this.raffle.gameUid);
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

  private watchGameParticipants(gameUid: string): void {
    this.stopParticipantListener();
    let isInitialSnapshot = true;
    this.stopWatchingParticipants = this.raffleService.watchParticipants(
      gameUid,
      (participants) => this.zone.run(() => {
        if (this.raffle?.gameUid !== gameUid || !this.isGameCreator) {
          return;
        }
        if (isInitialSnapshot && participants.length === 0) {
          isInitialSnapshot = false;
          return;
        }
        isInitialSnapshot = false;
        this.applyParticipantRecords(participants);
      }),
      (error) => this.zone.run(() => {
        if (this.raffle?.gameUid === gameUid) {
          this.participantLimitMessage = `Live participant updates stopped: ${error.message}`;
        }
      })
    );
  }

  private stopParticipantListener(): void {
    this.stopWatchingParticipants?.();
    this.stopWatchingParticipants = undefined;
  }

  private applyParticipantRecords(participants: Awaited<ReturnType<RaffleService['listParticipants']>>): void {
    if (!this.raffle) {
      return;
    }

    this.raffle.players = participants.map((participant) => ({
      id: participant.id,
      userId: participant.userId,
      name: participant.name,
      assignedNumber: participant.assignedNumber,
      ...(participant.ticketCode ? { ticketCode: participant.ticketCode } : {}),
      drawn: participant.status === 'winner',
      status: participant.status,
      ...(participant.mobileNumber ? { mobileNumber: participant.mobileNumber } : {}),
      ...(participant.remarks ? { remarks: participant.remarks } : {})
    }));
    this.playersText = this.raffle.players.map((player) => player.name).join('\n');
    if (!this.editorHasChanges) {
      this.editorText = this.formatEditorText();
      this.savedEditorText = this.editorText;
    }
    this.participantPage = Math.min(this.participantPage, this.participantPageCount);
    this.raffleState$.next(this.raffle);
  }

  async savePlayers(): Promise<void> {
    if (!this.raffle) {
      return;
    }

    this.assignMissingNumbers();

    const entries = this.editorLines()
      .map((line, index) => {
        const { ticketNumber, name } = this.parsePlayerEntry(line);
        const existingPlayer = this.raffle!.players.find((player) =>
          player.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());
        const isAlphanumericTicket = ticketNumber !== null && !/^\d+$/.test(ticketNumber);
        return {
          name,
          assignedNumber: ticketNumber !== null && !isAlphanumericTicket
            ? Number(ticketNumber)
            : existingPlayer?.assignedNumber ?? (this.playerNumberMode === 'ordered' ? index + 1 : this.createRandomNumber()),
          ...(isAlphanumericTicket ? { ticketCode: ticketNumber } : {})
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
      .map((entry, index) => {
        const existingPlayer = this.raffle!.players.find((player) =>
          player.name.trim().toLocaleLowerCase() === entry.name.trim().toLocaleLowerCase());
        return {
          id: existingPlayer?.id ?? `${this.raffle!.id}-${index}`,
          userId: existingPlayer?.userId,
          name: entry.name,
          assignedNumber: entry.assignedNumber,
          ...(entry.ticketCode ? { ticketCode: entry.ticketCode } : {}),
          drawn: existingPlayer?.drawn ?? false,
          status: existingPlayer?.status,
          mobileNumber: existingPlayer?.mobileNumber,
          remarks: existingPlayer?.remarks
        };
      });
    this.editorText = this.formatEditorText();
    this.savedEditorText = this.editorText;
    this.participantPage = 1;
    this.raffle.remainingDraws = Math.max(this.raffle.remainingDraws, this.raffle.players.length);
    this.raffle.numberMode = this.playerNumberMode;
    await this.saveRaffleIfPersisted();
    this.participantSaveMessage = 'Participants saved';
  }

  private parsePlayerEntry(line: string): { ticketNumber: string | null; name: string } {
    const parts = line.split('•').map((part) => part.trim());
    const ticketNumber = parts.length > 1 && /^[a-z\d]+$/i.test(parts[0])
      ? parts[0].toUpperCase()
      : null;
    return {
      ticketNumber,
      name: ticketNumber === null ? parts[0] : parts.slice(1).join(' • ')
    };
  }

  assignMissingNumbers(): void {
    if (!this.raffle || !this.editorText.trim()) {
      return;
    }

    const usedNumbers = new Set<number>();
    let nextOrderedNumber = 1;
    let lines = this.editorLines();

    if (lines.length > this.playerLimit) {
      lines = lines.slice(0, this.playerLimit);
      this.participantLimitMessage = `Player limit reached: only ${this.playerLimit} players can be added.`;
    }

    this.editorText = lines.map((line, index) => {
      const { ticketNumber, name } = this.parsePlayerEntry(line);
      const existingPlayer = this.raffle!.players.find((player) =>
        player.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());
      const numericTicket = ticketNumber !== null && /^\d+$/.test(ticketNumber);
      const ticketCode = ticketNumber !== null && !numericTicket ? ticketNumber : undefined;
      if (numericTicket) {
        const explicitNumber = Number(ticketNumber);
        usedNumbers.add(explicitNumber);
        nextOrderedNumber = Math.max(nextOrderedNumber, explicitNumber + 1);
      }
      let assignedNumber = numericTicket
        ? Number(ticketNumber)
        : ticketCode
        ? existingPlayer?.assignedNumber ?? null
        : null;
      if (assignedNumber === null) {
        if (ticketCode) {
          assignedNumber = this.createRandomNumber(usedNumbers);
        } else if (this.playerNumberMode === 'ordered') {
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
      return `${ticketCode ?? this.formatNumber(assignedNumber)} • ${name}`;
    }).join('\n');
  }

  async joinEntry(): Promise<void> {
    const name = this.joinedName.trim();
    if (!this.raffle || !name) {
      return;
    }

    if (this.raffle.players.length >= this.playerLimit) {
      this.participantLimitMessage = `Player limit reached: only ${this.playerLimit} players can be added.`;
      return;
    }

    const digitCount = this.raffle.digitCount ?? 3;
    const usedNumbers = new Set(this.raffle.players.map((player) => player.assignedNumber));
    const requestedTicketNumber = this.useJoinedNumber
      ? this.parseJoinedNumber(this.joinedNumber, digitCount)
      : null;
    if (this.useJoinedNumber && requestedTicketNumber === null) {
      this.showParticipantMessage(`Enter up to ${digitCount} letters or numbers.`);
      return;
    }

    const hasLetters = !!requestedTicketNumber && /[A-Z]/.test(requestedTicketNumber);
    const ticketCode = hasLetters ? requestedTicketNumber : undefined;
    const assignedNumber = requestedTicketNumber === null
      ? this.playerNumberMode === 'ordered'
        ? this.raffle.players.length + 1
        : this.createRandomNumber(usedNumbers)
      : hasLetters
      ? this.createRandomNumber(usedNumbers)
      : Number(requestedTicketNumber);
    const displayTicketNumber = ticketCode ?? this.formatNumber(assignedNumber);

    const duplicate = this.raffle.players.find((player) => player.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
    if (duplicate) {
      this.showParticipantMessage(`The name "${name}" has already joined this raffle.`);
      return;
    }

    const duplicateNumber = this.raffle.players.find((player) =>
      this.formatPlayerNumber(player).toLocaleUpperCase() === displayTicketNumber.toLocaleUpperCase());
    if (duplicateNumber) {
      this.showParticipantMessage(`The ticket number ${displayTicketNumber} is already in use.`);
      return;
    }
    const player: Player = {
      id: `${this.raffle.id}-${Date.now()}`,
      name,
      assignedNumber,
      ...(ticketCode ? { ticketCode } : {}),
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

    if (!this.raffle.players.some((existingPlayer) => existingPlayer.id === player.id)) {
      this.raffle.players = [...this.raffle.players, player];
    }
    this.joinedName = '';
    this.joinedNumber = '';
    this.playersText = this.raffle.players.map((player) => player.name).join('\n');
    this.editorText = this.formatEditorText();
    this.participantPage = this.participantPageCount;
    this.raffle.remainingDraws = Math.max(this.raffle.remainingDraws, this.raffle.players.length);
    await this.saveRaffleIfPersisted();
    this.participantLimitMessage = '';
  }

  private parseJoinedNumber(value: string, digitCount: number): string | null {
    const ticketNumber = value.trim().toUpperCase();
    if (!/^[A-Z0-9]+$/.test(ticketNumber) || ticketNumber.length > digitCount) {
      return null;
    }

    if (/^\d+$/.test(ticketNumber)) {
      const number = Number(ticketNumber);
      if (number < 1 || number > 10 ** digitCount - 1) {
        return null;
      }
      return this.formatNumber(number);
    }
    return ticketNumber;
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

  getHistoryRemarks(item: DrawItem): string {
    return item.participantRemarks
      ?? this.raffle?.players.find((player) => player.id === item.participantId)?.remarks
      ?? '';
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
      || (player.name === historyItem.winnerName && this.formatPlayerNumber(player) === historyItem.drawnNumber));
    if (existingPlayer) {
      this.raffle.players = this.raffle.players.map((player) => player.id === existingPlayer.id
        ? { ...player, drawn: false, status: 'active' }
        : player);
    } else {
      const ticketCode = /^\d+$/.test(historyItem.drawnNumber) ? undefined : historyItem.drawnNumber.toUpperCase();
      this.raffle.players = [...this.raffle.players, {
        id: historyItem.participantId ?? `${this.raffle.id}-${Date.now()}`,
        name: historyItem.winnerName,
        assignedNumber: ticketCode ? this.createRandomNumber() : Number(historyItem.drawnNumber),
        ...(ticketCode ? { ticketCode } : {}),
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
      || (player.name === item.winnerName && this.formatPlayerNumber(player) === item.drawnNumber));
    this.raffle.history[historyIndex] = {
      ...item,
      excludedFromList: true,
      participantId: item.participantId ?? winnerPlayer?.id
    };
    this.raffle.players = this.raffle.players.filter((player) => player.id !== winnerPlayer?.id);
    this.editorText = this.formatEditorText();
    this.showExclusionMessage(`Excluded ${item.drawnNumber} • ${item.winnerName} from the participant list.`);
    this.dismissWinnerDialog();
    await this.saveRaffleIfPersisted();
  }

  dismissWinnerDialog(): void {
    this.lastWinner = null;
    this.clearConfetti();
  }

  private fireWinnerConfetti(): void {
    this.confettiTimers = Array.from({ length: 9 }, (_, index) => window.setTimeout(() => {
      confetti({
        particleCount: 28,
        angle: index % 2 === 0 ? 68 : 112,
        spread: 48,
        startVelocity: 58,
        ticks: 240,
        gravity: 0.85,
        origin: { x: 0.08 + (index / 8) * 0.84, y: 0.98 },
        colors: ['#ffd700', '#ff6b6b', '#62e6c5', '#ffffff'],
        disableForReducedMotion: true
      });
    }, index * 100));
  }

  private clearConfetti(): void {
    this.confettiTimers.forEach((timer) => window.clearTimeout(timer));
    this.confettiTimers = [];
    confetti.reset();
  }

  handleBrandClick(event: MouseEvent): void {
    if (!this.isSpinning) {
      return;
    }

    event.preventDefault();
    this.spinTimeline?.pause();
    this.clearSpinTickTimers();
    this.stopSound.pause();
    this.winSound.pause();
    this.spinExitDialogOpen = true;
  }

  cancelSpinExitDialog(): void {
    this.spinExitDialogOpen = false;
    if (this.isSpinning && this.spinTimeline) {
      this.spinTimeline.resume();
      this.scheduleSpinTicks();
    }
  }

  leaveRaffleWhileSpinning(): void {
    this.spinExitDialogOpen = false;
    this.clearSpinTickTimers();
    this.spinTimeline?.kill();
    this.spinTimeline = undefined;
    this.stopSound.pause();
    this.stopSound.currentTime = 0;
    this.winSound.pause();
    this.winSound.currentTime = 0;
    this.isSpinning = false;
    this.raffleService.setRaffleSpinning(false);
    this.lastWinner = null;
    this.spinProgress = 0;
    this.reelPositions = this.reelPositions.map(() => 0);
    this.reels = this.reelPositions.map(() => '🎰');
    void this.router.navigateByUrl('/');
  }

  @HostListener('document:keydown.escape')
  handleSpinExitEscape(): void {
    if (this.spinExitDialogOpen) {
      this.cancelSpinExitDialog();
    }
  }

  private showExclusionMessage(message: string): void {
    this.exclusionMessage = message;
    if (this.exclusionMessageTimeout) {
      window.clearTimeout(this.exclusionMessageTimeout);
    }
    this.exclusionMessageTimeout = window.setTimeout(() => {
      this.exclusionMessage = '';
      this.exclusionMessageTimeout = undefined;
    }, 900);
  }

  async updateMode(mode: SpinMode): Promise<void> {
    if (!this.raffle) {
      return;
    }

    this.raffle.mode = mode;
    await this.saveRaffleIfPersisted();
  }

  async spin(): Promise<void> {
    if (!this.raffle || !this.canManageGame || this.isSpinning || !this.isRaffleCurrent) {
      return;
    }

    const players = this.raffle.players;
    if (!players.length) {
      this.showExclusionMessage('Please add players before spinning the raffle.');
      return;
    }

    this.isSpinning = true;
    this.raffleService.setRaffleSpinning(true);
    let spinAllowance: { allowed: boolean; spinsRemaining: number };
    try {
      spinAllowance = await this.raffleService.consumeSpin();
    } catch (error) {
      this.spinLimitMessage = error instanceof Error
        ? `Unable to check spins: ${error.message}`
        : 'Unable to check your spins. Please try again.';
      this.isSpinning = false;
      this.raffleService.setRaffleSpinning(false);
      return;
    }
    if (!spinAllowance.allowed) {
      this.spinLimitMessage = 'You do not have enough spins left. Please subscribe to continue.';
      this.isSpinning = false;
      this.raffleService.setRaffleSpinning(false);
      return;
    }
    this.spinLimitMessage = '';

    const winner = players[Math.floor(Math.random() * players.length)];
    const ticketNumber = this.formatPlayerNumber(winner);
    const hasAlphanumericTickets = players.some((player) => /[A-Z]/i.test(this.formatPlayerNumber(player)));
    const reelSymbols = hasAlphanumericTickets ? '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ' : '0123456789';
    this.reelStrip = Array.from({ length: 100 }, (_, index) => reelSymbols[index % reelSymbols.length]);
    const digitCount = this.raffle.digitCount ?? ticketNumber.length;
    const fastDuration = 5 + Math.max(0, Math.min(3, digitCount - 3)) * 2;
    const slowdownDuration = 3;
    const staggerDuration = this.raffle.mode === 'per-digit' ? (ticketNumber.length - 1) * 0.5 : 0;
    const durationMs = (fastDuration + slowdownDuration + staggerDuration) * 1000;

    this.lastWinner = null;
    this.clearSpinTickTimers();
    this.clearScheduledSpinTimers();
    this.spinCountdown = 3;

    try {
      if (this.isPreviewRaffle) {
        const scheduledStartAt = Date.now() + 3000;
        this.beginScheduledSpin({
          spinId: `preview-${Date.now()}`,
          winnerId: winner.id,
          winnerName: winner.name,
          ticketNumber,
          scheduledStartAt,
          roundEndsAt: scheduledStartAt + durationMs,
          durationMs,
          phase: 'scheduled'
        }, winner);
      } else {
        await this.raffleService.scheduleSpin(this.raffle, winner, ticketNumber, durationMs);
      }
    } catch (error) {
      this.isSpinning = false;
      this.spinCountdown = null;
      this.raffleService.setRaffleSpinning(false);
      this.spinLimitMessage = error instanceof Error
        ? `Unable to schedule spin: ${error.message}`
        : 'Unable to schedule the spin. Please try again.';
    }
  }

  private watchActiveSpin(gameUid: string): void {
    this.stopWatchingSpin?.();
    this.stopWatchingSpin = this.raffleService.watchActiveSpin(
      gameUid,
      (spin) => this.zone.run(() => {
        if (this.raffle?.gameUid !== gameUid || !spin || spin.phase !== 'scheduled'
          || spin.spinId === this.activeSpinId) {
          return;
        }

        this.activeSpinId = spin.spinId;
        const winner = this.raffle?.players.find((player) => player.id === spin.winnerId) ?? {
          id: spin.winnerId,
          name: spin.winnerName,
          assignedNumber: Number(spin.ticketNumber),
          ticketCode: spin.ticketNumber,
          drawn: false
        };
        this.beginScheduledSpin(spin, winner);
      }),
      (error) => this.zone.run(() => {
        this.spinLimitMessage = `Live spin updates stopped: ${error.message}`;
      })
    );
  }

  private beginScheduledSpin(spin: ActiveSpin, winner: Player): void {
    if (!this.raffle || spin.phase !== 'scheduled') {
      return;
    }

    this.activeSpinId = spin.spinId;
    const ticketNumber = spin.ticketNumber;
    const targetReels = ticketNumber.split('').map((character) => this.reelStrip.indexOf(character));
    this.currentSpin = { spin, winner, ticketNumber, targetReels };
    this.spinEndTimer = window.setTimeout(
      () => void this.finishSpin(spin, winner, ticketNumber, targetReels),
      Math.max(0, spin.roundEndsAt - Date.now())
    );
    const digitStates = targetReels.map(() => ({ spinPos: 0 }));
    const maxSpinPos = 80;
    const digitCount = this.raffle.digitCount ?? ticketNumber.length;
    const fastDuration = 5 + Math.max(0, Math.min(3, digitCount - 3)) * 2;
    const slowdownDuration = 3;
    this.spinFastDuration = fastDuration;
    this.spinSlowdownDuration = slowdownDuration;
    this.isSpinning = true;
    this.raffleService.setRaffleSpinning(true);
    this.lastWinner = null;
    const countdownRemaining = spin.scheduledStartAt - Date.now();
    this.spinCountdown = countdownRemaining > 0 ? Math.ceil(countdownRemaining / 1000) : null;
    this.countdownTimer = window.setInterval(() => {
      const remaining = spin.scheduledStartAt - Date.now();
      this.spinCountdown = remaining > 0 ? Math.ceil(remaining / 1000) : null;
    }, 100);

    this.scheduledSpinTimer = window.setTimeout(() => {
      if (this.countdownTimer !== undefined) {
        window.clearInterval(this.countdownTimer);
        this.countdownTimer = undefined;
      }
      this.spinCountdown = null;
      const elapsed = Math.max(0, Math.min(spin.durationMs, Date.now() - spin.scheduledStartAt) / 1000);
      const tl = this.spinTimeline = gsap.timeline({
        paused: true,
        onUpdate: () => {
          this.reelPositions = digitStates.map((state) => state.spinPos);
          this.spinProgress = tl.progress() * 100;
        },
        onComplete: () => void this.finishSpin(spin, winner, ticketNumber, targetReels)
      });

      const perDigit = this.raffle!.mode === 'per-digit';
      digitStates.forEach((state, index) => {
        const delay = perDigit ? index * 0.5 : 0;
        tl.to(state, { spinPos: maxSpinPos, duration: fastDuration, ease: 'power1.inOut' }, delay);
        tl.to(state, { spinPos: targetReels[index], duration: slowdownDuration, ease: 'power3.out' }, fastDuration + delay);
      });
      if (elapsed >= tl.duration()) {
        tl.progress(1);
      } else {
        tl.play(0);
        tl.time(elapsed);
        this.scheduleSpinTicks();
      }
    }, Math.max(0, spin.scheduledStartAt - Date.now()));
  }

  private async finishSpin(spin: ActiveSpin, winner: Player, ticketNumber: string, targetReels: number[]): Promise<void> {
    if (this.finishingSpinId === spin.spinId) {
      return;
    }
    this.finishingSpinId = spin.spinId;
    this.currentSpin = undefined;
    this.clearSpinTickTimers();
    this.clearScheduledSpinTimers();
    this.spinTimeline?.kill();
    this.spinTimeline = undefined;
    this.stopSound.currentTime = 0;
    void this.stopSound.play().catch(() => undefined);
    this.reelPositions = targetReels;
    this.reels = ticketNumber.split('');
    this.lastWinner = { name: winner.name, number: ticketNumber };
    this.fireWinnerConfetti();
    this.spinProgress = 100;
    this.isSpinning = false;
    this.raffleService.setRaffleSpinning(false);
    this.winSound.currentTime = 0;
    void this.winSound.play().catch(() => undefined);

    if (!this.raffle) {
      return;
    }
    let spinResult = this.raffle.history.find((item) => item.spinId === spin.spinId);
    if (!spinResult) {
      spinResult = {
        id: spin.spinId,
        spinId: spin.spinId,
        roundStartAt: new Date(spin.scheduledStartAt).toISOString(),
        roundEndAt: new Date(spin.roundEndsAt).toISOString(),
        roundNumber: this.nextRoundNumber(),
        winnerName: winner.name,
        drawnNumber: ticketNumber,
        timestamp: new Date().toISOString(),
        participantId: winner.id,
        participantName: winner.name,
        ...(winner.remarks ? { participantRemarks: winner.remarks } : {}),
        winnerStatus: 'active'
      };
      this.raffle.history = [
        ...this.raffle.history,
        spinResult
      ];
      this.raffle.remainingDraws = Math.max(0, this.raffle.remainingDraws - 1);
      this.raffle.lastWinner = winner.name;
      this.raffle.lastNumber = ticketNumber;
    }

    const saveErrors: string[] = [];
    try {
      if (this.isPreviewRaffle) {
        await this.saveRaffleIfPersisted();
      } else {
        await this.raffleService.saveSpinResult(this.raffle, spinResult);
        this.raffleState$.next(this.raffle);
      }
    } catch (error) {
      saveErrors.push(error instanceof Error ? error.message : 'the result could not be saved');
    }

    if (!this.isPreviewRaffle) {
      try {
        await this.raffleService.completeSpin(this.raffle.gameUid, spin.spinId);
      } catch (error) {
        saveErrors.push(error instanceof Error ? `the spin could not be marked complete: ${error.message}` : 'the spin could not be marked complete');
      }
    }

    if (saveErrors.length) {
      this.spinLimitMessage = `The winner was revealed, but ${saveErrors.join('; ')}.`;
    }
  }

  private clearScheduledSpinTimers(): void {
    if (this.scheduledSpinTimer !== undefined) {
      window.clearTimeout(this.scheduledSpinTimer);
      this.scheduledSpinTimer = undefined;
    }
    if (this.countdownTimer !== undefined) {
      window.clearInterval(this.countdownTimer);
      this.countdownTimer = undefined;
    }
    if (this.spinEndTimer !== undefined) {
      window.clearTimeout(this.spinEndTimer);
      this.spinEndTimer = undefined;
    }
    this.spinCountdown = null;
  }

  handleSlotMachineKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void this.spin();
    }
  }

  @HostListener('document:visibilitychange')
  handleSpinVisibilityChange(): void {
    const currentSpin = this.currentSpin;
    if (document.visibilityState !== 'visible' || !this.isSpinning || !currentSpin) {
      return;
    }

    const { spin, winner, ticketNumber, targetReels } = currentSpin;
    const elapsedMs = Date.now() - spin.scheduledStartAt;
    if (elapsedMs >= spin.durationMs) {
      void this.finishSpin(spin, winner, ticketNumber, targetReels);
      return;
    }

    if (elapsedMs >= 0 && this.spinTimeline && !this.spinTimeline.paused()) {
      this.spinTimeline.time(elapsedMs / 1000);
    }
  }

  private scheduleSpinTicks(): void {
    const timeline = this.spinTimeline;
    if (!timeline || timeline.paused()) {
      return;
    }

    const totalDuration = timeline.duration() * 1000;
    const slowdownStart = this.spinFastDuration * 1000;

    const playTick = (): void => {
      if (timeline.paused() || !this.isSpinning || this.spinTimeline !== timeline) {
        return;
      }

      const elapsed = timeline.time() * 1000;
      if (elapsed >= totalDuration) {
        return;
      }

      this.stopSound.pause();
      this.stopSound.currentTime = 0;
      void this.stopSound.play().catch(() => undefined);

      const slowdownProgress = Math.max(0, Math.min(1, (elapsed - slowdownStart) / (this.spinSlowdownDuration * 1000)));
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

  formatPlayerNumber(player: Player): string {
    return player.ticketCode ?? this.formatNumber(player.assignedNumber);
  }

  togglePhoneNumbersVisibility(): void {
    this.phoneNumbersVisible = !this.phoneNumbersVisible;
  }

  toggleParticipantRemarksVisibility(): void {
    this.participantRemarksVisible = !this.participantRemarksVisible;
  }

  private formatEditorText(): string {
    return (this.raffle?.players ?? [])
      .map((player) => `${this.formatPlayerNumber(player)} • ${player.name}`)
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
