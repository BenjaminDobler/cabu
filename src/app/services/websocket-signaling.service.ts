import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

export interface SignalingMessage {
  type: string;
  roomCode?: string;
  sdp?: string;
  candidate?: RTCIceCandidate;
  from?: string;
  playerCount?: number;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class WebSocketSignalingService {
  private ws: WebSocket | null = null;
  private serverUrl = 'ws://localhost:8080'; // Will be configurable

  // Signals
  private connected = signal(false);
  private currentRoomCode = signal<string | null>(null);
  private playerCount = signal(0);
  private connectionError = signal<string | null>(null);

  // Public readonly signals
  public readonly isConnected = this.connected.asReadonly();
  public readonly roomCode = this.currentRoomCode.asReadonly();
  public readonly players = this.playerCount.asReadonly();
  public readonly error = this.connectionError.asReadonly();

  // Observable for signaling messages
  public messages$ = new Subject<SignalingMessage>();

  constructor() {
    // Set server URL from environment or default
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;

      // For local development
      if (host === 'localhost' || host === '127.0.0.1') {
        this.serverUrl = 'ws://localhost:8080';
      } else {
        // For production, you'll need to set your deployed server URL
        // For now, using environment variable or falling back to same host
        this.serverUrl = `${protocol}//${host}:8080`;
      }
    }
  }

  /**
   * Connect to the signaling server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      try {
        this.ws = new WebSocket(this.serverUrl);

        this.ws.onopen = () => {
          console.log('Connected to signaling server');
          this.connected.set(true);
          this.connectionError.set(null);
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: SignalingMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.connectionError.set('Connection error');
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('Disconnected from signaling server');
          this.connected.set(false);
          this.currentRoomCode.set(null);
        };
      } catch (error) {
        console.error('Failed to connect:', error);
        this.connectionError.set('Failed to connect to server');
        reject(error);
      }
    });
  }

  /**
   * Create a new room
   */
  async createRoom(): Promise<string> {
    await this.ensureConnected();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Room creation timeout'));
      }, 5000);

      const messageHandler = (msg: SignalingMessage) => {
        if (msg.type === 'room-created') {
          clearTimeout(timeout);
          this.currentRoomCode.set(msg.roomCode!);
          this.playerCount.set(1);
          resolve(msg.roomCode!);
          subscription.unsubscribe();
        }
      };

      const subscription = this.messages$.subscribe(messageHandler);

      this.send({ type: 'create-room' });
    });
  }

  /**
   * Join an existing room
   */
  async joinRoom(roomCode: string): Promise<void> {
    await this.ensureConnected();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Join room timeout'));
      }, 5000);

      const messageHandler = (msg: SignalingMessage) => {
        if (msg.type === 'room-joined') {
          clearTimeout(timeout);
          this.currentRoomCode.set(roomCode);
          this.playerCount.set(msg.playerCount || 1);
          resolve();
          subscription.unsubscribe();
        } else if (msg.type === 'error') {
          clearTimeout(timeout);
          reject(new Error(msg.message || 'Failed to join room'));
          subscription.unsubscribe();
        }
      };

      const subscription = this.messages$.subscribe(messageHandler);

      this.send({ type: 'join-room', roomCode });
    });
  }

  /**
   * Send WebRTC offer
   */
  sendOffer(sdp: string): void {
    this.send({
      type: 'offer',
      roomCode: this.currentRoomCode(),
      sdp
    });
  }

  /**
   * Send WebRTC answer
   */
  sendAnswer(sdp: string): void {
    this.send({
      type: 'answer',
      roomCode: this.currentRoomCode(),
      sdp
    });
  }

  /**
   * Send ICE candidate
   */
  sendIceCandidate(candidate: RTCIceCandidate): void {
    this.send({
      type: 'ice-candidate',
      roomCode: this.currentRoomCode(),
      candidate
    });
  }

  /**
   * Leave current room
   */
  leaveRoom(): void {
    if (this.currentRoomCode()) {
      this.send({ type: 'leave-room' });
      this.currentRoomCode.set(null);
      this.playerCount.set(0);
    }
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    if (this.ws) {
      this.leaveRoom();
      this.ws.close();
      this.ws = null;
      this.connected.set(false);
    }
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: SignalingMessage): void {
    console.log('Received message:', message.type);

    switch (message.type) {
      case 'player-joined':
      case 'player-left':
        this.playerCount.set(message.playerCount || 0);
        break;

      case 'error':
        this.connectionError.set(message.message || 'Unknown error');
        break;
    }

    // Emit to subscribers
    this.messages$.next(message);
  }

  /**
   * Send message to server
   */
  private send(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('WebSocket not connected');
      this.connectionError.set('Not connected to server');
    }
  }

  /**
   * Ensure WebSocket is connected
   */
  private async ensureConnected(): Promise<void> {
    if (!this.connected()) {
      await this.connect();
    }
  }
}
