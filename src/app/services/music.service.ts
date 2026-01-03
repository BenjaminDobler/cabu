import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { GameSettings, QuizQuestion } from '../models/game.model';
import { SpotifyAuthService } from './spotify-auth.service';

interface Track {
  id: string;
  uri: string;
  title: string;
  artist: string;
  album: string;
  year: number | null;
  imageUrl: string | null;
  duration: number;
  popularity: number;
}

@Injectable({
  providedIn: 'root'
})
export class MusicService {
  private http = inject(HttpClient);
  private authService = inject(SpotifyAuthService);

  private loadingSignal = signal(false);
  private errorSignal = signal<string | null>(null);

  isLoading = this.loadingSignal.asReadonly();
  error = this.errorSignal.asReadonly();

  /**
   * Generate quiz questions based on game settings
   */
  async generateQuestions(settings: GameSettings): Promise<QuizQuestion[]> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const sessionId = settings.useAuthentication
        ? this.authService.getSessionId()
        : null;

      const response = await fetch(`${environment.apiUrl}/api/quiz/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId,
          ...settings
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate questions');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to generate questions');
      }

      console.log(`✓ Generated ${data.questions.length} quiz questions`);
      return data.questions;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.errorSignal.set(errorMessage);
      console.error('Error generating questions:', error);
      throw error;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * Search tracks (for preview/testing)
   */
  async searchTracks(filters: any, limit: number = 50): Promise<Track[]> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const sessionId = this.authService.getSessionId();

      const response = await fetch(`${environment.apiUrl}/api/spotify/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId,
          filters,
          limit
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to search tracks');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to search tracks');
      }

      return data.tracks;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.errorSignal.set(errorMessage);
      console.error('Error searching tracks:', error);
      throw error;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * Get preview URL for a track (free users)
   */
  async getPreviewUrl(trackId: string): Promise<{ hasPreview: boolean; previewUrl: string | null }> {
    try {
      const response = await fetch(`${environment.apiUrl}/api/spotify/preview/${trackId}`);

      if (!response.ok) {
        throw new Error('Failed to get preview URL');
      }

      const data = await response.json();

      return {
        hasPreview: data.hasPreview,
        previewUrl: data.previewUrl
      };

    } catch (error) {
      console.error('Error getting preview URL:', error);
      return { hasPreview: false, previewUrl: null };
    }
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this.errorSignal.set(null);
  }
}
