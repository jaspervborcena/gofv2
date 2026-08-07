import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

interface SlotEntry {
  name: string;
  number: string;
}

@Component({
  selector: 'app-slot-machine-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './slot-machine-page.component.html',
  styleUrl: './slot-machine-page.component.scss'
})
export class SlotMachinePageComponent {
  reels = ['0', '0', '0'];
  isSpinning = false;
  winner: { name: string; number: string } | null = null;
  joinedName = '';
  entries: SlotEntry[] = [
    { name: 'Mina', number: '248' },
    { name: 'Drew', number: '731' },
    { name: 'Lina', number: '564' },
    { name: 'Kai', number: '902' }
  ];

  get participantCount(): number {
    return this.entries.length;
  }

  joinEntry(): void {
    const rawName = this.joinedName.trim();
    if (!rawName) {
      return;
    }

    const name = rawName.includes('@') ? rawName.split('@')[0] : rawName;

    this.entries = [
      ...this.entries,
      { name, number: String(Math.floor(100 + Math.random() * 900)) }
    ];
    this.joinedName = '';
  }

  spin(): void {
    if (this.isSpinning) {
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
        const current = frame % 10;
        if (frame >= frameCount && index === 0) {
          return digit;
        }
        if (frame >= frameCount + 4 && index === 1) {
          return digit;
        }
        if (frame >= frameCount + 8 && index === 2) {
          return digit;
        }
        return current.toString();
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
