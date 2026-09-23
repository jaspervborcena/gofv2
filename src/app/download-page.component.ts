import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Storage, getDownloadURL, ref } from '@angular/fire/storage';

@Component({
  selector: 'app-download-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './download-page.component.html',
  styleUrl: './download-page.component.scss'
})
export class DownloadPageComponent implements OnInit {
  private readonly storage = inject(Storage);
  readonly fileName = 'gameoffortunes.apk';
  downloadUrl = '';
  loading = true;
  error = '';

  async ngOnInit(): Promise<void> {
    try {
      this.downloadUrl = await getDownloadURL(ref(this.storage, `download/android/${this.fileName}`));
    } catch {
      this.error = 'The Android download is not available yet. Please try again later.';
    } finally {
      this.loading = false;
    }
  }
}