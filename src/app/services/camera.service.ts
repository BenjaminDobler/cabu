import { Injectable, signal } from '@angular/core';
import { BrowserMultiFormatReader } from '@zxing/browser';

@Injectable({
  providedIn: 'root'
})
export class CameraService {
  private codeReader: BrowserMultiFormatReader | null = null;
  private isScanning = signal(false);
  private hasPermission = signal<boolean | null>(null);
  private lastScannedData = signal<string | null>(null);
  private error = signal<string | null>(null);

  // Public signals
  public readonly scanning = this.isScanning.asReadonly();
  public readonly cameraPermission = this.hasPermission.asReadonly();
  public readonly scannedData = this.lastScannedData.asReadonly();
  public readonly scanError = this.error.asReadonly();

  constructor() {
    this.checkCameraAvailability();
  }

  /**
   * Check if camera is available
   */
  private async checkCameraAvailability(): Promise<void> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.hasPermission.set(false);
      this.error.set('Camera API not supported in this browser');
      return;
    }

    // Check if running on HTTPS (required for camera access)
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      this.hasPermission.set(false);
      this.error.set('Camera access requires HTTPS');
      return;
    }
  }

  /**
   * Start scanning for QR codes
   */
  async startScanning(videoElement: HTMLVideoElement): Promise<void> {
    if (this.isScanning()) {
      console.warn('Already scanning');
      return;
    }

    try {
      this.error.set(null);
      this.codeReader = new BrowserMultiFormatReader();

      // Request camera permission and start scanning
      await this.codeReader.decodeFromVideoDevice(
        undefined, // Use default camera
        videoElement,
        (result, error) => {
          if (result) {
            this.lastScannedData.set(result.getText());
            this.isScanning.set(true);
          }

          if (error) {
            // Errors are normal when no QR code is in view
            // Only log if it's an unexpected error
          }
        }
      );

      this.hasPermission.set(true);
      this.isScanning.set(true);
    } catch (error: any) {
      console.error('Failed to start scanning:', error);
      this.hasPermission.set(false);
      this.isScanning.set(false);

      if (error.name === 'NotAllowedError') {
        this.error.set('Camera permission denied');
      } else if (error.name === 'NotFoundError') {
        this.error.set('No camera found');
      } else {
        this.error.set('Failed to access camera: ' + error.message);
      }

      throw error;
    }
  }

  /**
   * Stop scanning
   */
  stopScanning(): void {
    if (this.codeReader) {
      // Stop all video streams
      const videoTracks = document.querySelectorAll('video');
      videoTracks.forEach(video => {
        const stream = (video as HTMLVideoElement).srcObject as MediaStream;
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
      });
      this.codeReader = null;
    }
    this.isScanning.set(false);
  }

  /**
   * Clear last scanned data
   */
  clearScannedData(): void {
    this.lastScannedData.set(null);
  }

  /**
   * Request camera permission
   */
  async requestPermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // Stop the stream immediately - we just wanted to request permission
      stream.getTracks().forEach(track => track.stop());
      this.hasPermission.set(true);
      return true;
    } catch (error: any) {
      console.error('Permission request failed:', error);
      this.hasPermission.set(false);

      if (error.name === 'NotAllowedError') {
        this.error.set('Camera permission denied');
      } else if (error.name === 'NotFoundError') {
        this.error.set('No camera found');
      } else {
        this.error.set('Failed to request camera permission');
      }

      return false;
    }
  }
}
