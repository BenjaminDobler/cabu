import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { HostComponent } from './components/host/host.component';
import { JoinComponent } from './components/join/join.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'host', component: HostComponent },
  { path: 'join', component: JoinComponent },
  { path: '**', redirectTo: '' }
];
