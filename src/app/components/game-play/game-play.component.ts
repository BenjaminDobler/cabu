import { Component, signal, inject, OnInit, OnDestroy, effect } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WebRTCSimpleService } from '../../services/webrtc-simple.service';
import { SpotifyPlaybackService } from '../../services/spotify-playback.service';
import { GameSettings, QuizQuestion, PlayerScore, RoundScore } from '../../models/game.model';
import { GameMessage, RoundStartData, AnswerSubmittedData, ScoreUpdateData } from '../../models/connection.model';

@Component({
  selector: 'app-game-play',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './game-play.component.html',
  styleUrl: './game-play.component.scss'
})
export class GamePlayComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private webrtcService = inject(WebRTCSimpleService);
  private spotifyService = inject(SpotifyPlaybackService);

  // Game data
  settings = signal<GameSettings | null>(null);
  questions = signal<QuizQuestion[]>([]);
  currentRound = signal(0);
  scores = signal<Map<string, PlayerScore>>(new Map());
  isHost = this.webrtcService.hosting;
  currentPlayer = this.webrtcService.player;
  players = this.webrtcService.players;

  // Answer collection (host only)
  private pendingAnswers = new Map<string, { answer: string; submittedAt: number }>();
  private answersProcessedForRound = -1; // Track which round we've processed

  // Round results for all players
  roundResults = signal<any[]>([]);

  // Current question state
  currentQuestion = signal<QuizQuestion | null>(null);
  timeRemaining = signal(0);
  timerInterval: any = null;

  // Answer state
  playerAnswer = signal('');
  hasSubmitted = signal(false);
  isCorrect = signal<boolean | null>(null);
  answerSubmittedAt = signal<number | null>(null);

  // Audio state
  audioElement: HTMLAudioElement | null = null;
  isPlaying = signal(false);
  audioError = signal<string | null>(null);

  // UI state
  loading = signal(true);
  waitingForPlayers = signal(false);
  error = signal<string | null>(null);
  roundStartTime = 0;

  // Track processed messages to prevent infinite loops
  private lastProcessedMessageIndex = -1;

  constructor() {
    // Listen for messages from WebRTC
    effect(() => {
      const messages = this.webrtcService.messages();

      // Initialize index on first run
      if (this.lastProcessedMessageIndex === -1 && messages.length > 0) {
        // Check if we're returning to game after "Play Again"
        // Look for the most recent game-start message (if any) that came AFTER game-end
        // This handles the case where host clicks "Start Game" while guest is navigating to /game
        let foundRecentGameStart = false;

        // Scan backwards from the end to find the most recent game-start
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].type === 'game-start') {
            // Found a game-start - check if it's after the most recent game-end
            let hasGameEndAfter = false;
            for (let j = i + 1; j < messages.length; j++) {
              if (messages[j].type === 'game-end') {
                hasGameEndAfter = true;
                break;
              }
            }

            if (!hasGameEndAfter) {
              // This game-start has no game-end after it, so it's the current Play Again
              console.log(`Game-play: Found recent game-start at index ${i}, processing from there`);
              this.lastProcessedMessageIndex = i - 1;
              foundRecentGameStart = true;
              break;
            }
          }
        }

        if (!foundRecentGameStart) {
          // No recent game-start found, this is the initial game - process all messages
          console.log('Game-play: Initial game, processing all messages');
        }
      }

      // Process only new messages we haven't seen yet
      for (let i = this.lastProcessedMessageIndex + 1; i < messages.length; i++) {
        console.log(`Processing message ${i + 1}/${messages.length}:`, messages[i].type);
        this.handleGameMessage(messages[i]);
        this.lastProcessedMessageIndex = i;
      }
    });
  }

  async ngOnInit(): Promise<void> {
    // Load game data from session storage
    const settingsJson = sessionStorage.getItem('gameSettings');
    const questionsJson = sessionStorage.getItem('gameQuestions');

    if (!settingsJson || !questionsJson) {
      this.error.set('No game data found. Please start a new game.');
      setTimeout(() => this.router.navigate(['/setup']), 2000);
      return;
    }

    try {
      const settings = JSON.parse(settingsJson);
      const questions = JSON.parse(questionsJson);

      this.settings.set(settings);
      this.questions.set(questions);

      // Initialize scores
      this.initializeScores();

      // Only host starts the game, guests wait for round-start messages
      if (this.isHost()) {
        await this.startRound(0);
      } else {
        // Guest waits for host to start
        this.loading.set(true);
      }

      this.loading.set(false);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to start game');
      this.loading.set(false);
    }
  }

  /**
   * Handle incoming game messages
   */
  private handleGameMessage(message: GameMessage): void {
    console.log('Received game message:', message.type);

    switch (message.type) {
      case 'round-start':
        if (!this.isHost()) {
          this.handleRoundStart(message.data as RoundStartData);
        }
        break;

      case 'answer-submitted':
        if (this.isHost()) {
          this.handleAnswerSubmitted(message);
        }
        break;

      case 'score-update':
        if (!this.isHost()) {
          this.handleScoreUpdate(message.data as ScoreUpdateData);
        }
        break;

      case 'round-end':
        if (!this.isHost()) {
          this.handleRoundEnd(message.data);
        }
        break;

      case 'game-end':
        if (!this.isHost()) {
          this.handleGameEnd(message.data);
        }
        break;
    }
  }

  /**
   * Handle round start message (guest)
   */
  private handleRoundStart(data: RoundStartData): void {
    console.log('Guest received round-start:', data);

    // Find the full question from local storage
    const questions = this.questions();
    const question = questions.find(q => q.id === data.question.id);

    if (!question) {
      console.error('Question not found:', data.question.id);
      return;
    }

    this.currentRound.set(data.round);
    this.currentQuestion.set(question);
    this.playerAnswer.set('');
    this.hasSubmitted.set(false);
    this.isCorrect.set(null);
    this.answerSubmittedAt.set(null);
    this.roundStartTime = Date.now();
    this.loading.set(false);

    // Set timer
    if (data.timeLimit > 0) {
      this.timeRemaining.set(data.timeLimit);
      this.startTimer();
    }

    // Play audio
    this.playAudio(question);
  }

  /**
   * Handle answer submitted from guest (host)
   */
  private handleAnswerSubmitted(message: GameMessage): void {
    const data = message.data as AnswerSubmittedData;
    console.log('Host received answer from:', data.playerId);

    this.pendingAnswers.set(data.playerId, {
      answer: data.answer,
      submittedAt: data.submittedAt
    });

    // Check if all players have submitted
    this.checkAllAnswersSubmitted();
  }

  /**
   * Check if all players submitted answers
   */
  private checkAllAnswersSubmitted(): void {
    const currentRoundNum = this.currentRound();

    // Prevent processing the same round multiple times
    if (this.answersProcessedForRound === currentRoundNum) {
      console.log(`Round ${currentRoundNum} answers already processed, skipping`);
      return;
    }

    const players = this.players();
    const allSubmitted = players.every(p =>
      p.id === 'host' ? this.hasSubmitted() : this.pendingAnswers.has(p.id)
    );

    if (allSubmitted && players.length > 1) {
      console.log(`All ${players.length} players submitted answers for round ${currentRoundNum}, processing...`);
      // All players submitted, process results
      this.processAllAnswers();
    }
  }

  /**
   * Process all player answers (host)
   */
  private processAllAnswers(): void {
    const question = this.currentQuestion();
    if (!question) return;

    // Mark this round as processed
    this.answersProcessedForRound = this.currentRound();
    console.log(`Processing answers for round ${this.answersProcessedForRound}`);

    const results: any[] = [];

    // Process each player's answer
    this.players().forEach(player => {
      let answer = '';
      let submittedAt = Date.now();

      if (player.id === 'host') {
        answer = this.playerAnswer();
        submittedAt = this.answerSubmittedAt() || Date.now();
      } else {
        const pending = this.pendingAnswers.get(player.id);
        if (pending) {
          answer = pending.answer;
          submittedAt = pending.submittedAt;
        }
      }

      const isCorrect = this.validateAnswer(answer, question.correctAnswer);
      const points = this.calculateScoreForPlayer(player.id, isCorrect, submittedAt);

      // Get updated score after calculation
      const playerScore = this.scores().get(player.id);

      results.push({
        playerId: player.id,
        playerName: player.name,
        answer: answer || '(no answer)',
        correct: isCorrect,
        points,
        totalScore: playerScore?.totalScore || 0,
        currentStreak: playerScore?.currentStreak || 0
      });
    });

    // Clear pending answers
    this.pendingAnswers.clear();

    // Store results locally for host too
    this.roundResults.set(results);

    // Set the host's own isCorrect status from their result
    const hostResult = results.find(r => r.playerId === 'host');
    if (hostResult) {
      this.isCorrect.set(hostResult.correct);
      console.log(`Host answer was ${hostResult.correct ? 'CORRECT' : 'INCORRECT'}`);
    }

    // Broadcast results with detailed info
    const roundEndMessage: GameMessage = {
      type: 'round-end',
      from: 'host',
      timestamp: Date.now(),
      data: {
        round: this.currentRound(),
        correctAnswer: question.correctAnswer,
        results
      }
    };

    this.webrtcService.sendGameMessage(roundEndMessage);

    // Broadcast score update
    this.broadcastScores();

    // Move to next round after delay (5 seconds to see all results)
    setTimeout(() => {
      this.stopAudio();
      this.roundResults.set([]); // Clear results
      this.startRound(this.currentRound() + 1);
    }, 5000);
  }

  /**
   * Handle round end message (guest)
   */
  private handleRoundEnd(data: any): void {
    console.log('Guest received round-end:', data);

    // Find this player's result
    const playerId = this.currentPlayer()?.id;
    if (!playerId) return;

    const myResult = data.results.find((r: any) => r.playerId === playerId);

    if (myResult) {
      this.isCorrect.set(myResult.correct);
      console.log(`Guest answer was ${myResult.correct ? 'CORRECT' : 'INCORRECT'}`);

      // Update guest's own score from the broadcast data
      const playerScore = this.scores().get(playerId);
      if (playerScore) {
        playerScore.totalScore = myResult.totalScore;
        playerScore.currentStreak = myResult.currentStreak;
        this.scores.set(new Map(this.scores()));
      }
    }

    // Store all results for display
    this.roundResults.set(data.results);

    // Stop waiting state
    this.waitingForPlayers.set(false);

    // Stop audio
    this.stopAudio();

    // Clear timer
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Handle game end message (guest)
   */
  private handleGameEnd(data: any): void {
    console.log('Guest received game-end:', data);

    // Store scores in session storage
    sessionStorage.setItem('gameScores', JSON.stringify(data.finalScores));

    // Navigate to results
    this.router.navigate(['/results']);
  }

  /**
   * Handle score update (guest)
   */
  private handleScoreUpdate(data: ScoreUpdateData): void {
    console.log('Guest received score update:', data);

    const scoresMap = new Map<string, PlayerScore>();
    data.scores.forEach(scoreData => {
      const existing = this.scores().get(scoreData.playerId);
      if (existing) {
        scoresMap.set(scoreData.playerId, {
          ...existing,
          totalScore: scoreData.totalScore,
          correctAnswers: scoreData.correctAnswers,
          currentStreak: scoreData.currentStreak
        });
      }
    });

    this.scores.set(scoresMap);
  }

  /**
   * Broadcast current scores to all players (host)
   */
  private broadcastScores(): void {
    if (!this.isHost()) return;

    const scores = Array.from(this.scores().values()).map(score => ({
      playerId: score.playerId,
      totalScore: score.totalScore,
      correctAnswers: score.correctAnswers,
      currentStreak: score.currentStreak
    }));

    const message: GameMessage<ScoreUpdateData> = {
      type: 'score-update',
      from: 'host',
      timestamp: Date.now(),
      data: { scores }
    };

    this.webrtcService.sendGameMessage(message);
  }

  ngOnDestroy(): void {
    this.stopAudio();
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  initializeScores(): void {
    const scoresMap = new Map<string, PlayerScore>();

    // Initialize scores for all players
    this.players().forEach(player => {
      scoresMap.set(player.id, {
        playerId: player.id,
        totalScore: 0,
        correctAnswers: 0,
        currentStreak: 0,
        maxStreak: 0,
        roundScores: []
      });
    });

    this.scores.set(scoresMap);
  }

  async startRound(roundIndex: number): Promise<void> {
    const questions = this.questions();
    if (roundIndex >= questions.length) {
      // Game over
      this.endGame();
      return;
    }

    const question = questions[roundIndex];
    const settings = this.settings();

    // Host broadcasts round start to all guests
    if (this.isHost()) {
      const roundStartMessage: GameMessage<RoundStartData> = {
        type: 'round-start',
        from: 'host',
        timestamp: Date.now(),
        data: {
          round: roundIndex,
          question: {
            id: question.id,
            type: question.type,
            question: question.question,
            imageUrl: question.imageUrl
          },
          timeLimit: settings?.timeLimit || 0
        }
      };

      this.webrtcService.sendGameMessage(roundStartMessage);
    }

    // Set local state for both host and guest
    this.currentRound.set(roundIndex);
    this.currentQuestion.set(question);
    this.playerAnswer.set('');
    this.hasSubmitted.set(false);
    this.isCorrect.set(null);
    this.answerSubmittedAt.set(null);
    this.roundStartTime = Date.now();

    // Reset answer processing state for new round (host only)
    if (this.isHost()) {
      this.pendingAnswers.clear();
    }

    // Set timer
    if (settings && settings.timeLimit > 0) {
      this.timeRemaining.set(settings.timeLimit);
      this.startTimer();
    }

    // Play audio
    await this.playAudio(question);
  }

  async playAudio(question: QuizQuestion): Promise<void> {
    const settings = this.settings();
    if (!settings) return;

    // Check if audio should only play on host
    if (settings.audioPlayback === 'host-only' && !this.isHost()) {
      console.log('Audio playback is host-only, skipping for guest');
      this.audioError.set(null);
      return;
    }

    this.audioError.set(null);

    try {
      if (settings.useAuthentication && this.spotifyService.isPlayerReady()) {
        // Premium mode - use Spotify Web Playback SDK
        if (question.trackUri) {
          await this.spotifyService.playTrack(question.trackUri);
          this.isPlaying.set(true);
        } else {
          this.audioError.set('No track URI available');
        }
      } else {
        // Free mode - use preview URL with HTML5 audio
        if (question.previewUrl) {
          this.stopAudio(); // Stop any existing audio
          this.audioElement = new Audio(question.previewUrl);
          this.audioElement.volume = 1.0;

          let hasPlayedSuccessfully = false;

          this.audioElement.addEventListener('play', () => {
            this.isPlaying.set(true);
            hasPlayedSuccessfully = true;
            // Clear any error when audio successfully starts playing
            this.audioError.set(null);
            console.log('Audio started playing successfully');
          });

          this.audioElement.addEventListener('playing', () => {
            hasPlayedSuccessfully = true;
            this.audioError.set(null);
          });

          this.audioElement.addEventListener('pause', () => this.isPlaying.set(false));
          this.audioElement.addEventListener('ended', () => this.isPlaying.set(false));
          this.audioElement.addEventListener('error', (e) => {
            console.error('Audio element error event:', e);
            this.isPlaying.set(false);
            // Only show error if audio never successfully started
            if (!hasPlayedSuccessfully) {
              setTimeout(() => {
                if (!hasPlayedSuccessfully) {
                  this.audioError.set('Failed to play audio');
                }
              }, 500);
            }
          });

          // Clear error when audio can play
          this.audioElement.addEventListener('canplay', () => {
            console.log('Audio can play');
            this.audioError.set(null);
          });

          try {
            await this.audioElement.play();
            console.log('Audio play() promise resolved');
          } catch (playError: any) {
            // Handle autoplay policy - don't show error if it's just an autoplay restriction
            if (playError.name === 'NotAllowedError' || playError.name === 'NotSupportedError') {
              console.log('Autoplay prevented, audio will play after user interaction');
              // Don't set error for autoplay policy - the audio will likely play after interaction
            } else {
              console.error('Audio play error (non-autoplay):', playError);
              // Only set error if audio never played
              if (!hasPlayedSuccessfully) {
                throw playError; // Re-throw other errors to be caught by outer catch
              }
            }
          }
        } else {
          this.audioError.set('No preview URL available for this track');
        }
      }
    } catch (err: any) {
      // Only set error for real failures, not autoplay policy issues
      console.error('Error playing audio (outer catch):', err);
      if (err.name !== 'NotAllowedError' && err.name !== 'NotSupportedError') {
        this.audioError.set(err.message || 'Failed to play audio');
      }
    }
  }

  stopAudio(): void {
    const settings = this.settings();
    if (settings?.useAuthentication && this.spotifyService.isPlayerReady()) {
      this.spotifyService.pause();
    } else if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
      this.audioElement = null;
    }
    this.isPlaying.set(false);
  }

  toggleAudio(): void {
    if (this.isPlaying()) {
      this.pauseAudio();
    } else {
      this.resumeAudio();
    }
  }

  pauseAudio(): void {
    const settings = this.settings();
    if (settings?.useAuthentication && this.spotifyService.isPlayerReady()) {
      this.spotifyService.pause();
    } else if (this.audioElement) {
      this.audioElement.pause();
    }
  }

  resumeAudio(): void {
    const settings = this.settings();
    if (settings?.useAuthentication && this.spotifyService.isPlayerReady()) {
      this.spotifyService.resume();
    } else if (this.audioElement) {
      this.audioElement.play();
    }
  }

  startTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    this.timerInterval = setInterval(() => {
      const remaining = this.timeRemaining();
      if (remaining > 0) {
        this.timeRemaining.set(remaining - 1);
      } else {
        // Time's up - auto submit
        if (!this.hasSubmitted()) {
          this.submitAnswer();
        }
      }
    }, 1000);
  }

  submitAnswer(): void {
    if (this.hasSubmitted()) return;

    this.hasSubmitted.set(true);
    this.answerSubmittedAt.set(Date.now());

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    const answer = this.playerAnswer().trim();
    const player = this.currentPlayer();

    if (this.isHost()) {
      // Host processes their own answer locally
      // Will be validated along with guest answers in processAllAnswers()
      if (this.players().length === 1) {
        // Single player mode - process immediately
        const question = this.currentQuestion();
        const isCorrect = this.validateAnswer(answer, question?.correctAnswer || '');
        this.isCorrect.set(isCorrect);
        this.calculateScore(isCorrect);

        // In single player mode, don't use roundResults - let template use isCorrect signal
        // This shows the single player result view (lines 192-216 in template)

        setTimeout(() => {
          this.stopAudio();
          this.isCorrect.set(null); // Reset for next round
          this.startRound(this.currentRound() + 1);
        }, 3000);
      } else {
        // Multiplayer - wait for all answers
        this.checkAllAnswersSubmitted();
      }
    } else {
      // Guest sends answer to host
      const answerMessage: GameMessage<AnswerSubmittedData> = {
        type: 'answer-submitted',
        from: player?.id || 'guest',
        timestamp: Date.now(),
        data: {
          playerId: player?.id || 'guest',
          answer: answer,
          submittedAt: this.answerSubmittedAt()!
        }
      };

      this.webrtcService.sendGameMessage(answerMessage);

      // Guest shows waiting for other players state
      this.waitingForPlayers.set(true);
    }
  }

  validateAnswer(userAnswer: string, correctAnswer: string): boolean {
    const settings = this.settings();
    if (!settings) return false;

    // Empty answers are always wrong
    if (!userAnswer || userAnswer.trim() === '') {
      return false;
    }

    switch (settings.answerMode) {
      case 'exact':
        return userAnswer.toLowerCase() === correctAnswer.toLowerCase();

      case 'fuzzy':
        // Simple fuzzy matching - remove "the", trim, lowercase
        const normalizeAnswer = (str: string) =>
          str.toLowerCase()
            .replace(/^the\s+/i, '')
            .replace(/[^\w\s]/g, '')
            .trim();

        const normalized1 = normalizeAnswer(userAnswer);
        const normalized2 = normalizeAnswer(correctAnswer);

        // Both must be non-empty after normalization
        if (!normalized1 || !normalized2) {
          return false;
        }

        // Check if one contains the other (for partial matches)
        return normalized1.includes(normalized2) || normalized2.includes(normalized1);

      case 'multiple-choice':
        // For multiple choice, answer should match exactly
        return userAnswer === correctAnswer;

      default:
        return false;
    }
  }

  calculateScoreForPlayer(playerId: string, isCorrect: boolean, submittedAt: number): number {
    const scores = this.scores();
    const playerScore = scores.get(playerId);
    if (!playerScore) return 0;

    const question = this.currentQuestion();
    const settings = this.settings();
    if (!question || !settings) return 0;

    const timeToAnswer = submittedAt - this.roundStartTime;
    let totalPoints = 0;

    if (isCorrect) {
      // Base points
      const basePoints = 100;

      // Speed bonus (if time limit enabled)
      let speedBonus = 0;
      if (settings.timeLimit > 0) {
        const timeRemaining = this.timeRemaining();
        speedBonus = Math.round((timeRemaining / settings.timeLimit) * 100);
      }

      // Streak multiplier
      const currentStreak = playerScore.currentStreak + 1;
      const streakMultiplier = Math.min(1 + (currentStreak - 1) * 0.5, 3.0);

      // Difficulty multiplier
      const difficultyMultiplier = question.difficulty;

      // Calculate total
      const subtotal = basePoints + speedBonus;
      const withStreak = subtotal * streakMultiplier;
      totalPoints = Math.round(withStreak * difficultyMultiplier);

      // Update score
      const roundScore: RoundScore = {
        round: this.currentRound() + 1,
        answer: this.playerAnswer(),
        correct: true,
        basePoints,
        speedBonus,
        streakMultiplier,
        difficultyMultiplier,
        totalPoints,
        timeToAnswer
      };

      playerScore.totalScore += totalPoints;
      playerScore.correctAnswers += 1;
      playerScore.currentStreak = currentStreak;
      playerScore.maxStreak = Math.max(playerScore.maxStreak, currentStreak);
      playerScore.roundScores.push(roundScore);
    } else {
      // Wrong answer - reset streak
      const roundScore: RoundScore = {
        round: this.currentRound() + 1,
        answer: this.playerAnswer(),
        correct: false,
        basePoints: 0,
        speedBonus: 0,
        streakMultiplier: 1,
        difficultyMultiplier: 1,
        totalPoints: 0,
        timeToAnswer
      };

      playerScore.currentStreak = 0;
      playerScore.roundScores.push(roundScore);
    }

    // Update scores map
    scores.set(playerId, playerScore);
    this.scores.set(new Map(scores));

    return isCorrect ? totalPoints : 0;
  }

  calculateScore(isCorrect: boolean): void {
    const player = this.currentPlayer();
    if (!player) return;

    this.calculateScoreForPlayer(player.id, isCorrect, this.answerSubmittedAt()!);
  }

  endGame(): void {
    this.stopAudio();

    // Get final scores
    const scores = this.scores();
    const scoresArray = Array.from(scores.values());

    // If host, broadcast game-end to all guests
    if (this.isHost()) {
      const gameEndMessage: GameMessage = {
        type: 'game-end',
        from: 'host',
        timestamp: Date.now(),
        data: {
          finalScores: scoresArray
        }
      };

      this.webrtcService.sendGameMessage(gameEndMessage);
    }

    // Store final scores in session storage
    sessionStorage.setItem('gameScores', JSON.stringify(scoresArray));

    // Navigate to results
    this.router.navigate(['/results']);
  }

  quit(): void {
    this.stopAudio();
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    sessionStorage.removeItem('gameSettings');
    sessionStorage.removeItem('gameQuestions');
    sessionStorage.removeItem('gameScores');
    this.router.navigate(['/']);
  }

  // Get current player score
  get currentScore(): number {
    const playerId = this.currentPlayer()?.id;
    if (!playerId) return 0;
    return this.scores().get(playerId)?.totalScore || 0;
  }

  // Get current streak
  get currentStreak(): number {
    const playerId = this.currentPlayer()?.id;
    if (!playerId) return 0;
    return this.scores().get(playerId)?.currentStreak || 0;
  }

  // Get progress percentage
  get progressPercentage(): number {
    const total = this.questions().length;
    const current = this.currentRound();
    return total > 0 ? (current / total) * 100 : 0;
  }
}
