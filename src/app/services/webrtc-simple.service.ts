import { Injectable, signal, computed, inject } from '@angular/core';
import { WebSocketSignalingService } from './websocket-signaling.service';
import { GameMessage, PlayerInfo } from '../models/connection.model';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'failed';

interface PeerConnectionInfo {
  peerId: string;
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  status: ConnectionStatus;
}

@Injectable({
  providedIn: 'root'
})
export class WebRTCSimpleService {
  private signalingService = inject(WebSocketSignalingService);

  // For single peer connection (guest mode)
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;

  // For multiple peer connections (host mode)
  private peerConnections = new Map<string, PeerConnectionInfo>();

  private connectionStatus = signal<ConnectionStatus>('disconnected');
  private isHost = signal(false);
  private receivedMessages = signal<GameMessage[]>([]);
  private currentPlayer = signal<PlayerInfo | null>(null);
  private playersList = signal<PlayerInfo[]>([]);
  private hasJoinedAsGuest = false;

  // Public signals
  public readonly status = this.connectionStatus.asReadonly();
  public readonly hosting = this.isHost.asReadonly();
  public readonly messages = this.receivedMessages.asReadonly();
  public readonly roomCode = this.signalingService.roomCode;
  public readonly playerCount = this.signalingService.players;
  public readonly player = this.currentPlayer.asReadonly();
  public readonly players = this.playersList.asReadonly();

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
  async hostGame(playerName: string): Promise<string> {
    this.isHost.set(true);

    // Create host player info
    const hostPlayer: PlayerInfo = {
      id: 'host',
      name: playerName,
      role: 'host',
      connected: true
    };
    this.currentPlayer.set(hostPlayer);
    this.playersList.set([hostPlayer]);

    await this.signalingService.connect();
    const roomCode = await this.signalingService.createRoom();

    // As host, we wait for guests to connect
    // Peer connections will be created when we receive offers

    this.connectionStatus.set('connected');
    return roomCode;
  }

  /**
   * Join an existing game
   */
  async joinGame(roomCode: string, playerName: string): Promise<void> {
    this.isHost.set(false);

    // Create guest player info with unique ID
    const guestPlayer: PlayerInfo = {
      id: `player-${Date.now()}`,
      name: playerName,
      role: 'guest',
      connected: false
    };
    this.currentPlayer.set(guestPlayer);

    await this.signalingService.connect();
    await this.signalingService.joinRoom(roomCode);

    // As guest, create peer connection and send offer to host
    await this.createPeerConnection();
    await this.createAndSendOffer();
  }

  /**
   * Send a game message to all connected players
   */
  sendGameMessage<T>(message: GameMessage<T>): void {
    const messageJson = JSON.stringify(message);

    if (this.isHost()) {
      // Host broadcasts to all guests
      let sentCount = 0;
      this.peerConnections.forEach((peerInfo) => {
        if (peerInfo.dataChannel?.readyState === 'open') {
          peerInfo.dataChannel.send(messageJson);
          sentCount++;
        }
      });
      console.log(`Host sent message to ${sentCount} peers`);
    } else {
      // Guest sends to host
      if (this.dataChannel?.readyState === 'open') {
        this.dataChannel.send(messageJson);
      } else {
        console.error('Data channel not open');
      }
    }
  }

  /**
   * Send a message to a specific player (host only)
   */
  sendToPlayer<T>(playerId: string, message: GameMessage<T>): void {
    if (!this.isHost()) {
      console.error('Only host can send to specific players');
      return;
    }

    const peerInfo = this.peerConnections.get(playerId);
    if (peerInfo?.dataChannel?.readyState === 'open') {
      peerInfo.dataChannel.send(JSON.stringify(message));
    } else {
      console.error(`Cannot send to player ${playerId}: channel not open`);
    }
  }

  /**
   * Disconnect and clean up
   */
  disconnect(): void {
    // Clean up guest connection
    this.dataChannel?.close();
    this.peerConnection?.close();

    // Clean up host connections
    this.peerConnections.forEach((peerInfo) => {
      peerInfo.dataChannel?.close();
      peerInfo.connection.close();
    });
    this.peerConnections.clear();

    this.signalingService.disconnect();

    this.dataChannel = null;
    this.peerConnection = null;
    this.connectionStatus.set('disconnected');
    this.receivedMessages.set([]);
    this.playersList.set([]);
    this.hasJoinedAsGuest = false;
  }

  /**
   * Create peer connection (for guest)
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

    // Guest creates the data channel
    this.dataChannel = this.peerConnection.createDataChannel('game');
    this.setupDataChannel();
  }

  /**
   * Create peer connection for a specific guest (for host)
   */
  private async createPeerConnectionForGuest(guestId: string): Promise<RTCPeerConnection> {
    const peerConnection = new RTCPeerConnection(RTC_CONFIG);

    const peerInfo: PeerConnectionInfo = {
      peerId: guestId,
      connection: peerConnection,
      dataChannel: null,
      status: 'connecting'
    };

    this.peerConnections.set(guestId, peerInfo);

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.signalingService.sendIceCandidate(event.candidate);
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      console.log(`Peer ${guestId} connection state:`, state);

      peerInfo.status = state as ConnectionStatus;

      switch (state) {
        case 'connected':
          console.log(`Guest ${guestId} connected`);
          break;
        case 'disconnected':
        case 'closed':
          this.handlePeerDisconnected(guestId);
          break;
        case 'failed':
          console.error(`Peer ${guestId} connection failed`);
          break;
      }
    };

    // Host receives the data channel
    peerConnection.ondatachannel = (event) => {
      peerInfo.dataChannel = event.channel;
      this.setupDataChannelForGuest(guestId, event.channel);
    };

    return peerConnection;
  }

  /**
   * Send player-joined message after connection established
   */
  private sendPlayerJoinedMessage(): void {
    // Ensure we only send this once as a guest
    if (this.hasJoinedAsGuest) {
      console.log('Already sent player-joined message, skipping');
      return;
    }

    const player = this.currentPlayer();
    if (!player) return;

    const message: GameMessage = {
      type: 'player-joined',
      from: player.id,
      timestamp: Date.now(),
      data: { player }
    };

    console.log('Guest sending player-joined message:', player.name, player.id);
    this.sendGameMessage(message);
    this.hasJoinedAsGuest = true;
  }

  /**
   * Handle peer disconnection
   */
  private handlePeerDisconnected(peerId: string): void {
    const peerInfo = this.peerConnections.get(peerId);
    if (peerInfo) {
      peerInfo.dataChannel?.close();
      peerInfo.connection.close();
      this.peerConnections.delete(peerId);

      // Update players list
      this.playersList.update(players =>
        players.map(p => p.id === peerId ? { ...p, connected: false } : p)
      );

      console.log(`Peer ${peerId} disconnected and removed`);
    }
  }

  /**
   * Setup data channel handlers (for guest)
   */
  private setupDataChannel(): void {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      console.log('Guest data channel opened - sending player info to host');
      this.connectionStatus.set('connected');
      // Send player info to host now that channel is ready
      this.sendPlayerJoinedMessage();
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

        // Handle player list updates
        if (message.type === 'player-list-update') {
          const data = message.data as { players: PlayerInfo[] };
          this.playersList.set(data.players);
          console.log('Guest received player list update:', data.players.length, 'players');
        }

        this.receivedMessages.update(messages => [...messages, message]);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };
  }

  /**
   * Setup data channel handlers for a specific guest (for host)
   */
  private setupDataChannelForGuest(guestId: string, channel: RTCDataChannel): void {
    channel.onopen = () => {
      console.log(`Host: Data channel opened with guest ${guestId}, waiting for player-joined message`);
    };

    channel.onclose = () => {
      console.log(`Data channel closed with guest ${guestId}`);
    };

    channel.onerror = (error) => {
      console.error(`Data channel error with guest ${guestId}:`, error);
    };

    channel.onmessage = (event) => {
      try {
        const message: GameMessage = JSON.parse(event.data);
        this.handleGuestMessage(guestId, message);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };
  }

  /**
   * Handle message from a guest player
   */
  private handleGuestMessage(guestId: string, message: GameMessage): void {
    console.log('Host received message from guest:', message.type, 'from:', message.from);

    // Handle player-joined messages
    if (message.type === 'player-joined') {
      const playerData = message.data as { player: PlayerInfo };
      console.log('Host processing player-joined:', playerData.player.name, playerData.player.id);
      this.addPlayer(playerData.player);
    }

    // Broadcast all messages to the component
    this.receivedMessages.update(messages => [...messages, message]);
  }

  /**
   * Add a new player to the players list
   */
  private addPlayer(player: PlayerInfo): void {
    let wasAdded = false;

    this.playersList.update(players => {
      // Check if player already exists with same data
      const existing = players.find(p => p.id === player.id);

      if (existing) {
        // Check if data actually changed
        if (existing.name === player.name && existing.connected === true && existing.role === player.role) {
          console.log(`Player ${player.name} (${player.id}) already exists with same data, skipping update`);
          wasAdded = false;
          return players; // Return same array reference to prevent signal update
        } else {
          // Update existing player with new data
          console.log(`Updating existing player: ${player.name} (${player.id})`);
          wasAdded = false;
          return players.map(p => p.id === player.id ? { ...player, connected: true } : p);
        }
      } else {
        // Add new player
        console.log(`Adding new player: ${player.name} (${player.id})`);
        wasAdded = true;
        return [...players, { ...player, connected: true }];
      }
    });

    if (wasAdded || this.playersList().length > 1) {
      console.log(`Player list after update:`, this.playersList().map(p => `${p.name}(${p.id})`));

      // Broadcast updated player list to all connected players (host only)
      if (this.isHost()) {
        this.broadcastPlayerList();
      }
    }
  }

  /**
   * Broadcast current player list to all connected players (host only)
   */
  private broadcastPlayerList(): void {
    if (!this.isHost()) return;

    const openChannels = Array.from(this.peerConnections.values()).filter(
      p => p.dataChannel?.readyState === 'open'
    ).length;

    const message: GameMessage = {
      type: 'player-list-update',
      from: 'host',
      timestamp: Date.now(),
      data: {
        players: this.playersList()
      }
    };

    this.sendGameMessage(message);
    console.log(`Broadcasting player list (${this.playersList().length} players) to ${openChannels} connected guests`);
    console.log('Players:', this.playersList().map(p => `${p.name}(${p.id})`));
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
    switch (message.type) {
      case 'offer':
        // Host receives offer from guest
        if (this.isHost()) {
          await this.handleOfferFromGuest(message.sdp, message.from);
        }
        break;

      case 'answer':
        // Guest receives answer from host
        if (!this.isHost()) {
          await this.handleAnswer(message.sdp);
        }
        break;

      case 'ice-candidate':
        await this.handleIceCandidate(message.candidate, message.from);
        break;
    }
  }

  /**
   * Handle incoming offer from a guest (host side)
   */
  private async handleOfferFromGuest(sdp: string, guestId?: string): Promise<void> {
    // Generate guest ID if not provided
    const peerId = guestId || `guest-${Date.now()}`;

    // Create new peer connection for this guest
    const peerConnection = await this.createPeerConnectionForGuest(peerId);

    await peerConnection.setRemoteDescription({
      type: 'offer',
      sdp
    });

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    this.signalingService.sendAnswer(answer.sdp!);
    console.log(`Host sent answer to guest ${peerId}`);
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
  private async handleIceCandidate(candidate: RTCIceCandidate, from?: string): Promise<void> {
    if (this.isHost()) {
      // Host needs to add ICE candidate to the appropriate peer connection
      if (from) {
        const peerInfo = this.peerConnections.get(from);
        if (peerInfo) {
          try {
            await peerInfo.connection.addIceCandidate(candidate);
          } catch (error) {
            console.error(`Error adding ICE candidate for ${from}:`, error);
          }
        }
      } else {
        // Try adding to the most recent peer connection
        const connections = Array.from(this.peerConnections.values());
        if (connections.length > 0) {
          const latest = connections[connections.length - 1];
          try {
            await latest.connection.addIceCandidate(candidate);
          } catch (error) {
            console.error('Error adding ICE candidate:', error);
          }
        }
      }
    } else {
      // Guest adds to single peer connection
      if (!this.peerConnection) return;

      try {
        await this.peerConnection.addIceCandidate(candidate);
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    }
  }
}
