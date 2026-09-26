import { Routes } from '@angular/router';
import { HomePageComponent } from './home-page.component';
import { RafflePageComponent } from './raffle-page.component';
import { SignInComponent } from './sign-in.component';
import { GameSetupPageComponent } from './game-setup-page.component';
import { GameInvitationPageComponent } from './game-invitation-page.component';
import { PlansPageComponent } from './plans-page.component';
import { RaffleUnavailablePageComponent } from './raffle-unavailable-page.component';
import { DownloadPageComponent } from './download-page.component';
import { DonationPageComponent } from './donation-page.component';

export const routes: Routes = [
  { path: '', component: HomePageComponent },
  { path: 'signin', component: SignInComponent },
  { path: 'plans', component: PlansPageComponent },
  { path: 'download', component: DownloadPageComponent },
  { path: 'donation', component: DonationPageComponent },
  { path: 'games/new', component: GameSetupPageComponent },
  { path: 'games/:id/join', component: GameInvitationPageComponent },
  { path: 'raffle-unavailable', component: RaffleUnavailablePageComponent },
  { path: 'raffles', component: RafflePageComponent },
  { path: 'raffles/:id', component: RafflePageComponent },
  { path: '**', redirectTo: '' }
];
