import { Injectable, signal, computed, inject } from '@angular/core';
import { WebSocketSignalingService } from './websocket-signaling.service';
import { GameMessage } from '../models/connection.model';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'failed';

@Injectable({
  providedIn: 'root'
})
export class WebRTCSimpleService {
  private signalingService = inject(WebSocketSignalingService);

  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;

  private connectionStatus = signal<ConnectionStatus>('disconnected');
  private isHost = signal(false);
  private receivedMessages = signal<GameMessage[]>([]);

  // Public signals
  public readonly status = this.connectionStatus.asReadonly();
  public readonly hosting = this.isHost.asReadonly();
  public readonly messages = this.receivedMessages.asReadonly();
  public readonly roomCode = this.signalingService.roomCode;
  public readonly playerCount = this.signalingService.players;

  public readonly isConnected = computed(() =>
    this.connectionStatus() === 'connected'
  );

  constructor() {
    // Listen to signaling messages
    this.signalingService.messages$.subscribe(message => {
      this.handleSignalingMessage(message);
    });
  }

  /**
   * Host a new game
   */
  async hostGame(): Promise<string> {
    this.isHost.set(true);
    await this.signalingService.connect();
    const roomCode = await this.signalingService.createRoom();

    // As host, we wait for guests to connect
    // The peer connection will be created when we receive an offer

    return roomCode;
  }

  /**
   * Join an existing game
   */
  async joinGame(roomCode: string): Promise<void> {
    this.isHost.set(false);
    await this.signalingService.connect();
    await this.signalingService.joinRoom(roomCode);

    // As guest, create peer connection and send offer to host
    await this.createPeerConnection();
    await this.createAndSendOffer();
  }

  /**
   * Send a message through the data channel
   */
  sendMessage(message: string): void {
    if (this.dataChannel?.readyState === 'open') {
      const gameMessage: GameMessage = {
        from: this.isHost() ? 'host' : 'guest',
        message,
        timestamp: Date.now()
      };
      this.dataChannel.send(JSON.stringify(gameMessage));
    } else {
      console.error('Data channel not open');
    }
  }

  /**
   * Disconnect and clean up
   */
  disconnect(): void {
    this.dataChannel?.close();
    this.peerConnection?.close();
    this.signalingService.disconnect();

    this.dataChannel = null;
    this.peerConnection = null;
    this.connectionStatus.set('disconnected');
    this.receivedMessages.set([]);
  }

  /**
   * Create peer connection
   */
  private async createPeerConnection(): Promise<void> {
    this.peerConnection = new RTCPeerConnection(RTC_CONFIG);

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.signalingService.sendIceCandidate(event.candidate);
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection!.connectionState;
      console.log('Connection state:', state);

      switch (state) {
        case 'connected':
          this.connectionStatus.set('connected');
          break;
        case 'disconnected':
        case 'closed':
          this.connectionStatus.set('disconnected');
          break;
        case 'failed':
          this.connectionStatus.set('failed');
          break;
        case 'connecting':
          this.connectionStatus.set('connecting');
          break;
      }
    };

    // If we're the guest, create the data channel
    // If we're the host, we'll receive it via ondatachannel
    if (!this.isHost()) {
      this.dataChannel = this.peerConnection.createDataChannel('game');
      this.setupDataChannel();
    } else {
      this.peerConnection.ondatachannel = (event) => {
        this.dataChannel = event.channel;
        this.setupDataChannel();
      };
    }
  }

  /**
   * Setup data channel handlers
   */
  private setupDataChannel(): void {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      console.log('Data channel opened');
      this.connectionStatus.set('connected');
    };

    this.dataChannel.onclose = () => {
      console.log('Data channel closed');
    };

    this.dataChannel.onerror = (error) => {
      console.error('Data channel error:', error);
      this.connectionStatus.set('failed');
    };

    this.dataChannel.onmessage = (event) => {
      try {
        const message: GameMessage = JSON.parse(event.data);
        this.receivedMessages.update(messages => [...messages, message]);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };
  }

  /**
   * Create and send offer (guest initiates connection)
   */
  private async createAndSendOffer(): Promise<void> {
    if (!this.peerConnection) return;

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    this.signalingService.sendOffer(offer.sdp!);
    this.connectionStatus.set('connecting');
  }

  /**
   * Handle signaling messages
   */
  private async handleSignalingMessage(message: any): Promise<void> {
    if (!this.peerConnection && (message.type === 'offer' || message.type === 'answer')) {
      await this.createPeerConnection();
    }

    switch (message.type) {
      case 'offer':
        // Host receives offer from guest
        if (this.isHost()) {
          await this.handleOffer(message.sdp);
        }
        break;

      case 'answer':
        // Guest receives answer from host
        if (!this.isHost()) {
          await this.handleAnswer(message.sdp);
        }
        break;

      case 'ice-candidate':
        await this.handleIceCandidate(message.candidate);
        break;
    }
  }

  /**
   * Handle incoming offer (host side)
   */
  private async handleOffer(sdp: string): Promise<void> {
    if (!this.peerConnection) return;

    await this.peerConnection.setRemoteDescription({
      type: 'offer',
      sdp
    });

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    this.signalingService.sendAnswer(answer.sdp!);
    this.connectionStatus.set('connecting');
  }

  /**
   * Handle incoming answer (guest side)
   */
  private async handleAnswer(sdp: string): Promise<void> {
    if (!this.peerConnection) return;

    await this.peerConnection.setRemoteDescription({
      type: 'answer',
      sdp
    });
  }

  /**
   * Handle incoming ICE candidate
   */
  private async handleIceCandidate(candidate: RTCIceCandidate): Promise<void> {
    if (!this.peerConnection) return;

    try {
      await this.peerConnection.addIceCandidate(candidate);
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  }
}
