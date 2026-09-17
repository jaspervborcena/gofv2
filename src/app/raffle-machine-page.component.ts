import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Raffle, RaffleService } from './raffle.service';

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

  raffle: Raffle | null = null;
  gameName = 'Lucky Draws';
  gameDescription = 'Winner takes all';
  activeTab: 'names' | 'text' = 'names';
  reels = ['0', '0', '0'];
  isSpinning = false;
  winner: RaffleEntry | null = null;
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
      .map((line) => {
        const parts = line.split('•').map((part) => part.trim());
        const numberPart = parts.length > 1 ? parts[0] : '';
        const namePart = parts.length > 1 ? parts[1] : parts[0];
        return {
          name: namePart || 'Player',
          number: /^\d{3}$/.test(numberPart || '')
            ? numberPart as string
            : this.randomNumber()
        };
      });
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
        number: names.has(normalizedName) ? this.randomNumber() : pastedEntry.number
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
      number: this.randomNumber()
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
    const winner = this.entries[Math.floor(Math.random() * this.entries.length)];
    const digits = winner.number.split('');
    const frameCount = 18;
    let frame = 0;

    const interval = window.setInterval(() => {
      frame += 1;
      this.reels = digits.map((digit, index) => {
        if (frame >= frameCount + index * 4) {
          return digit;
        }
        return String(frame % 10);
      });

      if (frame >= frameCount + 10) {
        window.clearInterval(interval);
        this.reels = digits;
        this.winner = winner;
        this.isSpinning = false;
      }
    }, 120);
  }
}