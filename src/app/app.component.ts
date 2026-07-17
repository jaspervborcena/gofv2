import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Raffle, RaffleService, SpinMode, NumberMode, Player } from './raffle.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  private readonly raffleService = inject(RaffleService);

  title = 'gofv2';
  user: { uid: string; displayName?: string | null } | null = null;
  raffles: Raffle[] = [];
  selectedRaffle: Raffle | null = null;
  activeTab: 'raffle' | 'players' | 'history' = 'raffle';

  draftName = '';
  draftMode: SpinMode = 'simultaneous';
  joinCode = '';
  playersText = '';
  playerNumberMode: NumberMode = 'random';
  reels = ['🎰', '🎰', '🎰'];
  lastWinner: { name: string; number: string } | null = null;

  ngOnInit(): void {
    this.raffleService.user$.subscribe((authUser) => {
      this.user = authUser ? { uid: authUser.uid, displayName: authUser.displayName } : null;
      this.loadRaffles();
    });
  }

  async signIn(): Promise<void> {
    await this.raffleService.signInWithGoogle();
  }

  async signOut(): Promise<void> {
    await this.raffleService.signOut();
    this.user = null;
  }

  async loadRaffles(): Promise<void> {
    this.raffles = await this.raffleService.listRaffles();
    if (!this.selectedRaffle && this.raffles.length) {
      this.selectedRaffle = this.raffles[0];
      this.playersText = this.selectedRaffle.players.map((player) => player.name).join('\n');
    }
  }

  async createRaffle(): Promise<void> {
    if (!this.draftName.trim()) {
      return;
    }

    const created = await this.raffleService.createRaffle({
      name: this.draftName.trim(),
      creatorId: this.user?.uid ?? 'local-user',
      mode: this.draftMode,
      numberMode: this.playerNumberMode
    });

    this.draftName = '';
    this.selectedRaffle = created;
    this.raffles = [created, ...this.raffles];
    this.playersText = '';
  }

  async joinRaffle(): Promise<void> {
    if (!this.joinCode.trim()) {
      return;
    }

    const raffle = this.raffles.find((item) => item.id === this.joinCode.trim());
    if (raffle) {
      this.selectedRaffle = raffle;
    }
  }

  selectRaffle(raffle: Raffle): void {
    this.selectedRaffle = raffle;
    this.playersText = raffle.players.map((player) => player.name).join('\n');
  }

  async savePlayers(): Promise<void> {
    if (!this.selectedRaffle) {
      return;
    }

    const names = this.playersText
      .split('\n')
      .map((name) => name.trim())
      .filter(Boolean);

    const players: Player[] = names.map((name, index) => ({
      id: `${this.selectedRaffle!.id}-${index}`,
      name,
      assignedNumber: this.playerNumberMode === 'ordered' ? index + 1 : Math.floor(Math.random() * 9000) + 1000,
      drawn: false
    }));

    this.selectedRaffle.players = players;
    this.selectedRaffle.remainingDraws = Math.max(this.selectedRaffle.remainingDraws, players.length);
    await this.raffleService.saveRaffle(this.selectedRaffle);
    this.raffles = this.raffles.map((item) => (item.id === this.selectedRaffle!.id ? this.selectedRaffle! : item));
  }

  async spin(): Promise<void> {
    if (!this.selectedRaffle) {
      return;
    }

    const players = this.selectedRaffle.players;
    if (!players.length) {
      return;
    }

    const winner = players[Math.floor(Math.random() * players.length)];
    this.reels = [winner.assignedNumber.toString().split('')[0] ?? '0', winner.assignedNumber.toString().split('')[1] ?? '0', winner.assignedNumber.toString().split('')[2] ?? '0'];
    this.lastWinner = { name: winner.name, number: `${winner.assignedNumber}` };

    this.selectedRaffle.history = [
      ...this.selectedRaffle.history,
      {
        id: `${this.selectedRaffle.id}-${Date.now()}`,
        winnerName: winner.name,
        drawnNumber: `${winner.assignedNumber}`,
        timestamp: new Date().toISOString()
      }
    ];
    this.selectedRaffle.remainingDraws = Math.max(0, this.selectedRaffle.remainingDraws - 1);
    this.selectedRaffle.lastWinner = winner.name;
    this.selectedRaffle.lastNumber = `${winner.assignedNumber}`;
    await this.raffleService.saveRaffle(this.selectedRaffle);
    this.raffles = this.raffles.map((item) => (item.id === this.selectedRaffle!.id ? this.selectedRaffle! : item));
  }

  resetRaffle(): void {
    if (!this.selectedRaffle) {
      return;
    }

    this.reels = ['🎰', '🎰', '🎰'];
    this.lastWinner = null;
  }

  async updateMode(mode: SpinMode): Promise<void> {
    if (!this.selectedRaffle) {
      return;
    }

    this.selectedRaffle.mode = mode;
    await this.raffleService.saveRaffle(this.selectedRaffle);
    this.raffles = this.raffles.map((item) => (item.id === this.selectedRaffle!.id ? this.selectedRaffle! : item));
  }
}
