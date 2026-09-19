import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DrawItem, Raffle, RaffleService } from './raffle.service';
import { environment } from '../environments/environment';

interface RaffleEntry {
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
export class RaffleMachinePageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly raffleService = inject(RaffleService);
  private readonly spinSound = new Audio('/assets/slot-spin.mp3');
  private readonly stopSound = new Audio('/assets/slot-stop.mp3');
  private readonly winSound = new Audio('/assets/slot-win.mp3');

  raffle: Raffle | null = null;
  gameName = 'Lucky Draws';
  gameDescription = 'Winner takes all';
  activeTab: 'names' | 'text' | 'history' | 'winners' = 'names';
  reels = ['0', '0', '0'];
  isSpinning = false;
  winner: RaffleEntry | null = null;
  removedMessage = '';
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
        return;
      }

      const raffles = await this.raffleService.listRaffles();
      const raffle = raffles.find((item) => item.id === gameId);
      if (!raffle) {
        return;
      }

      this.raffle = raffle;
      this.gameName = raffle.name;
      this.gameDescription = raffle.remarks || 'Winner takes all';
      const digitCount = raffle.digitCount ?? 3;
      this.reels = Array(digitCount).fill('0');
      this.entries = raffle.players.map((player) => ({
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

  private formatEntries(): string {
    return this.entries.map((entry) => `${entry.number} • ${entry.name}`).join('\n');
  }

  updateNames(text: string): void {
    this.namesText = text;
    this.entries = this.parseEntries(text);
  }

  normalizeNamesText(): void {
    this.namesText = this.formatEntries();
  }

  private parseEntries(text: string): RaffleEntry[] {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const parts = line.split('•').map((part) => part.trim());
        const numberPart = parts.length > 1 ? parts[0] : '';
        const namePart = parts.length > 1 ? parts[1] : parts[0];
        return {
          name: namePart || 'Player',
          number: this.raffle?.numberMode === 'ordered'
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

  joinEntry(): void {
    const rawName = this.joinedName.trim();
    if (!rawName) {
      return;
    }

    this.entries = [...this.entries, {
      name: rawName.includes('@') ? rawName.split('@')[0] : rawName,
      number: this.raffle?.numberMode === 'ordered' ? this.nextOrderedNumber(this.entries) : this.randomNumber()
    }];
    this.namesText = this.formatEntries();
    this.joinedName = '';
  }

  spin(): void {
    if (this.isSpinning || !this.entries.length) {
      return;
    }

    this.isSpinning = true;
    this.winner = null;
    this.spinSound.currentTime = 0;
    this.spinSound.loop = true;
    void this.spinSound.play().catch(() => undefined);
    const winner = this.entries[Math.floor(Math.random() * this.entries.length)];
    const digits = winner.number.split('');
    const frameCount = 18;
    let frame = 0;

    const interval = window.setInterval(() => {
      frame += 1;
      this.reels = digits.map((digit, index) => {
        const digitDelay = this.raffle?.mode === 'per-digit' ? index * 4 : 0;
        if (frame >= frameCount + digitDelay) {
          return digit;
        }
        return String(frame % 10);
      });

      const finalFrame = frameCount + (this.raffle?.mode === 'per-digit' ? (digits.length - 1) * 4 : 0);
      if (frame >= finalFrame) {
        window.clearInterval(interval);
        this.spinSound.pause();
        this.spinSound.currentTime = 0;
        this.stopSound.currentTime = 0;
        void this.stopSound.play().catch(() => undefined);
        this.reels = digits;
        this.winner = winner;
        this.isSpinning = false;
        this.winSound.currentTime = 0;
        void this.winSound.play().catch(() => undefined);

        if (this.raffle) {
          this.raffle.history = [
            ...this.raffle.history,
            {
              id: `${this.raffle.id}-${Date.now()}`,
              winnerName: winner.name,
              drawnNumber: winner.number,
              timestamp: new Date().toISOString()
            }
          ];
          this.raffle.lastWinner = winner.name;
          this.raffle.lastNumber = winner.number;
          void this.raffleService.saveRaffle(this.raffle);
        }
        void this.notifyWinner(winner);
      }
    }, 120);
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
          prize: ''
        })
      });
    } catch {
      // The raffle remains usable when the optional local gRPC bridge is offline.
    }
  }

  async addWinnerToList(item: DrawItem): Promise<void> {
    if (this.entries.some((entry) => entry.name === item.winnerName && entry.number === item.drawnNumber)) {
      return;
    }

    this.entries = [...this.entries, { name: item.winnerName, number: item.drawnNumber }];
    this.namesText = this.formatEntries();

    if (this.raffle && !this.raffle.players.some((player) =>
      player.name === item.winnerName && String(player.assignedNumber).padStart(this.raffle?.digitCount ?? 3, '0') === item.drawnNumber
    )) {
      this.raffle.players = [...this.raffle.players, {
        id: `${this.raffle.id}-${Date.now()}`,
        name: item.winnerName,
        assignedNumber: Number(item.drawnNumber),
        drawn: false
      }];
      await this.raffleService.saveRaffle(this.raffle);
    }
  }

  async removeWinner(): Promise<void> {
    if (!this.winner) {
      return;
    }

    const winnerName = this.winner.name;
    const winnerNumber = this.winner.number;
    this.removedMessage = `Player {${winnerNumber} • ${winnerName}} has been removed from the game`;
    if (this.removeNoticeTimeout) {
      window.clearTimeout(this.removeNoticeTimeout);
    }
    this.removeNoticeTimeout = window.setTimeout(() => {
      this.removedMessage = '';
      this.removeNoticeTimeout = undefined;
    }, 3000);
    this.entries = this.entries.filter((entry) => entry.name !== winnerName || entry.number !== winnerNumber);
    this.namesText = this.formatEntries();

    if (this.raffle) {
      this.raffle.players = this.raffle.players.filter((player) =>
        player.name !== winnerName || String(player.assignedNumber).padStart(this.raffle?.digitCount ?? 3, '0') !== winnerNumber
      );
      await this.raffleService.saveRaffle(this.raffle);
    }

    this.winner = null;
  }
}