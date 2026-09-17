import { Routes } from '@angular/router';
import { HomePageComponent } from './home-page.component';
import { RaffleMachinePageComponent } from './raffle-machine-page.component';
import { SignInComponent } from './sign-in.component';
import { GameSetupPageComponent } from './game-setup-page.component';

export const routes: Routes = [
  { path: '', component: HomePageComponent },
  { path: 'signin', component: SignInComponent },
  { path: 'games/new', component: GameSetupPageComponent },
  { path: 'raffles', component: RaffleMachinePageComponent },
  { path: 'raffles/:id', component: RaffleMachinePageComponent },
  { path: '**', redirectTo: '' }
];
