import { Component, signal, inject, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { WebRTCSimpleService } from '../../services/webrtc-simple.service';

@Component({
  selector: 'app-join-simple',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './join-simple.component.html',
  styleUrl: './join-simple.component.scss'
})
export class JoinSimpleComponent implements OnDestroy {
  private webrtcService = inject(WebRTCSimpleService);
  private router = inject(Router);

  roomCode = signal('');
  joining = signal(false);
  error = signal<string | null>(null);

  status = this.webrtcService.status;
  messages = this.webrtcService.messages;
  testMessage = signal('');

  ngOnDestroy(): void {
    this.webrtcService.disconnect();
  }

  async joinGame(): Promise<void> {
    const code = this.roomCode().trim().toUpperCase();
    if (!code) {
      this.error.set('Please enter a room code');
      return;
    }

    this.joining.set(true);
    this.error.set(null);

    try {
      await this.webrtcService.joinGame(code, 'Test Guest');
      this.joining.set(false);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to join game');
      this.joining.set(false);
    }
  }

  sendTestMessage(): void {
    const message = this.testMessage();
    if (message.trim()) {
      // Use the new game message format
      const gameMessage = {
        type: 'player-joined' as const,
        from: 'test-guest',
        timestamp: Date.now(),
        data: { message: message }
      };
      this.webrtcService.sendGameMessage(gameMessage);
      this.testMessage.set('');
    }
  }

  goBack(): void {
    this.webrtcService.disconnect();
    this.router.navigate(['/']);
  }
}
