import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { WebRTCSimpleService } from '../../services/webrtc-simple.service';

@Component({
  selector: 'app-host-simple',
  standalone: true,
  imports: [],
  templateUrl: './host-simple.component.html',
  styleUrl: './host-simple.component.scss'
})
export class HostSimpleComponent implements OnInit, OnDestroy {
  private webrtcService = inject(WebRTCSimpleService);
  private router = inject(Router);

  roomCode = this.webrtcService.roomCode;
  playerCount = this.webrtcService.playerCount;
  status = this.webrtcService.status;
  messages = this.webrtcService.messages;

  testMessage = signal('');
  loading = signal(true);
  error = signal<string | null>(null);
  copied = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      await this.webrtcService.hostGame();
      this.loading.set(false);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to create game');
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.webrtcService.disconnect();
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

  sendTestMessage(): void {
    const message = this.testMessage();
    if (message.trim()) {
      this.webrtcService.sendMessage(message);
      this.testMessage.set('');
    }
  }

  goBack(): void {
    this.webrtcService.disconnect();
    this.router.navigate(['/']);
  }
}
