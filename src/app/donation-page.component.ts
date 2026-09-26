import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-donation-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './donation-page.component.html',
  styleUrl: './donation-page.component.scss'
})
export class DonationPageComponent {}