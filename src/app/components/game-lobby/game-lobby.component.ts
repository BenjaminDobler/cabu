import { Component, signal, inject, OnInit, OnDestroy, effect } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WebRTCSimpleService } from '../../services/webrtc-simple.service';
import { GameSettings, QuizQuestion, QUESTION_TYPE_LABELS } from '../../models/game.model';
import { PlayerInfo, GameMessage } from '../../models/connection.model';

@Component({
  selector: 'app-game-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './game-lobby.component.html',
  styleUrl: './game-lobby.component.scss'
})
export class GameLobbyComponent implements OnInit, OnDestroy {
  private webrtcService = inject(WebRTCSimpleService);
  private router = inject(Router);

  // WebRTC state
  roomCode = this.webrtcService.roomCode;
  playerCount = this.webrtcService.playerCount;
  status = this.webrtcService.status;
  players = this.webrtcService.players;

  // UI state
  showNameInput = signal(true);
  playerName = signal('');
  loading = signal(false);
  error = signal<string | null>(null);
  copied = signal(false);

  // Game data
  settings = signal<GameSettings | null>(null);
  questions = signal<QuizQuestion[]>([]);
  questionTypeLabels = QUESTION_TYPE_LABELS;
  private lastSharedPlayerCount = 0;

  constructor() {
    // Listen for new players joining (host only)
    effect(() => {
      const players = this.players();
      const currentCount = players.length;

      // Only share data when player count actually increases (not on every signal update)
      if (this.webrtcService.hosting() && currentCount > this.lastSharedPlayerCount && currentCount > 1) {
        console.log(`New player joined, sharing game data (count: ${this.lastSharedPlayerCount} -> ${currentCount})`);
        this.lastSharedPlayerCount = currentCount;
        this.shareGameData();
      } else if (this.webrtcService.hosting() && currentCount === 1) {
        // Initialize for host-only
        this.lastSharedPlayerCount = 1;
      }
    });
  }

  async ngOnInit(): Promise<void> {
    // Load game settings and questions from session storage
    const settingsJson = sessionStorage.getItem('gameSettings');
    const questionsJson = sessionStorage.getItem('gameQuestions');

    if (!settingsJson || !questionsJson) {
      this.error.set('No game data found. Please start a new game.');
      this.showNameInput.set(false);
      setTimeout(() => this.router.navigate(['/setup']), 2000);
      return;
    }

    try {
      const settings = JSON.parse(settingsJson);
      const questions = JSON.parse(questionsJson);

      this.settings.set(settings);
      this.questions.set(questions);

      // Check if already hosting (returning to lobby after a game)
      if (this.webrtcService.hosting() && this.webrtcService.roomCode()) {
        console.log('Already hosting, reusing existing lobby');
        this.showNameInput.set(false);
        this.loading.set(false);
        return;
      }

      // Check if player name already exists in sessionStorage
      const savedName = sessionStorage.getItem('playerName');
      if (savedName) {
        this.playerName.set(savedName);
        await this.createLobby();
      }
      // Otherwise, show name input form
    } catch (err: any) {
      this.error.set(err.message || 'Failed to load game data');
      this.showNameInput.set(false);
    }
  }

  async submitName(): Promise<void> {
    const name = this.playerName().trim();
    if (!name) {
      this.error.set('Please enter your name');
      return;
    }

    // Save name to session storage
    sessionStorage.setItem('playerName', name);

    await this.createLobby();
  }

  async createLobby(): Promise<void> {
    this.showNameInput.set(false);
    this.loading.set(true);
    this.error.set(null);

    try {
      // Create game room as host with player name
      await this.webrtcService.hostGame(this.playerName());
      this.loading.set(false);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to create lobby');
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    // Don't disconnect if navigating to game
    // this.webrtcService.disconnect();
  }

  async copyRoomCode(): Promise<void> {
    const code = this.roomCode();
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }

  /**
   * Share game settings and questions with all connected guests
   */
  private shareGameData(): void {
    const settings = this.settings();
    const questions = this.questions();

    if (!settings || questions.length === 0) return;

    const message: GameMessage = {
      type: 'game-start',
      from: 'host',
      timestamp: Date.now(),
      data: {
        settings,
        questions
      }
    };

    this.webrtcService.sendGameMessage(message);
  }

  startGame(): void {
    // Share game data one more time before starting
    this.shareGameData();

    // Navigate to game play component
    this.router.navigate(['/game']);
  }

  cancel(): void {
    this.webrtcService.disconnect();
    sessionStorage.removeItem('gameSettings');
    sessionStorage.removeItem('gameQuestions');
    this.router.navigate(['/']);
  }

  // Get formatted genre list
  get genresList(): string {
    const settings = this.settings();
    if (!settings || settings.filters.genres.length === 0) {
      return 'All genres';
    }
    return settings.filters.genres.join(', ');
  }

  // Get formatted year range
  get yearRange(): string {
    const settings = this.settings();
    if (!settings) return '';
    const { start, end } = settings.filters.yearRange;
    return `${start} - ${end}`;
  }

  // Get formatted question types
  get questionTypesList(): string {
    const settings = this.settings();
    if (!settings) return '';
    return settings.questionTypes
      .map(type => this.questionTypeLabels[type])
      .join(', ');
  }

  // Get formatted answer mode
  get answerModeLabel(): string {
    const settings = this.settings();
    if (!settings) return '';

    const modes = {
      'fuzzy': 'Fuzzy Match',
      'multiple-choice': 'Multiple Choice',
      'exact': 'Exact Match'
    };

    return modes[settings.answerMode] || settings.answerMode;
  }

  // Get formatted time limit
  get timeLimitLabel(): string {
    const settings = this.settings();
    if (!settings) return '';
    return settings.timeLimit > 0
      ? `${settings.timeLimit} seconds`
      : 'No limit';
  }

  // Get formatted audio mode
  get audioModeLabel(): string {
    const settings = this.settings();
    if (!settings) return '';
    return settings.audioPlayback === 'all-devices'
      ? 'All Devices'
      : 'Host Only';
  }
}
