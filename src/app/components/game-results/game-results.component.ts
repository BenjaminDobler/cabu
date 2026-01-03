import { Component, signal, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { PlayerScore, GameSettings } from '../../models/game.model';
import { WebRTCSimpleService } from '../../services/webrtc-simple.service';

interface PlayerScoreWithName extends PlayerScore {
  playerName: string;
}

@Component({
  selector: 'app-game-results',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './game-results.component.html',
  styleUrl: './game-results.component.scss'
})
export class GameResultsComponent implements OnInit {
  private router = inject(Router);
  private webrtcService = inject(WebRTCSimpleService);

  // Game data
  scores = signal<PlayerScoreWithName[]>([]);
  settings = signal<GameSettings | null>(null);

  // UI state
  loading = signal(true);
  error = signal<string | null>(null);
  showRoundBreakdown = signal(false);
  selectedPlayer = signal<PlayerScoreWithName | null>(null);

  ngOnInit(): void {
    // Load scores from session storage
    const scoresJson = sessionStorage.getItem('gameScores');
    const settingsJson = sessionStorage.getItem('gameSettings');

    if (!scoresJson) {
      this.error.set('No game results found.');
      this.loading.set(false);
      setTimeout(() => this.router.navigate(['/']), 2000);
      return;
    }

    try {
      const scores: PlayerScore[] = JSON.parse(scoresJson);

      // Get player names from WebRTC service
      const players = this.webrtcService.players();
      const playerMap = new Map(players.map(p => [p.id, p.name]));

      // Add player names to scores and sort by total score
      const scoresWithNames: PlayerScoreWithName[] = scores
        .map(score => ({
          ...score,
          playerName: playerMap.get(score.playerId) || score.playerId
        }))
        .sort((a, b) => b.totalScore - a.totalScore);

      this.scores.set(scoresWithNames);

      // Select the first player (winner) by default
      if (scoresWithNames.length > 0) {
        this.selectedPlayer.set(scoresWithNames[0]);
      }

      if (settingsJson) {
        this.settings.set(JSON.parse(settingsJson));
      }

      this.loading.set(false);
    } catch (err) {
      this.error.set('Failed to load results');
      this.loading.set(false);
    }
  }

  // Select a player to view detailed stats
  selectPlayer(player: PlayerScoreWithName): void {
    this.selectedPlayer.set(player);
    this.showRoundBreakdown.set(false);
  }

  // Get player rank
  getPlayerRank(playerId: string): number {
    const scores = this.scores();
    return scores.findIndex(s => s.playerId === playerId) + 1;
  }

  // Get medal emoji based on rank
  getRankEmoji(rank: number): string {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `${rank}.`;
  }

  // Get winner (highest score)
  get winner(): PlayerScoreWithName | null {
    const scores = this.scores();
    if (scores.length === 0) return null;
    return scores[0]; // Already sorted by score
  }

  // Get accuracy percentage
  getAccuracy(player: PlayerScoreWithName): number {
    if (player.roundScores.length === 0) return 0;
    return Math.round((player.correctAnswers / player.roundScores.length) * 100);
  }

  // Get average answer time in seconds
  getAverageTime(player: PlayerScoreWithName): string {
    if (player.roundScores.length === 0) return '0.0';
    const totalTime = player.roundScores.reduce((sum, round) => sum + round.timeToAnswer, 0);
    const avgMs = totalTime / player.roundScores.length;
    return (avgMs / 1000).toFixed(1);
  }

  // Get best round (highest points)
  getBestRound(player: PlayerScoreWithName): { round: number; points: number } {
    if (player.roundScores.length === 0) return { round: 0, points: 0 };

    const best = player.roundScores.reduce((prev, current) =>
      (current.totalPoints > prev.totalPoints) ? current : prev
    );

    return {
      round: best.round,
      points: best.totalPoints
    };
  }

  // Toggle round breakdown view
  toggleBreakdown(): void {
    this.showRoundBreakdown.set(!this.showRoundBreakdown());
  }

  // Play again with same settings
  playAgain(): void {
    // Keep settings, clear scores, go back to lobby
    sessionStorage.removeItem('gameScores');
    sessionStorage.removeItem('gameQuestions');
    this.router.navigate(['/setup']);
  }

  // New game (clear everything)
  newGame(): void {
    sessionStorage.removeItem('gameSettings');
    sessionStorage.removeItem('gameQuestions');
    sessionStorage.removeItem('gameScores');
    this.router.navigate(['/']);
  }

  // Format time display
  formatTime(ms: number): string {
    return (ms / 1000).toFixed(1) + 's';
  }

  // Get grade based on accuracy
  getGrade(accuracy: number): string {
    if (accuracy >= 90) return 'A+';
    if (accuracy >= 80) return 'A';
    if (accuracy >= 70) return 'B';
    if (accuracy >= 60) return 'C';
    if (accuracy >= 50) return 'D';
    return 'F';
  }

  // Get grade color
  getGradeColor(accuracy: number): string {
    if (accuracy >= 80) return '#4caf50';
    if (accuracy >= 60) return '#ff9800';
    return '#f44336';
  }
}
