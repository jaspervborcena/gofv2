import { AfterViewInit, Component, inject, Input, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-ad-banner',
  standalone: true,
  template: `
    <div style="min-height: 90px; width: 100%; text-align: center;" aria-label="Advertisement">
      <ins
        class="adsbygoogle"
        style="display:block"
        data-ad-client="ca-pub-6486007705288259"
        data-ad-format="auto"
        data-full-width-responsive="true"
      ></ins>
    </div>
  `
})
export class AdBannerComponent implements AfterViewInit {
  private readonly platformId = inject(PLATFORM_ID);
  @Input() adFree = false;

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      try {
        (window as any).adsbygoogle = (window as any).adsbygoogle || [];
        (window as any).adsbygoogle.push({});
      } catch (error) {
        console.error('AdSense initialization error:', error);
      }
    }
  }
}
