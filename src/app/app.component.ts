import { Component, HostListener, inject } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterOutlet, RouterLink } from '@angular/router';
import { JoinedGameLiveState, RaffleService, UserProfileGame, UserProfileSummary } from './raffle.service';
import { AdBannerComponent } from './ad-banner.component';
import { FeaturesFooterComponent } from './features-footer.component';
import { HelpMenuComponent } from './help-menu.component';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink, AdBannerComponent, FeaturesFooterComponent, HelpMenuComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'Game of Fortunes';
  raffleService = inject(RaffleService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  theme: 'dark' | 'light' = 'dark';
  profileImageFailed = false;
  user: { uid: string; displayName?: string | null; email?: string | null; photoURL?: string | null; phoneNumber?: string | null } | null = null;
  welcomeName = '';
  adFree = false;
  profileOpen = false;
  activeProfileTab: 'profile' | 'history' = 'profile';
  profileLoading = false;
  profileError = '';
  profileSummary: UserProfileSummary | null = null;
  profileGameIndex = 0;
  joinedGameLiveStates: JoinedGameLiveState[] = [];
  profileFullName = '';
  savedProfileFullName = '';
  profileNickname = '';
  savedProfileNickname = '';
  profilePhoneNumber = '';
  savedProfilePhoneNumber = '';
  profileSaving = false;
  profileSaveMessage = '';
  private stopWatchingJoinedGames?: () => void;
  private readonly observedSpinIds = new Map<string, string>();

  constructor() {
    this.initializeTheme();
    this.raffleService.user$.subscribe(async (authUser) => {
      this.stopWatchingJoinedGames?.();
      this.joinedGameLiveStates = [];
      this.observedSpinIds.clear();
      this.profileImageFailed = false;
      this.user = authUser
        ? {
            uid: authUser.uid,
            displayName: authUser.displayName,
            email: authUser.email,
            photoURL: authUser.photoURL,
            phoneNumber: authUser.phoneNumber
          }
        : null;
      this.welcomeName = '';
      this.profileOpen = false;
      this.profileSummary = null;
      this.profileFullName = '';
      this.savedProfileFullName = '';
      this.profileNickname = '';
      this.savedProfileNickname = '';
      this.profilePhoneNumber = '';
      this.savedProfilePhoneNumber = '';
      this.adFree = authUser ? (await this.raffleService.getCurrentUserPlan(authUser.uid)) !== 'free' : false;
      if (authUser) {
        this.stopWatchingJoinedGames = this.raffleService.watchUserJoinedGames(
          authUser.uid,
          (games) => this.handleJoinedGameUpdates(authUser.uid, games),
          (error) => console.error('Live joined-game updates stopped.', error)
        );
        await this.raffleService.ensureUserSpinFields(authUser.uid);
        try {
          await this.raffleService.syncAuthenticatedUserProfile(authUser);
        } catch (error) {
          console.warn('Could not synchronize the signed-in user profile.', error);
        }

        const greetingName = await this.raffleService.getUserGreetingName(authUser.uid);
        if (this.user?.uid === authUser.uid) {
          this.welcomeName = greetingName;
        }
      }
    });
  }

  private handleJoinedGameUpdates(userId: string, games: JoinedGameLiveState[]): void {
    this.joinedGameLiveStates = games;
    const newlySpinningGames = games.filter((game) => {
      const spin = game.activeSpin;
      if (!spin || game.creatorId === userId || spin.phase !== 'scheduled') {
        return false;
      }

      const isNewSpin = this.observedSpinIds.get(game.gameUid) !== spin.spinId;
      this.observedSpinIds.set(game.gameUid, spin.spinId);
      return isNewSpin;
    });
    const spinningGame = newlySpinningGames.sort((left, right) =>
      (right.activeSpin?.scheduledStartAt ?? 0) - (left.activeSpin?.scheduledStartAt ?? 0))[0];
    if (!spinningGame?.activeSpin) {
      return;
    }

    const currentSpectatorPath = `/games/${spinningGame.gameId}/spectate`;
    if (this.router.url.split('?')[0] === currentSpectatorPath) {
      return;
    }

    this.profileOpen = false;
    void this.router.navigate(['/games', spinningGame.gameId, 'spectate']);
  }

  get selectedProfileGame(): UserProfileGame | null {
    return this.profileSummary?.games[this.profileGameIndex] ?? null;
  }

  isProfileGameSpinning(gameId: string): boolean {
    return this.joinedGameLiveStates.some((game) =>
      game.gameId === gameId && game.activeSpin?.phase === 'scheduled');
  }

  previousProfileGame(): void {
    const count = this.profileSummary?.games.length ?? 0;
    if (count > 1) {
      this.profileGameIndex = (this.profileGameIndex - 1 + count) % count;
    }
  }

  nextProfileGame(): void {
    const count = this.profileSummary?.games.length ?? 0;
    if (count > 1) {
      this.profileGameIndex = (this.profileGameIndex + 1) % count;
    }
  }

  toggleTheme(): void {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    this.document.documentElement.setAttribute('data-theme', this.theme);
    try {
      this.document.defaultView?.localStorage.setItem('gof-theme', this.theme);
    } catch {
      this.theme = this.document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }
  }

  private initializeTheme(): void {
    try {
      this.theme = this.document.defaultView?.localStorage.getItem('gof-theme') === 'light' ? 'light' : 'dark';
    } catch {
      this.theme = 'dark';
    }
    this.document.documentElement.setAttribute('data-theme', this.theme);
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

  get welcomeDisplayName(): string {
    return this.welcomeName || this.userDisplayName.split(/\s+/)[0] || 'Player';
  }

  get userInitials(): string {
    return this.userDisplayName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toLocaleUpperCase();
  }

  async toggleProfile(): Promise<void> {
    this.profileOpen = !this.profileOpen;
    if (!this.profileOpen || !this.user) {
      return;
    }

    this.activeProfileTab = 'profile';
    this.profileSummary = null;
    this.profileGameIndex = 0;
    this.profileLoading = true;
    this.profileError = '';
    try {
      this.profileSummary = await this.raffleService.getUserProfileSummary(this.user.uid);
      this.profileFullName = this.profileSummary.fullName;
      this.savedProfileFullName = this.profileSummary.fullName;
      this.profileNickname = this.profileSummary.nickname;
      this.savedProfileNickname = this.profileSummary.nickname;
      this.profilePhoneNumber = this.profileSummary.phoneNumber;
      this.savedProfilePhoneNumber = this.profileSummary.phoneNumber;
      this.profileSaveMessage = '';
    } catch {
      this.profileError = 'Profile details could not be loaded. Please try again.';
    } finally {
      this.profileLoading = false;
    }
  }

  async signOut(): Promise<void> {
    this.profileOpen = false;
    await this.raffleService.signOut();
  }

  get fullNameChanged(): boolean {
    return this.profileFullName.trim() !== this.savedProfileFullName.trim();
  }

  get nicknameChanged(): boolean {
    return this.profileNickname.trim() !== this.savedProfileNickname.trim();
  }

  get phoneNumberChanged(): boolean {
    return this.profilePhoneNumber.trim() !== this.savedProfilePhoneNumber.trim();
  }

  async saveProfileNames(): Promise<void> {
    if (!this.user || !this.profileFullName.trim() || this.profileSaving) {
      this.profileSaveMessage = 'Enter your full name before saving.';
      return;
    }

    this.profileSaving = true;
    this.profileSaveMessage = '';
    try {
      await this.raffleService.saveProfileNames(
        this.user.uid,
        this.profileFullName,
        this.profileNickname,
        this.profilePhoneNumber
      );
      if (this.profileSummary) {
        this.profileSummary = {
          ...this.profileSummary,
          fullName: this.profileFullName.trim(),
          nickname: this.profileNickname.trim(),
          phoneNumber: this.profilePhoneNumber.trim()
        };
      }
      this.savedProfileFullName = this.profileFullName.trim();
      this.savedProfileNickname = this.profileNickname.trim();
      this.savedProfilePhoneNumber = this.profilePhoneNumber.trim();
      this.welcomeName = this.profileNickname.trim()
        || this.profileFullName.trim().split(/\s+/)[0]
        || this.welcomeName;
      this.profileSaveMessage = '';
    } catch (error) {
      this.profileSaveMessage = this.raffleService.getFirestoreErrorMessage(
        error,
        'Could not save your profile. Please try again.'
      );
    } finally {
      this.profileSaving = false;
    }
  }

  @HostListener('document:click', ['$event'])
  closeProfileOnOutsideClick(event: MouseEvent): void {
    if (event.target instanceof Element && !event.target.closest('.profile-wrap')) {
      this.profileOpen = false;
    }
  }

  @HostListener('document:keydown.escape')
  closeProfileOnEscape(): void {
    this.profileOpen = false;
  }
}
