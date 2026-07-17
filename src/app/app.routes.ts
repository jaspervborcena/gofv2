import { Routes } from '@angular/router';
import { HomePageComponent } from './home-page.component';
import { RafflePageComponent } from './raffle-page.component';

export const routes: Routes = [
  { path: '', component: HomePageComponent },
  { path: 'raffles/:id', component: RafflePageComponent },
  { path: '**', redirectTo: '' }
];
