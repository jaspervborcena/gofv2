import { Routes } from '@angular/router';
import { HomePageComponent } from './home-page.component';
import { RafflePageComponent } from './raffle-page.component';
import { SpinWheelPageComponent } from './spin-wheel-page.component';
import { SlotMachinePageComponent } from './slot-machine-page.component';
import { SignInComponent } from './sign-in.component';

export const routes: Routes = [
  { path: '', component: HomePageComponent },
  { path: 'slots', component: SlotMachinePageComponent },
  { path: 'spin', component: SpinWheelPageComponent },
  { path: 'signin', component: SignInComponent },
  { path: 'raffles/:id', component: RafflePageComponent },
  { path: '**', redirectTo: '' }
];
