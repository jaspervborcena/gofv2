import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

interface WheelEntry {
  name: string;
  color: string;
}

@Component({
  selector: 'app-spin-wheel-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './spin-wheel-page.component.html',
  styleUrl: './spin-wheel-page.component.scss'
})
export class SpinWheelPageComponent {
  entries: WheelEntry[] = [
    { name: 'Ava', color: '#ff7a00' },
    { name: 'Noah', color: '#8b5cf6' },
    { name: 'Mina', color: '#06b6d4' },
    { name: 'Theo', color: '#facc15' },
    { name: 'Lina', color: '#fb7185' },
    { name: 'Kai', color: '#34d399' }
  ];

  get participantCount(): number {
    return this.entries.length;
  }

  joinedName = '';
  selectedWinner: string | null = null;
  wheelRotation = 0;
  isSpinning = false;

  get wheelGradient(): string {
    const sliceAngle = 360 / this.entries.length;
    return this.entries
      .map((entry, index) => {
        const start = index * sliceAngle;
        const end = (index + 1) * sliceAngle;
        return `${entry.color} ${start}deg ${end}deg`;
      })
      .join(', ');
  }

  joinEntry(): void {
    const name = this.joinedName.trim();
    if (!name) {
      return;
    }

    this.entries = [
      ...this.entries,
      { name, color: ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#ec4899'][this.entries.length % 5] }
    ];
    this.joinedName = '';
  }

  spin(): void {
    if (this.isSpinning || !this.entries.length) {
      return;
    }

    const winnerIndex = Math.floor(Math.random() * this.entries.length);
    const targetAngle = 360 * 5 + (360 / this.entries.length) * winnerIndex + 18;

    this.isSpinning = true;
    this.selectedWinner = null;
    this.wheelRotation += targetAngle;

    window.setTimeout(() => {
      this.selectedWinner = this.entries[winnerIndex].name;
      this.isSpinning = false;
    }, 2400);
  }
}
