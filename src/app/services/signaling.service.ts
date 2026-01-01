import { Injectable } from '@angular/core';
import QRCode from 'qrcode';
import * as LZString from 'lz-string';
import { SignalingData } from '../models/connection.model';

@Injectable({
  providedIn: 'root'
})
export class SignalingService {

  constructor() {}

  /**
   * Encode signaling data to compressed string
   */
  encodeSignalingData(data: SignalingData): string {
    const jsonString = JSON.stringify(data);
    return LZString.compressToEncodedURIComponent(jsonString);
  }

  /**
   * Decode compressed string back to signaling data
   */
  decodeSignalingData(encoded: string): SignalingData | null {
    try {
      const decompressed = LZString.decompressFromEncodedURIComponent(encoded);
      if (!decompressed) {
        return null;
      }
      return JSON.parse(decompressed) as SignalingData;
    } catch (error) {
      console.error('Error decoding signaling data:', error);
      return null;
    }
  }

  /**
   * Generate QR code as data URL from signaling data
   */
  async generateQRCode(data: SignalingData): Promise<string> {
    try {
      const encoded = this.encodeSignalingData(data);
      const qrCodeDataUrl = await QRCode.toDataURL(encoded, {
        errorCorrectionLevel: 'M',
        width: 300,
        margin: 2
      });
      return qrCodeDataUrl;
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw error;
    }
  }

  /**
   * Generate shareable URL with hash fragment
   */
  generateShareableURL(data: SignalingData, baseURL?: string): string {
    const encoded = this.encodeSignalingData(data);
    const base = baseURL || window.location.origin + window.location.pathname;
    return `${base}#${encoded}`;
  }

  /**
   * Parse signaling data from current URL hash
   */
  parseURLHash(): SignalingData | null {
    const hash = window.location.hash;
    if (!hash || hash.length <= 1) {
      return null;
    }

    // Remove the # symbol
    const encoded = hash.substring(1);
    return this.decodeSignalingData(encoded);
  }

  /**
   * Clear URL hash
   */
  clearURLHash(): void {
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname);
    }
  }

  /**
   * Copy text to clipboard
   */
  async copyToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Fallback for older browsers
      return this.fallbackCopyToClipboard(text);
    }
  }

  /**
   * Fallback clipboard copy for older browsers
   */
  private fallbackCopyToClipboard(text: string): boolean {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();

    try {
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (error) {
      console.error('Fallback copy failed:', error);
      document.body.removeChild(textArea);
      return false;
    }
  }
}
