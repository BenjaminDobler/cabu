import { Component, input, signal } from '@angular/core';
import { SignalingService } from '../../services/signaling.service';
import { SignalingData } from '../../models/connection.model';

@Component({
  selector: 'app-connection-display',
  standalone: true,
  imports: [],
  templateUrl: './connection-display.component.html',
  styleUrl: './connection-display.component.scss'
})
export class ConnectionDisplayComponent {
  data = input.required<SignalingData>();

  qrCodeUrl = signal<string>('');
  shareableUrl = signal<string>('');
  encodedData = signal<string>('');
  copiedField = signal<string | null>(null);

  constructor(private signalingService: SignalingService) {}

  async ngOnInit(): Promise<void> {
    const data = this.data();

    // Generate QR code
    try {
      const qrUrl = await this.signalingService.generateQRCode(data);
      this.qrCodeUrl.set(qrUrl);
    } catch (error) {
      console.error('Failed to generate QR code:', error);
    }

    // Generate shareable URL
    const url = this.signalingService.generateShareableURL(data);
    this.shareableUrl.set(url);

    // Encode data for manual copy
    const encoded = this.signalingService.encodeSignalingData(data);
    this.encodedData.set(encoded);
  }

  async copyUrl(): Promise<void> {
    const success = await this.signalingService.copyToClipboard(this.shareableUrl());
    if (success) {
      this.showCopied('url');
    }
  }

  async copyData(): Promise<void> {
    const success = await this.signalingService.copyToClipboard(this.encodedData());
    if (success) {
      this.showCopied('data');
    }
  }

  private showCopied(field: string): void {
    this.copiedField.set(field);
    setTimeout(() => {
      this.copiedField.set(null);
    }, 2000);
  }
}
