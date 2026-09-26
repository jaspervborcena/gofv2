import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-features-footer',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './features-footer.component.html',
  styleUrl: './features-footer.component.scss'
})
export class FeaturesFooterComponent {}