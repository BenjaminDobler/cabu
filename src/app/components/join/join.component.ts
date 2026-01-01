import { Component, signal, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { WebRTCService } from '../../services/webrtc.service';
import { SignalingService } from '../../services/signaling.service';
import { SignalingData } from '../../models/connection.model';
import { ConnectionDisplayComponent } from '../connection-display/connection-display.component';
import { QrScannerComponent } from '../qr-scanner/qr-scanner.component';

type JoinMethod = 'scan' | 'url' | 'paste';

@Component({
  selector: 'app-join',
  standalone: true,
  imports: [ConnectionDisplayComponent, QrScannerComponent, DatePipe],
  templateUrl: './join.component.html',
  styleUrl: './join.component.scss'
})
export class JoinComponent implements OnInit {
  private webrtcService = inject(WebRTCService);
  private signalingService = inject(SignalingService);
  private router = inject(Router);

  activeMethod = signal<JoinMethod>('url');
  connectionStatus = signal<'initial' | 'waiting-for-offer' | 'received-offer' | 'connected'>('initial');
  answerData = signal<SignalingData | null>(null);
  pastedCode = signal('');
  messages = this.webrtcService.messages;

  testMessage = signal('');

  ngOnInit(): void {
    this.webrtcService.createGuest();

    // Check if there's a URL hash to auto-join
    const offerFromUrl = this.signalingService.parseURLHash();
    if (offerFromUrl) {
      this.processOffer(offerFromUrl);
      this.signalingService.clearURLHash();
    } else {
      this.connectionStatus.set('waiting-for-offer');
    }
  }

  selectMethod(method: JoinMethod): void {
    this.activeMethod.set(method);
  }

  async onOfferScanned(offer: string): Promise<void> {
    try {
      const offerData = this.signalingService.decodeSignalingData(offer);
      if (!offerData) {
        console.error('Invalid offer data');
        return;
      }

      await this.processOffer(offerData);
    } catch (error) {
      console.error('Failed to process scanned offer:', error);
    }
  }

  async onPasteSubmit(): Promise<void> {
    const code = this.pastedCode().trim();
    if (!code) {
      return;
    }

    try {
      const offerData = this.signalingService.decodeSignalingData(code);
      if (!offerData) {
        console.error('Invalid offer data');
        return;
      }

      await this.processOffer(offerData);
      this.pastedCode.set('');
    } catch (error) {
      console.error('Failed to process pasted offer:', error);
    }
  }

  private async processOffer(offerData: SignalingData): Promise<void> {
    try {
      // Receive the offer
      await this.webrtcService.receiveOffer(offerData);

      // Create and generate answer
      const answer = await this.webrtcService.createAnswer();
      this.answerData.set(answer);

      this.connectionStatus.set('received-offer');

      // Monitor connection status
      const checkConnection = setInterval(() => {
        const slots = this.webrtcService.connectionSlots();
        if (slots[0]?.status === 'connected') {
          this.connectionStatus.set('connected');
          clearInterval(checkConnection);
        }
      }, 500);
    } catch (error) {
      console.error('Failed to process offer:', error);
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
    this.webrtcService.reset();
    this.router.navigate(['/']);
  }
}
