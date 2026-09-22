import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-raffle-unavailable-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './raffle-unavailable-page.component.html',
  styleUrl: './raffle-unavailable-page.component.scss'
})
export class RaffleUnavailablePageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);

  title = 'Raffle unavailable';
  message = 'This raffle could not be found, has expired, or is no longer available.';

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      this.title = params.get('title') || this.title;
      this.message = params.get('message') || this.message;
    });
  }
}
