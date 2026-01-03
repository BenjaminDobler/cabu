import { Component, OnInit, inject } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { SpotifyAuthService } from '../../services/spotify-auth.service';

@Component({
  selector: 'app-spotify-callback',
  standalone: true,
  template: `
    <div class="callback-container">
      <div class="callback-content">
        @if (loading) {
          <div class="loading">
            <div class="spinner"></div>
            <h2>Connecting to Spotify...</h2>
            <p>Please wait while we complete the authentication</p>
          </div>
        }

        @if (error) {
          <div class="error">
            <h2>Authentication Failed</h2>
            <p>{{ error }}</p>
            <button (click)="retry()">Try Again</button>
            <button (click)="goHome()">Go Home</button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .callback-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }

    .callback-content {
      background: white;
      border-radius: 16px;
      padding: 48px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      text-align: center;
      max-width: 500px;
    }

    .loading h2, .error h2 {
      margin: 0 0 16px 0;
      color: #333;
    }

    .loading p, .error p {
      margin: 0 0 24px 0;
      color: #666;
    }

    .spinner {
      width: 48px;
      height: 48px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #667eea;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 24px;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .error {
      color: #d32f2f;
    }

    button {
      background: #667eea;
      color: white;
      border: none;
      border-radius: 8px;
      padding: 12px 24px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      margin: 8px;
      transition: background 0.2s;
    }

    button:hover {
      background: #5568d3;
    }

    button:active {
      transform: scale(0.98);
    }
  `]
})
export class SpotifyCallbackComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private authService = inject(SpotifyAuthService);

  loading = true;
  error: string | null = null;

  async ngOnInit() {
    // Get authorization code from URL parameters
    const code = this.route.snapshot.queryParamMap.get('code');
    const errorParam = this.route.snapshot.queryParamMap.get('error');

    if (errorParam) {
      this.loading = false;
      this.error = 'User denied Spotify authorization';
      return;
    }

    if (!code) {
      this.loading = false;
      this.error = 'No authorization code received';
      return;
    }

    try {
      // Exchange code for session
      await this.authService.handleCallback(code);

      // Success! Redirect to home or game setup
      this.router.navigate(['/']);
    } catch (error) {
      this.loading = false;
      this.error = error instanceof Error ? error.message : 'Authentication failed';
      console.error('OAuth callback error:', error);
    }
  }

  retry() {
    this.loading = true;
    this.error = null;
    this.authService.login();
  }

  goHome() {
    this.router.navigate(['/']);
  }
}
