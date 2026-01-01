import { Component, signal, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { WebRTCService } from '../../services/webrtc.service';
import { SignalingService } from '../../services/signaling.service';
import { SignalingData } from '../../models/connection.model';
import { ConnectionDisplayComponent } from '../connection-display/connection-display.component';
import { QrScannerComponent } from '../qr-scanner/qr-scanner.component';

@Component({
  selector: 'app-host',
  standalone: true,
  imports: [ConnectionDisplayComponent, QrScannerComponent, DatePipe],
  templateUrl: './host.component.html',
  styleUrl: './host.component.scss'
})
export class HostComponent implements OnInit {
  private webrtcService = inject(WebRTCService);
  private signalingService = inject(SignalingService);
  private router = inject(Router);

  slots = this.webrtcService.connectionSlots;
  messages = this.webrtcService.messages;
  connectedCount = this.webrtcService.connectionCount;

  slotOffers = signal<(SignalingData | null)[]>([null, null, null]);
  scanningSlotIndex = signal<number | null>(null);
  testMessage = signal('');

  async ngOnInit(): Promise<void> {
    this.webrtcService.createHost();

    // Create offers for all slots
    for (let i = 0; i < 3; i++) {
      await this.createOfferForSlot(i);
    }
  }

  private async createOfferForSlot(slotIndex: number): Promise<void> {
    try {
      const offer = await this.webrtcService.createOffer(slotIndex);
      this.slotOffers.update(offers => {
        const newOffers = [...offers];
        newOffers[slotIndex] = offer;
        return newOffers;
      });
    } catch (error) {
      console.error(`Failed to create offer for slot ${slotIndex}:`, error);
    }
  }

  startScanningForSlot(slotIndex: number): void {
    this.scanningSlotIndex.set(slotIndex);
  }

  stopScanning(): void {
    this.scanningSlotIndex.set(null);
  }

  async onAnswerScanned(answer: string): Promise<void> {
    const slotIndex = this.scanningSlotIndex();
    if (slotIndex === null) {
      return;
    }

    try {
      const answerData = this.signalingService.decodeSignalingData(answer);
      if (!answerData) {
        console.error('Invalid answer data');
        return;
      }

      await this.webrtcService.receiveAnswer(slotIndex, answerData);
      this.scanningSlotIndex.set(null);
    } catch (error) {
      console.error('Failed to process answer:', error);
    }
  }

  async pasteAnswer(slotIndex: number, event: Event): Promise<void> {
    const textarea = event.target as HTMLTextAreaElement;
    const pastedData = textarea.value.trim();

    if (!pastedData) {
      return;
    }

    try {
      const answerData = this.signalingService.decodeSignalingData(pastedData);
      if (!answerData) {
        console.error('Invalid answer data');
        return;
      }

      await this.webrtcService.receiveAnswer(slotIndex, answerData);
      textarea.value = '';
    } catch (error) {
      console.error('Failed to process pasted answer:', error);
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

  getSlotStatus(index: number): string {
    const slot = this.slots()[index];
    if (!slot) return 'unknown';

    switch (slot.status) {
      case 'waiting':
        return 'Waiting for guest';
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return 'Connected';
      case 'failed':
        return 'Connection failed';
      default:
        return 'Unknown';
    }
  }
}
