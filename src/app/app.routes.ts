import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { HostSimpleComponent } from './components/host-simple/host-simple.component';
import { JoinSimpleComponent } from './components/join-simple/join-simple.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'host', component: HostSimpleComponent },
  { path: 'join', component: JoinSimpleComponent },
  { path: '**', redirectTo: '' }
];
