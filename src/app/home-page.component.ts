import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NumberMode, Raffle, RaffleService, SpinMode } from './raffle.service';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss'
})
export class HomePageComponent implements OnInit {
  private readonly raffleService = inject(RaffleService);
  private readonly router = inject(Router);

  user: { uid: string; displayName?: string | null } | null = null;
  raffles: Raffle[] = [];
  authError: string | null = null;

  draftName = '';
  draftMode: SpinMode = 'simultaneous';
  joinCode = '';
  playerNumberMode: NumberMode = 'random';

  ngOnInit(): void {
    this.raffleService.user$.subscribe((authUser) => {
      this.user = authUser ? { uid: authUser.uid, displayName: authUser.displayName } : null;
      this.loadRaffles();
    });
  }

  async signIn(): Promise<void> {
    this.authError = null;

    try {
      await this.raffleService.signInWithGoogle();
    } catch (error) {
      this.authError = error instanceof Error ? error.message : 'Unable to sign in with Google right now.';
    }
  }

  async signOut(): Promise<void> {
    await this.raffleService.signOut();
    this.user = null;
    this.authError = null;
  }

  async loadRaffles(): Promise<void> {
    this.raffles = await this.raffleService.listRaffles();
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
    this.router.navigate(['/raffles', created.id]);
  }

  async joinRaffle(): Promise<void> {
    if (!this.joinCode.trim()) {
      return;
    }

    const raffle = this.raffles.find((item) => item.id === this.joinCode.trim());
    if (raffle) {
      this.router.navigate(['/raffles', raffle.id]);
    }
  }
}
