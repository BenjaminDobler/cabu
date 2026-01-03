export interface GameSettings {
  musicPlatform: 'spotify';
  useAuthentication: boolean;
  filters: MusicFilters;
  rounds: number;
  questionTypes: QuestionType[];
  answerMode: 'fuzzy' | 'multiple-choice' | 'exact';
  timeLimit: number; // seconds, 0 = no limit
  audioPlayback: 'all-devices' | 'host-only';
}

export interface MusicFilters {
  genres: string[];
  excludeGenres: string[];
  yearRange: { start: number; end: number };
}

export type QuestionType =
  | 'song-title'
  | 'artist'
  | 'album'
  | 'release-year'
  | 'release-decade'
  | 'producer';

export interface QuizQuestion {
  id: string;
  round: number;
  trackId: string;
  trackUri: string | null;  // Spotify URI for playback (Premium users)
  previewUrl: string | null;  // 30-second MP3 URL (Free users)
  hasPreview: boolean;
  imageUrl: string | null;
  type: QuestionType;
  question: string;
  correctAnswer: string;
  difficulty: number;
  metadata: {
    title: string;
    artist: string;
    album: string;
    year: number | null;
    duration: number;
    popularity: number;
  };
}

export interface Player {
  id: string;
  name: string;
  role: 'host' | 'guest';
  connected: boolean;
}

export interface PlayerScore {
  playerId: string;
  totalScore: number;
  correctAnswers: number;
  currentStreak: number;
  maxStreak: number;
  roundScores: RoundScore[];
}

export interface RoundScore {
  round: number;
  answer: string;
  correct: boolean;
  basePoints: number;
  speedBonus: number;
  streakMultiplier: number;
  difficultyMultiplier: number;
  totalPoints: number;
  timeToAnswer: number; // milliseconds
}

// Default game settings
export const DEFAULT_GAME_SETTINGS: GameSettings = {
  musicPlatform: 'spotify',
  useAuthentication: false,
  filters: {
    genres: [],
    excludeGenres: [],
    yearRange: { start: 1950, end: 2025 }
  },
  rounds: 5,
  questionTypes: ['song-title', 'artist'],
  answerMode: 'fuzzy',
  timeLimit: 30,
  audioPlayback: 'all-devices'
};

// Available genres for selection
export const AVAILABLE_GENRES = [
  'pop',
  'rock',
  'hip-hop',
  'electronic',
  'country',
  'jazz',
  'classical',
  'r-n-b',
  'indie',
  'metal',
  'folk',
  'blues',
  'reggae',
  'latin',
  'dance'
].sort();

// Question type labels
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  'song-title': 'Song Title',
  'artist': 'Artist',
  'album': 'Album',
  'release-year': 'Release Year',
  'release-decade': 'Release Decade',
  'producer': 'Producer'
};
