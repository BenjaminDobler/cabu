import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * Spotify OAuth authentication service
 * Handles user authentication and session management
 */
@Injectable({
  providedIn: 'root'
})
export class SpotifyAuthService {
  private readonly API_URL = environment.apiUrl;

  // Signals for authentication state
  private authenticated = signal(false);
  private sessionIdSignal = signal<string | null>(null);
  private accessTokenSignal = signal<string | null>(null);
  private authError = signal<string | null>(null);

  // Public readonly signals
  public readonly isAuthenticated = this.authenticated.asReadonly();
  public readonly sessionId = this.sessionIdSignal.asReadonly();
  public readonly accessToken = this.accessTokenSignal.asReadonly();
  public readonly error = this.authError.asReadonly();

  constructor() {
    // Check for existing session in localStorage
    this.loadSessionFromStorage();
  }

  /**
   * Initiate Spotify OAuth flow
   * Redirects user to Spotify authorization page
   */
  async login(): Promise<void> {
    try {
      // Get authorization URL from backend
      const response = await fetch(`${this.API_URL}/api/spotify/auth/url`);
      const data = await response.json();

      if (data.success && data.authUrl) {
        // Redirect to Spotify authorization page
        window.location.href = data.authUrl;
      } else {
        throw new Error('Failed to get authorization URL');
      }
    } catch (error) {
      console.error('Login error:', error);
      this.authError.set('Failed to initiate Spotify login');
      throw error;
    }
  }

  /**
   * Handle OAuth callback with authorization code
   * Called by the callback component after redirect from Spotify
   */
  async handleCallback(code: string): Promise<void> {
    try {
      // Exchange code for session
      const response = await fetch(`${this.API_URL}/api/spotify/auth/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code })
      });

      const data = await response.json();

      if (data.success && data.sessionId) {
        this.sessionIdSignal.set(data.sessionId);

        // Get access token for Web Playback SDK
        await this.fetchAccessToken(data.sessionId);

        // Store session in localStorage
        this.saveSessionToStorage(data.sessionId);

        this.authenticated.set(true);
        this.authError.set(null);

        console.log('✓ Spotify authentication successful');
      } else {
        throw new Error(data.error || 'Authentication failed');
      }
    } catch (error) {
      console.error('Callback error:', error);
      this.authError.set('Failed to complete Spotify authentication');
      throw error;
    }
  }

  /**
   * Fetch access token for current session
   * Needed for Spotify Web Playback SDK
   */
  private async fetchAccessToken(sessionId: string): Promise<void> {
    try {
      const response = await fetch(`${this.API_URL}/api/spotify/session/${sessionId}`);
      const data = await response.json();

      if (data.success && data.session) {
        this.accessTokenSignal.set(data.session.accessToken);
      } else {
        throw new Error('Failed to get access token');
      }
    } catch (error) {
      console.error('Failed to fetch access token:', error);
      throw error;
    }
  }

  /**
   * Refresh access token
   * Called periodically or when token expires
   */
  async refreshToken(): Promise<void> {
    const currentSessionId = this.sessionIdSignal();
    if (!currentSessionId) {
      throw new Error('No active session');
    }

    await this.fetchAccessToken(currentSessionId);
  }

  /**
   * Logout and clear session
   */
  logout(): void {
    this.authenticated.set(false);
    this.sessionIdSignal.set(null);
    this.accessTokenSignal.set(null);
    this.authError.set(null);

    // Clear localStorage
    localStorage.removeItem('spotify_session_id');

    console.log('✓ Logged out from Spotify');
  }

  /**
   * Save session to localStorage
   */
  private saveSessionToStorage(sessionId: string): void {
    localStorage.setItem('spotify_session_id', sessionId);
  }

  /**
   * Load session from localStorage
   */
  private loadSessionFromStorage(): void {
    const sessionId = localStorage.getItem('spotify_session_id');

    if (sessionId) {
      this.sessionIdSignal.set(sessionId);

      // Try to fetch access token
      this.fetchAccessToken(sessionId)
        .then(() => {
          this.authenticated.set(true);
          console.log('✓ Restored Spotify session from storage');
        })
        .catch(() => {
          // Session expired or invalid, clear it
          this.logout();
        });
    }
  }

  /**
   * Get session ID for API calls
   */
  getSessionId(): string | null {
    return this.sessionIdSignal();
  }

  /**
   * Get access token for Spotify Web Playback SDK
   */
  getAccessToken(): string | null {
    return this.accessTokenSignal();
  }
}
