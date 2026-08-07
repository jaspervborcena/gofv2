import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink } from '@angular/router';
import { RaffleService } from './raffle.service';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'gofv2';
  raffleService = inject(RaffleService);
  user: { uid: string; displayName?: string | null } | null = null;

  constructor() {
    this.raffleService.user$.subscribe((authUser) => {
      this.user = authUser ? { uid: authUser.uid, displayName: authUser.displayName } : null;
    });
  }
}
