import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-ad-banner',
  standalone: true,
  template: `
    <div style="min-height: 90px; width: 100%; text-align: center;" aria-label="Advertisement"></div>
  `
})
export class AdBannerComponent {
  @Input() adFree = false;
}
