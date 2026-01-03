import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SpotifyAuthService } from '../../services/spotify-auth.service';
import { SpotifyPlaybackService } from '../../services/spotify-playback.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {
  private router = inject(Router);
  private authService = inject(SpotifyAuthService);
  private playbackService = inject(SpotifyPlaybackService);

  // Public signals for template
  isAuthenticated = this.authService.isAuthenticated;
  isPlayerReady = this.playbackService.isPlayerReady;

  // Free mode (using preview URLs without authentication)
  private freeModeActive = signal(false);
  isFreeMode = this.freeModeActive.asReadonly();

  hostGame(): void {
    this.router.navigate(['/setup']);
  }

  joinGame(): void {
    this.router.navigate(['/join']);
  }

  async loginSpotify(): Promise<void> {
    try {
      await this.authService.login();
    } catch (error) {
      console.error('Login failed:', error);
    }
  }

  async initializePlayer(): Promise<void> {
    try {
      await this.playbackService.initializePlayer();
    } catch (error) {
      console.error('Player initialization failed:', error);
    }
  }

  logout(): void {
    this.playbackService.disconnect();
    this.authService.logout();
    this.freeModeActive.set(false);
  }

  playAsFreeUser(): void {
    // Enable free mode - user can play without authentication using preview URLs
    this.freeModeActive.set(true);
    console.log('Free mode activated - using preview URLs');
  }
}
