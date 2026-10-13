import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-help-menu',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './help-menu.component.html',
  styleUrl: './help-menu.component.scss'
})
export class HelpMenuComponent {
  isOpen = false;

  toggle(): void {
    this.isOpen = !this.isOpen;
  }

  close(): void {
    this.isOpen = false;
  }

  @HostListener('document:click', ['$event'])
  closeOnOutsideClick(event: MouseEvent): void {
    if (event.target instanceof Element && !event.target.closest('.help-wrap')) {
      this.close();
    }
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    this.close();
  }
}