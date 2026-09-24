import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink } from '@angular/router';
import { RaffleService } from './raffle.service';
import { AdBannerComponent } from './ad-banner.component';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, AdBannerComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'Game of Fortunes';
  raffleService = inject(RaffleService);
  user: { uid: string; displayName?: string | null; email?: string | null } | null = null;
  adFree = false;

  constructor() {
    this.raffleService.user$.subscribe(async (authUser) => {
      this.user = authUser
        ? {
            uid: authUser.uid,
            displayName: authUser.displayName,
            email: authUser.email
          }
        : null;
      this.adFree = authUser ? (await this.raffleService.getCurrentUserPlan(authUser.uid)) !== 'free' : false;
      if (authUser) {
        await this.raffleService.ensureUserSpinFields(authUser.uid);
      }
    });
  }

  get userDisplayName(): string {
    if (!this.user) {
      return 'Player';
    }

    const trimmedName = this.user.displayName?.trim();
    if (trimmedName) {
      return trimmedName;
    }

    const emailPrefix = this.user.email?.split('@')[0]?.trim();
    return emailPrefix || 'Player';
  }
}
