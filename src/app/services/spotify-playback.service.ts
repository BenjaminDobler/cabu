import { Injectable, signal, inject } from '@angular/core';
import { SpotifyAuthService } from './spotify-auth.service';

/**
 * Type definitions for Spotify Web Playback SDK
 * These will be available globally after loading the SDK script
 */
declare global {
  interface Window {
    Spotify: any;
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

/**
 * Spotify Web Playback SDK service
 * Handles music playback in the browser
 */
@Injectable({
  providedIn: 'root'
})
export class SpotifyPlaybackService {
  private authService = inject(SpotifyAuthService);

  // Playback state signals
  private playerReady = signal(false);
  private playing = signal(false);
  private currentTrackSignal = signal<any | null>(null);
  private positionSignal = signal(0);
  private durationSignal = signal(0);
  private volumeSignal = signal(1.0);
  private playbackError = signal<string | null>(null);

  // Public readonly signals
  public readonly isPlayerReady = this.playerReady.asReadonly();
  public readonly isPlaying = this.playing.asReadonly();
  public readonly currentTrack = this.currentTrackSignal.asReadonly();
  public readonly position = this.positionSignal.asReadonly();
  public readonly duration = this.durationSignal.asReadonly();
  public readonly volume = this.volumeSignal.asReadonly();
  public readonly error = this.playbackError.asReadonly();

  private player: any = null;
  private deviceId: string | null = null;
  private sdkReady = false;

  constructor() {
    // Wait for SDK to load
    this.waitForSpotifySDK();
  }

  /**
   * Wait for Spotify Web Playback SDK to be ready
   */
  private waitForSpotifySDK(): void {
    if (window.Spotify) {
      this.sdkReady = true;
      return;
    }

    window.onSpotifyWebPlaybackSDKReady = () => {
      this.sdkReady = true;
      console.log('✓ Spotify Web Playback SDK loaded');
    };
  }

  /**
   * Initialize Spotify player
   * Must be called after user authentication
   */
  async initializePlayer(): Promise<void> {
    const accessToken = this.authService.getAccessToken();

    if (!accessToken) {
      throw new Error('No access token available');
    }

    if (!this.sdkReady) {
      await this.waitForSDKToLoad();
    }

    // Create player instance
    this.player = new window.Spotify.Player({
      name: 'Cabu Music Quiz',
      getOAuthToken: (cb: (token: string) => void) => {
        cb(accessToken);
      },
      volume: this.volumeSignal()
    });

    // Set up event listeners
    this.setupPlayerListeners();

    // Connect to player
    const connected = await this.player.connect();

    if (connected) {
      console.log('✓ Spotify player connected');
    } else {
      throw new Error('Failed to connect Spotify player');
    }
  }

  /**
   * Wait for SDK script to load
   */
  private waitForSDKToLoad(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Spotify SDK failed to load'));
      }, 10000);

      const checkInterval = setInterval(() => {
        if (this.sdkReady) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * Set up player event listeners
   */
  private setupPlayerListeners(): void {
    // Player ready
    this.player.addListener('ready', ({ device_id }: { device_id: string }) => {
      console.log('Ready with Device ID', device_id);
      this.deviceId = device_id;
      this.playerReady.set(true);
      this.playbackError.set(null);
    });

    // Player not ready
    this.player.addListener('not_ready', ({ device_id }: { device_id: string }) => {
      console.log('Device ID has gone offline', device_id);
      this.playerReady.set(false);
    });

    // Playback state changed
    this.player.addListener('player_state_changed', (state: any) => {
      if (!state) return;

      this.playing.set(!state.paused);
      this.positionSignal.set(state.position);
      this.durationSignal.set(state.duration);

      if (state.track_window?.current_track) {
        this.currentTrackSignal.set(state.track_window.current_track);
      }
    });

    // Errors
    this.player.addListener('initialization_error', ({ message }: { message: string }) => {
      console.error('Initialization error:', message);
      this.playbackError.set('Player initialization failed');
    });

    this.player.addListener('authentication_error', ({ message }: { message: string }) => {
      console.error('Authentication error:', message);
      this.playbackError.set('Authentication failed');
      // Token might have expired, try to refresh
      this.authService.refreshToken().catch(console.error);
    });

    this.player.addListener('account_error', ({ message }: { message: string }) => {
      console.error('Account error:', message);
      this.playbackError.set('Spotify Premium required');
    });

    this.player.addListener('playback_error', ({ message }: { message: string }) => {
      console.error('Playback error:', message);
      this.playbackError.set('Playback failed');
    });
  }

  /**
   * Play a track by URI
   * @param trackUri - Spotify track URI (e.g., spotify:track:abc123)
   */
  async playTrack(trackUri: string): Promise<void> {
    if (!this.deviceId) {
      throw new Error('Player not ready');
    }

    const accessToken = this.authService.getAccessToken();
    if (!accessToken) {
      throw new Error('Not authenticated');
    }

    try {
      // Use Spotify Web API to start playback on this device
      const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${this.deviceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          uris: [trackUri]
        })
      });

      if (!response.ok) {
        throw new Error('Failed to start playback');
      }

      console.log('✓ Playing track:', trackUri);
    } catch (error) {
      console.error('Playback error:', error);
      this.playbackError.set('Failed to play track');
      throw error;
    }
  }

  /**
   * Resume playback
   */
  async resume(): Promise<void> {
    if (!this.player) {
      throw new Error('Player not initialized');
    }

    await this.player.resume();
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    if (!this.player) {
      throw new Error('Player not initialized');
    }

    await this.player.pause();
  }

  /**
   * Toggle play/pause
   */
  async togglePlayback(): Promise<void> {
    if (!this.player) {
      throw new Error('Player not initialized');
    }

    await this.player.togglePlay();
  }

  /**
   * Set volume (0.0 to 1.0)
   */
  async setVolume(volume: number): Promise<void> {
    if (!this.player) {
      throw new Error('Player not initialized');
    }

    const clampedVolume = Math.max(0, Math.min(1, volume));
    await this.player.setVolume(clampedVolume);
    this.volumeSignal.set(clampedVolume);
  }

  /**
   * Seek to position in milliseconds
   */
  async seek(positionMs: number): Promise<void> {
    if (!this.player) {
      throw new Error('Player not initialized');
    }

    await this.player.seek(positionMs);
  }

  /**
   * Get current playback state
   */
  async getState(): Promise<any> {
    if (!this.player) {
      return null;
    }

    return await this.player.getCurrentState();
  }

  /**
   * Disconnect player
   */
  disconnect(): void {
    if (this.player) {
      this.player.disconnect();
      this.player = null;
      this.deviceId = null;
      this.playerReady.set(false);
      console.log('✓ Spotify player disconnected');
    }
  }
}
