import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

declare var Winwheel: any;

declare var TweenMax: any;

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
export class SpinWheelPageComponent implements AfterViewInit {
  @ViewChild('wheelCanvas', { static: true }) wheelCanvas!: ElementRef<HTMLCanvasElement>;

  entries: WheelEntry[] = [
    { name: 'Ava', color: '#FF8C00' },
    { name: 'Noah', color: '#6A5ACD' },
    { name: 'Mina', color: '#1E90FF' },
    { name: 'Theo', color: '#FFD700' },
    { name: 'Lina', color: '#FF69B4' },
    { name: 'Kai', color: '#32CD32' }
  ];

  joinedName = '';
  selectedWinner: string | null = null;
  isSpinning = false;
  wheel: any;
  private currentWinnerIndex = 0;
  private tickAudio: HTMLAudioElement;

  private readonly crayonColors = [
    '#FF7F50',
    '#6A5ACD',
    '#1E90FF',
    '#FFD700',
    '#FF69B4',
    '#32CD32',
    '#FF4500',
    '#00CED1',
    '#8A2BE2'
  ];

  constructor() {
    this.tickAudio = new Audio('assets/tick.mp3');
  }

  get participantCount(): number {
    return this.entries.length;
  }

  ngAfterViewInit(): void {
    this.createWheel();
  }

  private createWheel(): void {
    if (this.wheel?.clearCanvas) {
      this.wheel.clearCanvas();
    }

    const colors = this.getSegmentColors();
    const segments: any[] = [];

    this.entries.forEach((entry, index) => {
      segments.push({
        fillStyle: colors[index],
        text: entry.name,
        textFillStyle: '#ffffff',
        textStrokeStyle: null,
        textLineWidth: 0,
        textFontFamily: 'Arial',
        textFontSize: 18,
        textFontWeight: 'bold',
        textOrientation: 'horizontal',
        textAlignment: 'center'
      });
    });

    this.wheel = new Winwheel({
      canvasId: 'wheelcanvas',
      numSegments: this.entries.length,
      outerRadius: 250,
      innerRadius: 0,
      drawMode: 'code',
      drawText: true,
      textFontFamily: 'Arial',
      textFontSize: 18,
      textFontWeight: 'bold',
      textOrientation: 'horizontal',
      textDirection: 'normal',
      textAlignment: 'center',
      textMargin: 15,
      textFillStyle: '#f7f7f7',
      textStrokeStyle: '#000000',
      textLineWidth: 1,
      clearTheCanvas: true,
      lineWidth: 2,
      strokeStyle: '#ffffff',
      pointerAngle: 0,
      segments,
      animation: {
        type: 'spinToStop',
        duration: 8,
        spins: 8,
        callbackFinished: this.onFinished.bind(this),
        callbackSound: this.playTick.bind(this),
        soundTrigger: 'pin'
      },
      pins: {
        number: this.entries.length,
        fillStyle: '#ffffff',
        outerRadius: 5
      }
    });

    this.wheel.updateSegmentSizes();
    this.wheel.draw();
  }

  private getSegmentColors(): string[] {
    const count = this.entries.length;

    return Array.from({ length: count }, (_, index) => {
      const entry = this.entries[index];
      if (entry?.color) {
        return entry.color;
      }

      return this.crayonColors[index % this.crayonColors.length];
    });
  }

  private updateWheel(): void {
    this.createWheel();
  }

  joinEntry(): void {
    const rawName = this.joinedName.trim();
    if (!rawName) {
      return;
    }

    const name = rawName.includes('@') ? rawName.split('@')[0] : rawName;

    this.entries = [
      ...this.entries,
      {
        name,
        color: this.crayonColors[this.entries.length % this.crayonColors.length]
      }
    ];

    this.joinedName = '';
    this.updateWheel();
  }

  spin(): void {
    if (this.isSpinning || !this.entries.length || !this.wheel) {
      return;
    }

    this.currentWinnerIndex = Math.floor(Math.random() * this.entries.length);
    const segmentNumber = this.currentWinnerIndex + 1;
    const stopAngle = this.wheel.getRandomForSegment(segmentNumber);

    this.isSpinning = true;
    this.selectedWinner = null;
    this.wheel.animation.stopAngle = stopAngle;
    this.wheel.startAnimation();
  }

  private onFinished(): void {
    this.selectedWinner = this.entries[this.currentWinnerIndex]?.name || null;
    this.isSpinning = false;
  }

  private playTick(): void {
    if (!this.tickAudio) {
      return;
    }

    this.tickAudio.currentTime = 0;
    this.tickAudio.play().catch(() => {
      // Ignore play errors due to browser autoplay policies.
    });
  }
}
