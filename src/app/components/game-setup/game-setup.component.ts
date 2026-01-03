import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SpotifyAuthService } from '../../services/spotify-auth.service';
import { MusicService } from '../../services/music.service';
import {
  GameSettings,
  DEFAULT_GAME_SETTINGS,
  AVAILABLE_GENRES,
  QUESTION_TYPE_LABELS,
  QuestionType
} from '../../models/game.model';

@Component({
  selector: 'app-game-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './game-setup.component.html',
  styleUrl: './game-setup.component.scss'
})
export class GameSetupComponent {
  private router = inject(Router);
  private authService = inject(SpotifyAuthService);
  private musicService = inject(MusicService);

  // Game settings
  settings = signal<GameSettings>({ ...DEFAULT_GAME_SETTINGS });

  // UI state
  isGenerating = signal(false);
  error = signal<string | null>(null);
  genreSearchTerm = signal('');

  // Available options
  availableGenres = AVAILABLE_GENRES;
  questionTypeLabels = QUESTION_TYPE_LABELS;
  questionTypes: QuestionType[] = [
    'song-title',
    'artist',
    'album',
    'release-year',
    'release-decade',
    'producer'
  ];

  // Check if user is authenticated
  isAuthenticated = this.authService.isAuthenticated;

  // Filtered genres based on search
  get filteredGenres(): string[] {
    const search = this.genreSearchTerm().toLowerCase();
    if (!search) return this.availableGenres;
    return this.availableGenres.filter(genre =>
      genre.toLowerCase().includes(search)
    );
  }

  // Check if a genre is selected
  isGenreSelected(genre: string): boolean {
    return this.settings().filters.genres.includes(genre);
  }

  // Toggle genre selection
  toggleGenre(genre: string): void {
    const current = this.settings();
    const genres = current.filters.genres;

    if (genres.includes(genre)) {
      // Remove genre
      this.settings.set({
        ...current,
        filters: {
          ...current.filters,
          genres: genres.filter(g => g !== genre)
        }
      });
    } else {
      // Add genre
      this.settings.set({
        ...current,
        filters: {
          ...current.filters,
          genres: [...genres, genre]
        }
      });
    }
  }

  // Select all genres
  selectAllGenres(): void {
    const current = this.settings();
    this.settings.set({
      ...current,
      filters: {
        ...current.filters,
        genres: [...this.availableGenres]
      }
    });
  }

  // Clear all genres
  clearAllGenres(): void {
    const current = this.settings();
    this.settings.set({
      ...current,
      filters: {
        ...current.filters,
        genres: []
      }
    });
  }

  // Check if a question type is selected
  isQuestionTypeSelected(type: QuestionType): boolean {
    return this.settings().questionTypes.includes(type);
  }

  // Toggle question type
  toggleQuestionType(type: QuestionType): void {
    const current = this.settings();
    const types = current.questionTypes;

    if (types.includes(type)) {
      // Don't allow removing the last type
      if (types.length === 1) return;

      this.settings.set({
        ...current,
        questionTypes: types.filter(t => t !== type)
      });
    } else {
      this.settings.set({
        ...current,
        questionTypes: [...types, type]
      });
    }
  }

  // Update rounds
  updateRounds(value: string): void {
    const rounds = Math.max(1, Math.min(20, parseInt(value) || 5));
    const current = this.settings();
    this.settings.set({ ...current, rounds });
  }

  // Update year range
  updateYearStart(value: string): void {
    const start = parseInt(value) || 1950;
    const current = this.settings();
    this.settings.set({
      ...current,
      filters: {
        ...current.filters,
        yearRange: { ...current.filters.yearRange, start }
      }
    });
  }

  updateYearEnd(value: string): void {
    const end = parseInt(value) || 2025;
    const current = this.settings();
    this.settings.set({
      ...current,
      filters: {
        ...current.filters,
        yearRange: { ...current.filters.yearRange, end }
      }
    });
  }

  // Update answer mode
  setAnswerMode(mode: 'fuzzy' | 'multiple-choice' | 'exact'): void {
    const current = this.settings();
    this.settings.set({ ...current, answerMode: mode });
  }

  // Update time limit
  toggleTimeLimit(): void {
    const current = this.settings();
    this.settings.set({
      ...current,
      timeLimit: current.timeLimit === 0 ? 30 : 0
    });
  }

  updateTimeLimit(value: string): void {
    const timeLimit = Math.max(10, Math.min(60, parseInt(value) || 30));
    const current = this.settings();
    this.settings.set({ ...current, timeLimit });
  }

  // Update audio playback mode
  setAudioPlayback(mode: 'all-devices' | 'host-only'): void {
    const current = this.settings();
    this.settings.set({ ...current, audioPlayback: mode });
  }

  // Start game
  async startGame(): Promise<void> {
    this.isGenerating.set(true);
    this.error.set(null);

    try {
      const currentSettings = this.settings();

      // Set useAuthentication based on auth state
      currentSettings.useAuthentication = this.isAuthenticated();

      // Validate settings
      if (currentSettings.filters.genres.length === 0) {
        throw new Error('Please select at least one genre');
      }

      if (currentSettings.questionTypes.length === 0) {
        throw new Error('Please select at least one question type');
      }

      console.log('Generating quiz with settings:', currentSettings);

      // Generate questions
      const questions = await this.musicService.generateQuestions(currentSettings);

      console.log(`✓ Generated ${questions.length} questions`);

      // Store questions in session storage for game component
      sessionStorage.setItem('gameSettings', JSON.stringify(currentSettings));
      sessionStorage.setItem('gameQuestions', JSON.stringify(questions));

      // Navigate to lobby
      this.router.navigate(['/lobby']);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start game';
      this.error.set(errorMessage);
      console.error('Error starting game:', err);
    } finally {
      this.isGenerating.set(false);
    }
  }

  // Cancel and go back
  cancel(): void {
    this.router.navigate(['/']);
  }
}
