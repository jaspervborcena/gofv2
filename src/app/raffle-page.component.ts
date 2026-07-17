import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
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
      assignedNumber: this.playerNumberMode === 'ordered' ? index + 1 : Math.floor(Math.random() * 9000) + 1000,
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
    const targetReels = [
      parseInt(winner.assignedNumber.toString().split('')[0] ?? '0'),
      parseInt(winner.assignedNumber.toString().split('')[1] ?? '0'),
      parseInt(winner.assignedNumber.toString().split('')[2] ?? '0')
    ];

    const spinDuration = 8000; // 8 seconds fast spin
    const decelerateDuration = 12000; // 12 seconds deceleration
    const totalDuration = spinDuration + decelerateDuration;
    const startTime = Date.now();

    const animateReel = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / totalDuration, 1);
      this.spinProgress = progress * 100;

      if (elapsed < spinDuration) {
        // Fast spin phase - move smoothly
        const spinSpeed = 8; // rotations per second
        this.reelPositions = this.reelPositions.map(() => (elapsed / 1000) * spinSpeed * 10);
      } else {
        // Deceleration phase - ease out to final position
        const decElapsed = elapsed - spinDuration;
        const decProgress = decElapsed / decelerateDuration;
        const easeOutQuad = 1 - Math.pow(1 - decProgress, 2);

        this.reelPositions = targetReels.map((target) => {
          const startPos = (spinDuration / 1000) * 8 * 10;
          return startPos + (target - startPos) * easeOutQuad;
        });
      }
      if (progress < 1) {
        requestAnimationFrame(animateReel);
      } else {
        this.reelPositions = targetReels.map((val) => val);
        this.reels = targetReels.map((num) => num.toString());
        this.lastWinner = { name: winner.name, number: `${winner.assignedNumber}` };
        this.isSpinning = false;
        this.spinProgress = 100;

        // Save to Firestore
        this.raffle!.history = [
          ...this.raffle!.history,
          {
            id: `${this.raffle!.id}-${Date.now()}`,
            winnerName: winner.name,
            drawnNumber: `${winner.assignedNumber}`,
            timestamp: new Date().toISOString()
          }
        ];
        this.raffle!.remainingDraws = Math.max(0, this.raffle!.remainingDraws - 1);
        this.raffle!.lastWinner = winner.name;
        this.raffle!.lastNumber = `${winner.assignedNumber}`;
        this.raffleService.saveRaffle(this.raffle!);
      }
    };

    animateReel();
  }

  resetRaffle(): void {
    this.reels = ['🎰', '🎰', '🎰'];
    this.lastWinner = null;
  }
}
