import { Injectable, signal, computed } from '@angular/core';
import { ConnectionSlot, SignalingData, GameMessage, ConnectionRole } from '../models/connection.model';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10
};

@Injectable({
  providedIn: 'root'
})
export class WebRTCService {
  private role = signal<ConnectionRole | null>(null);
  private slots = signal<ConnectionSlot[]>([]);
  private receivedMessages = signal<GameMessage[]>([]);

  // Public signals
  public readonly connectionRole = this.role.asReadonly();
  public readonly connectionSlots = this.slots.asReadonly();
  public readonly messages = this.receivedMessages.asReadonly();

  public readonly connectedPeers = computed(() =>
    this.slots().filter(slot => slot.status === 'connected')
  );

  public readonly connectionCount = computed(() =>
    this.connectedPeers().length
  );

  constructor() {}

  /**
   * Initialize as host - creates 3 connection slots
   */
  createHost(): void {
    this.role.set('host');
    const initialSlots: ConnectionSlot[] = [
      { index: 0, status: 'waiting' },
      { index: 1, status: 'waiting' },
      { index: 2, status: 'waiting' }
    ];
    this.slots.set(initialSlots);
  }

  /**
   * Initialize as guest - creates single connection slot
   */
  createGuest(): void {
    this.role.set('guest');
    this.slots.set([{ index: 0, status: 'waiting' }]);
  }

  /**
   * Create an offer for a specific guest slot (host only)
   */
  async createOffer(slotIndex: number): Promise<SignalingData> {
    if (this.role() !== 'host') {
      throw new Error('Only host can create offers');
    }

    const slot = this.slots()[slotIndex];
    if (!slot) {
      throw new Error(`Invalid slot index: ${slotIndex}`);
    }

    // Update slot status
    this.updateSlotStatus(slotIndex, 'connecting');

    // Create peer connection
    const peerConnection = new RTCPeerConnection(RTC_CONFIG);

    // Create data channel
    const dataChannel = peerConnection.createDataChannel('game', {
      ordered: true,
      maxRetransmits: 3
    });

    // Setup data channel handlers
    this.setupDataChannel(dataChannel, slotIndex);

    // Setup connection handlers
    this.setupConnectionHandlers(peerConnection, slotIndex);

    // Store connection and channel
    this.updateSlot(slotIndex, {
      connection: peerConnection,
      dataChannel
    });

    // Create offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // Wait for ICE gathering to complete
    await this.waitForIceGathering(peerConnection);

    const signalingData: SignalingData = {
      type: 'offer',
      sdp: peerConnection.localDescription!.sdp,
      slotIndex,
      timestamp: Date.now()
    };

    return signalingData;
  }

  /**
   * Receive and process an answer from a guest (host only)
   */
  async receiveAnswer(slotIndex: number, answerData: SignalingData): Promise<void> {
    if (this.role() !== 'host') {
      throw new Error('Only host can receive answers');
    }

    const slot = this.slots()[slotIndex];
    if (!slot?.connection) {
      throw new Error(`No connection found for slot ${slotIndex}`);
    }

    const answer: RTCSessionDescriptionInit = {
      type: 'answer',
      sdp: answerData.sdp
    };

    await slot.connection.setRemoteDescription(answer);
  }

  /**
   * Receive and process an offer from host (guest only)
   */
  async receiveOffer(offerData: SignalingData): Promise<void> {
    if (this.role() !== 'guest') {
      throw new Error('Only guest can receive offers');
    }

    const slotIndex = 0; // Guest always uses slot 0
    this.updateSlotStatus(slotIndex, 'connecting');

    // Create peer connection
    const peerConnection = new RTCPeerConnection(RTC_CONFIG);

    // Setup ondatachannel handler to receive the data channel
    peerConnection.ondatachannel = (event) => {
      const dataChannel = event.channel;
      this.setupDataChannel(dataChannel, slotIndex);
      this.updateSlot(slotIndex, { dataChannel });
    };

    // Setup connection handlers
    this.setupConnectionHandlers(peerConnection, slotIndex);

    // Store connection
    this.updateSlot(slotIndex, { connection: peerConnection });

    // Set remote description (offer)
    const offer: RTCSessionDescriptionInit = {
      type: 'offer',
      sdp: offerData.sdp
    };
    await peerConnection.setRemoteDescription(offer);
  }

  /**
   * Create an answer to the host's offer (guest only)
   */
  async createAnswer(): Promise<SignalingData> {
    if (this.role() !== 'guest') {
      throw new Error('Only guest can create answers');
    }

    const slotIndex = 0;
    const slot = this.slots()[slotIndex];

    if (!slot?.connection) {
      throw new Error('No connection found');
    }

    // Create answer
    const answer = await slot.connection.createAnswer();
    await slot.connection.setLocalDescription(answer);

    // Wait for ICE gathering to complete
    await this.waitForIceGathering(slot.connection);

    const signalingData: SignalingData = {
      type: 'answer',
      sdp: slot.connection.localDescription!.sdp,
      timestamp: Date.now()
    };

    return signalingData;
  }

  /**
   * Send a message through the data channel
   */
  sendMessage(message: string, slotIndex?: number): void {
    if (this.role() === 'host') {
      // Host sends to specific slot or all connected peers
      if (slotIndex !== undefined) {
        const slot = this.slots()[slotIndex];
        if (slot?.dataChannel?.readyState === 'open') {
          slot.dataChannel.send(JSON.stringify({ message, from: 'host', timestamp: Date.now() }));
        }
      } else {
        // Broadcast to all connected peers
        this.slots().forEach(slot => {
          if (slot.dataChannel?.readyState === 'open') {
            slot.dataChannel.send(JSON.stringify({ message, from: 'host', timestamp: Date.now() }));
          }
        });
      }
    } else if (this.role() === 'guest') {
      // Guest sends to host
      const slot = this.slots()[0];
      if (slot?.dataChannel?.readyState === 'open') {
        slot.dataChannel.send(JSON.stringify({ message, from: 'guest', timestamp: Date.now() }));
      }
    }
  }

  /**
   * Reset the service state
   */
  reset(): void {
    // Close all connections
    this.slots().forEach(slot => {
      slot.dataChannel?.close();
      slot.connection?.close();
    });

    this.slots.set([]);
    this.receivedMessages.set([]);
    this.role.set(null);
  }

  /**
   * Setup data channel event handlers
   */
  private setupDataChannel(dataChannel: RTCDataChannel, slotIndex: number): void {
    dataChannel.onopen = () => {
      console.log(`Data channel opened for slot ${slotIndex}`);
      this.updateSlotStatus(slotIndex, 'connected');
    };

    dataChannel.onclose = () => {
      console.log(`Data channel closed for slot ${slotIndex}`);
      this.updateSlotStatus(slotIndex, 'failed');
    };

    dataChannel.onerror = (error) => {
      console.error(`Data channel error for slot ${slotIndex}:`, error);
      this.updateSlotStatus(slotIndex, 'failed');
    };

    dataChannel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as GameMessage;
        this.receivedMessages.update(messages => [...messages, data]);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };
  }

  /**
   * Setup peer connection event handlers
   */
  private setupConnectionHandlers(connection: RTCPeerConnection, slotIndex: number): void {
    connection.onconnectionstatechange = () => {
      console.log(`Connection state changed for slot ${slotIndex}:`, connection.connectionState);

      if (connection.connectionState === 'failed' || connection.connectionState === 'disconnected') {
        this.updateSlotStatus(slotIndex, 'failed');
      }
    };

    connection.oniceconnectionstatechange = () => {
      console.log(`ICE connection state changed for slot ${slotIndex}:`, connection.iceConnectionState);
    };
  }

  /**
   * Wait for ICE gathering to complete
   */
  private waitForIceGathering(connection: RTCPeerConnection): Promise<void> {
    return new Promise((resolve, reject) => {
      if (connection.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('ICE gathering timeout'));
      }, 5000);

      connection.addEventListener('icegatheringstatechange', () => {
        if (connection.iceGatheringState === 'complete') {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
  }

  /**
   * Update a specific slot
   */
  private updateSlot(slotIndex: number, updates: Partial<ConnectionSlot>): void {
    this.slots.update(slots => {
      const newSlots = [...slots];
      newSlots[slotIndex] = { ...newSlots[slotIndex], ...updates };
      return newSlots;
    });
  }

  /**
   * Update slot status
   */
  private updateSlotStatus(slotIndex: number, status: ConnectionSlot['status']): void {
    this.updateSlot(slotIndex, { status });
  }
}
