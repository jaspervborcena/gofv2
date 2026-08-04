import { Routes } from '@angular/router';
import { HomePageComponent } from './home-page.component';
import { RafflePageComponent } from './raffle-page.component';
import { SpinWheelPageComponent } from './spin-wheel-page.component';
import { SlotMachinePageComponent } from './slot-machine-page.component';

export const routes: Routes = [
  { path: '', component: HomePageComponent },
  { path: 'slots', component: SlotMachinePageComponent },
  { path: 'spin', component: SpinWheelPageComponent },
  { path: 'raffles/:id', component: RafflePageComponent },
  { path: '**', redirectTo: '' }
];
