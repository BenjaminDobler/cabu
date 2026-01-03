import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { HostSimpleComponent } from './components/host-simple/host-simple.component';
import { JoinSimpleComponent } from './components/join-simple/join-simple.component';
import { SpotifyCallbackComponent } from './components/spotify-callback/spotify-callback.component';
import { GameSetupComponent } from './components/game-setup/game-setup.component';
import { GameLobbyComponent } from './components/game-lobby/game-lobby.component';
import { GamePlayComponent } from './components/game-play/game-play.component';
import { GameResultsComponent } from './components/game-results/game-results.component';
import { GameJoinComponent } from './components/game-join/game-join';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'callback', component: SpotifyCallbackComponent },
  { path: 'setup', component: GameSetupComponent },
  { path: 'lobby', component: GameLobbyComponent },
  { path: 'game', component: GamePlayComponent },
  { path: 'results', component: GameResultsComponent },
  { path: 'join', component: GameJoinComponent },
  { path: 'host', component: HostSimpleComponent },
  { path: 'join-test', component: JoinSimpleComponent },
  { path: '**', redirectTo: '' }
];
