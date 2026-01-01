import { Component, ElementRef, ViewChild, output, effect, inject } from '@angular/core';
import { CameraService } from '../../services/camera.service';

@Component({
  selector: 'app-qr-scanner',
  standalone: true,
  imports: [],
  templateUrl: './qr-scanner.component.html',
  styleUrl: './qr-scanner.component.scss'
})
export class QrScannerComponent {
  @ViewChild('video', { static: false }) videoElement!: ElementRef<HTMLVideoElement>;

  cameraService = inject(CameraService);
  scanned = output<string>();

  scanning = this.cameraService.scanning;
  cameraPermission = this.cameraService.cameraPermission;
  scanError = this.cameraService.scanError;

  constructor() {
    // Watch for scanned data
    effect(() => {
      const data = this.cameraService.scannedData();
      if (data) {
        this.scanned.emit(data);
        this.cameraService.clearScannedData();
      }
    });
  }

  async startScanning(): Promise<void> {
    if (!this.videoElement) {
      console.error('Video element not found');
      return;
    }

    try {
      await this.cameraService.startScanning(this.videoElement.nativeElement);
    } catch (error) {
      console.error('Failed to start scanning:', error);
    }
  }

  stopScanning(): void {
    this.cameraService.stopScanning();
  }

  async requestPermission(): Promise<void> {
    await this.cameraService.requestPermission();
  }
}
