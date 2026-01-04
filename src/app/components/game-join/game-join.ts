import { Component, signal, inject, OnDestroy, effect } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WebRTCSimpleService } from '../../services/webrtc-simple.service';
import { GameMessage } from '../../models/connection.model';

@Component({
  selector: 'app-game-join',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './game-join.html',
  styleUrl: './game-join.scss'
})
export class GameJoinComponent implements OnDestroy {
  private router = inject(Router);
  webrtcService = inject(WebRTCSimpleService);

  // UI state
  step = signal<'enter-code' | 'enter-name' | 'waiting'>('enter-code');
  roomCode = signal('');
  playerName = signal('');
  loading = signal(false);
  error = signal<string | null>(null);

  // WebRTC state
  status = this.webrtcService.status;
  players = this.webrtcService.players;

  // Track processed messages to prevent infinite loops
  private lastProcessedMessageIndex = -1;

  constructor() {
    // Listen for game start from host
    effect(() => {
      const messages = this.webrtcService.messages();

      // Initialize index on first run
      // For game-join, always process all messages to receive game-start
      if (this.lastProcessedMessageIndex === -1 && messages.length > 0) {
        console.log(`Game-join: Processing all messages from start`);
        // Don't return - fall through to process messages
      }

      // Process only new messages we haven't seen yet
      for (let i = this.lastProcessedMessageIndex + 1; i < messages.length; i++) {
        this.handleGameMessage(messages[i]);
        this.lastProcessedMessageIndex = i;
      }
    });
  }

  ngOnDestroy(): void {
    // Only disconnect if we haven't successfully joined
    if (this.step() !== 'waiting') {
      this.webrtcService.disconnect();
    }
  }

  private handleGameMessage(message: GameMessage): void {
    if (message.type === 'game-start') {
      // Receive game data from host
      const { settings, questions } = message.data;
      console.log('Received game data from host:', settings, questions);

      // Store in session storage
      sessionStorage.setItem('gameSettings', JSON.stringify(settings));
      sessionStorage.setItem('gameQuestions', JSON.stringify(questions));
    } else if (message.type === 'round-start') {
      // Host has started the game - navigate to game play
      console.log('Game starting, navigating to game play...');
      this.router.navigate(['/game']);
    }
  }

  submitRoomCode(): void {
    const code = this.roomCode().trim().toUpperCase();
    if (!code) {
      this.error.set('Please enter a room code');
      return;
    }

    if (code.length !== 6) {
      this.error.set('Room code must be 6 characters');
      return;
    }

    this.error.set(null);
    this.step.set('enter-name');
  }

  async submitName(): Promise<void> {
    const name = this.playerName().trim();
    if (!name) {
      this.error.set('Please enter your name');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      // Save name to session storage
      sessionStorage.setItem('playerName', name);

      // Join the game
      await this.webrtcService.joinGame(this.roomCode(), name);

      // Load game settings and questions from session storage (if host shared them)
      // For now, we'll wait for the host to start the game
      this.step.set('waiting');
      this.loading.set(false);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to join game');
      this.loading.set(false);
      this.step.set('enter-code');
    }
  }

  goBack(): void {
    if (this.step() === 'enter-name') {
      this.step.set('enter-code');
      this.error.set(null);
    } else {
      this.webrtcService.disconnect();
      this.router.navigate(['/']);
    }
  }

  cancel(): void {
    this.webrtcService.disconnect();
    this.router.navigate(['/']);
  }
}
