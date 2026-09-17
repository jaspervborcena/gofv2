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
    const winner = players[Math.floor(Math.random() * players.length)];
    const targetReels = this.formatNumber(winner.assignedNumber).split('').map((digit) => Number(digit));

    // Create animation object to track position
    const animState = { spinPos: Array(targetReels.length).fill(0), progress: 0 };
    const spinSpeed = 50; // very fast rotations per second - shows lots of number changes
    const maxSpinPos = (8 / 1000) * spinSpeed * 10 * 1000; // position at end of spin phase

    // Create GSAP timeline
    const tl = gsap.timeline({
      onUpdate: () => {
        this.reelPositions = animState.spinPos.map((pos) => pos);
        this.spinProgress = animState.progress * 100;
      },
      onComplete: () => {
        // Animation complete - lock in final values
        this.reelPositions = targetReels.map((val) => val);
        this.reels = targetReels.map((num) => num.toString());
        this.lastWinner = { name: winner.name, number: this.formatNumber(winner.assignedNumber) };
        this.isSpinning = false;
        this.spinProgress = 100;

        // Save to Firestore
        this.raffle!.history = [
          ...this.raffle!.history,
          {
            id: `${this.raffle!.id}-${Date.now()}`,
            winnerName: winner.name,
            drawnNumber: this.formatNumber(winner.assignedNumber),
            timestamp: new Date().toISOString()
          }
        ];
        this.raffle!.remainingDraws = Math.max(0, this.raffle!.remainingDraws - 1);
        this.raffle!.lastWinner = winner.name;
        this.raffle!.lastNumber = this.formatNumber(winner.assignedNumber);
        this.raffleService.saveRaffle(this.raffle!);
      }
    });

    // Fast spin phase (2.5s) - all reels spin extremely fast with visible number changes
    tl.to(
      animState,
      {
        spinPos: [maxSpinPos, maxSpinPos, maxSpinPos],
        progress: 0.3,
        duration: 2.5,
        ease: 'power1.inOut'
      },
      0
    );

    // Deceleration phase (3.5s) - smooth ease out to target values with visible slowing
    tl.to(
      animState,
      {
        spinPos: targetReels.map((target) => target),
        progress: 1,
        duration: 3.5,
        ease: 'power3.out'
      }
    );
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

  resetRaffle(): void {
    const digitCount = this.raffle?.digitCount ?? 3;
    this.reels = Array(digitCount).fill('🎰');
    this.reelPositions = Array(digitCount).fill(0);
    this.lastWinner = null;
  }
}
