import { Component, HostListener, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { gsap } from 'gsap';
import { DrawItem, NumberMode, Player, Raffle, RaffleService, SpinMode } from './raffle.service';

@Component({
  selector: 'app-raffle-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './raffle-page.component.html',
  styleUrl: './raffle-page.component.scss'
})
export class RafflePageComponent implements OnInit {
  private readonly raffleService = inject(RaffleService);
  private readonly route = inject(ActivatedRoute);
  private readonly spinSound = new Audio('/assets/slot-spin.mp3');
  private readonly stopSound = new Audio('/assets/slot-stop.mp3');
  private readonly winSound = new Audio('/assets/slot-win.mp3');

  raffle: Raffle | null = null;
  activeTab: 'raffle' | 'players' | 'history' = 'raffle';
  activePlayersTab: 'names' | 'text' = 'names';
  historySubTab: 'history' | 'winners' = 'history';
  playersText = '';
  editorText = '';
  joinedName = '';
  participantSaveMessage = '';
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
        this.raffle = this.createPreviewRaffle();
        this.playersText = this.raffle.players.map((player) => player.name).join('\n');
        this.editorText = this.formatEditorText();
        this.reelPositions = Array(this.raffle.digitCount ?? 3).fill(0);
        this.reels = Array(this.raffle.digitCount ?? 3).fill('0');
        return;
      }

      const raffles = await this.raffleService.listRaffles();
      this.raffle = raffles.find((item) => item.id === id || item.gameId === id) ?? null;
      if (this.raffle) {
        this.playersText = this.raffle.players.map((player) => player.name).join('\n');
        this.editorText = this.formatEditorText();
        this.playerNumberMode = this.raffle.numberMode;
        const digitCount = this.raffle.digitCount ?? 3;
        this.reelPositions = Array(digitCount).fill(0);
        this.reels = Array(digitCount).fill('0');
      }
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
    this.participantPage = 1;
    this.raffle.remainingDraws = Math.max(this.raffle.remainingDraws, this.raffle.players.length);
    this.raffle.numberMode = this.playerNumberMode;
    await this.raffleService.saveRaffle(this.raffle);
    this.participantSaveMessage = 'Participants saved';
  }

  assignMissingNumbers(): void {
    if (!this.raffle || !this.editorText.trim()) {
      return;
    }

    const usedNumbers = new Set<number>();
    let nextOrderedNumber = 1;
    const lines = this.editorText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

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

    const assignedNumber = this.playerNumberMode === 'ordered'
      ? this.raffle.players.length + 1
      : this.createRandomNumber();
    this.raffle.players = [...this.raffle.players, {
      id: `${this.raffle.id}-${Date.now()}`,
      name,
      assignedNumber,
      drawn: false
    }];
    this.joinedName = '';
    this.playersText = this.raffle.players.map((player) => player.name).join('\n');
    this.editorText = this.formatEditorText();
    this.participantPage = this.participantPageCount;
    this.raffle.remainingDraws = Math.max(this.raffle.remainingDraws, this.raffle.players.length);
    await this.raffleService.saveRaffle(this.raffle);
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
    this.raffle.players = this.raffle.players.map((player) =>
      player.id === historyItem.participantId
      || (player.name === historyItem.winnerName && this.formatNumber(player.assignedNumber) === historyItem.drawnNumber)
        ? { ...player, drawn: false, status: 'active' }
        : player);
    this.editorText = this.formatEditorText();
      this.showExclusionMessage(`Restored ${historyItem.drawnNumber} • ${historyItem.winnerName} to the participant list.`);
    await this.raffleService.saveRaffle(this.raffle);
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
    this.raffle.players = this.raffle.players.map((player) => player.id === winnerPlayer?.id
      ? { ...player, drawn: true, status: 'winner' }
      : player);
    this.editorText = this.formatEditorText();
    this.showExclusionMessage(`Excluded ${item.drawnNumber} • ${item.winnerName} from the participant list.`);
    await this.raffleService.saveRaffle(this.raffle);
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
    await this.raffleService.saveRaffle(this.raffle);
  }

  async spin(): Promise<void> {
    if (!this.raffle || this.isSpinning) {
      return;
    }

    const players = this.raffle.players;
    if (!players.length) {
      return;
    }

    this.isSpinning = true;
    this.lastWinner = null;
    this.spinSound.currentTime = 0;
    this.spinSound.loop = true;
    void this.spinSound.play().catch(() => undefined);
    const winner = players[Math.floor(Math.random() * players.length)];
    const targetReels = this.formatNumber(winner.assignedNumber).split('').map((digit) => Number(digit));

    const digitStates = targetReels.map(() => ({ spinPos: 0 }));
    const spinSpeed = 50; // very fast rotations per second - shows lots of number changes
    const maxSpinPos = 80; // rows, kept within the repeated reel strip

    // Create GSAP timeline
    const tl = gsap.timeline({
      onUpdate: () => {
        this.reelPositions = digitStates.map((state) => state.spinPos);
        this.spinProgress = tl.progress() * 100;
      },
      onComplete: async () => {
        // Animation complete - lock in final values
        this.spinSound.pause();
        this.spinSound.currentTime = 0;
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
        await this.raffleService.saveRaffle(this.raffle!);
      }
    });

    const perDigit = this.raffle.mode === 'per-digit';
    digitStates.forEach((state, index) => {
      const delay = perDigit ? index * 0.5 : 0;
      tl.to(state, {
        spinPos: maxSpinPos,
        duration: 2.5,
        ease: 'power1.inOut'
      }, delay);
      tl.to(state, {
        spinPos: targetReels[index],
        duration: 3.5,
        ease: 'power3.out'
      }, 2.5 + delay);
    });
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
      gameId: 'preview-raffle',
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
      closedAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };
  }

  resetRaffle(): void {
    const digitCount = this.raffle?.digitCount ?? 3;
    this.reels = Array(digitCount).fill('🎰');
    this.reelPositions = Array(digitCount).fill(0);
    this.lastWinner = null;
  }
}
