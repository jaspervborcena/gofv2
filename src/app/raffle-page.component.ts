import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { gsap } from 'gsap';
import { NumberMode, Player, Raffle, RaffleService, SpinMode } from './raffle.service';

@Component({
  selector: 'app-raffle-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
  playersText = '';
  playerNumberMode: NumberMode = 'random';
  reels = ['🎰', '🎰', '🎰'];
  reelPositions = [0, 0, 0];
  lastWinner: { name: string; number: string } | null = null;
  isSpinning = false;
  spinProgress = 0;

  ngOnInit(): void {
    this.route.paramMap.subscribe(async (params) => {
      const id = params.get('id');
      if (!id) {
        return;
      }

      const raffles = await this.raffleService.listRaffles();
      this.raffle = raffles.find((item) => item.id === id) ?? null;
      if (this.raffle) {
        this.playersText = this.raffle.players.map((player) => player.name).join('\n');
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

    const names = this.playersText
      .split('\n')
      .map((name) => name.trim())
      .filter(Boolean);

    this.raffle.players = names.map((name, index) => ({
      id: `${this.raffle!.id}-${index}`,
      name,
      assignedNumber: this.playerNumberMode === 'ordered' ? index + 1 : this.createRandomNumber(),
      drawn: false
    }));
    this.raffle.remainingDraws = Math.max(this.raffle.remainingDraws, this.raffle.players.length);
    this.raffle.numberMode = this.playerNumberMode;
    await this.raffleService.saveRaffle(this.raffle);
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
    const maxSpinPos = (8 / 1000) * spinSpeed * 10 * 1000; // position at end of spin phase

    // Create GSAP timeline
    const tl = gsap.timeline({
      onUpdate: () => {
        this.reelPositions = digitStates.map((state) => state.spinPos);
        this.spinProgress = tl.progress() * 100;
      },
      onComplete: () => {
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
            winnerStatus: 'active'
          }
        ];
        this.raffle!.remainingDraws = Math.max(0, this.raffle!.remainingDraws - 1);
        this.raffle!.lastWinner = winner.name;
        this.raffle!.lastNumber = this.formatNumber(winner.assignedNumber);
        this.raffleService.saveRaffle(this.raffle!);
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

  private createRandomNumber(): number {
    const digitCount = this.raffle?.digitCount ?? 3;
    const minimum = 10 ** (digitCount - 1);
    const maximum = 10 ** digitCount - 1;
    return Math.floor(minimum + Math.random() * (maximum - minimum + 1));
  }

  formatNumber(number: number): string {
    return String(number).padStart(this.raffle?.digitCount ?? 3, '0');
  }

  private nextRoundNumber(): string {
    const usedRoundNumbers = new Set((this.raffle?.history ?? [])
      .map((item) => item.roundNumber)
      .filter((roundNumber): roundNumber is string => !!roundNumber));
    let roundNumber = '';
    do {
      roundNumber = String(Math.floor(100000 + Math.random() * 900000));
    } while (usedRoundNumbers.has(roundNumber));
    return roundNumber;
  }

  resetRaffle(): void {
    const digitCount = this.raffle?.digitCount ?? 3;
    this.reels = Array(digitCount).fill('🎰');
    this.reelPositions = Array(digitCount).fill(0);
    this.lastWinner = null;
  }
}
