export interface ConnectionSlot {
  index: number;
  status: 'waiting' | 'connecting' | 'connected' | 'failed';
  peerId?: string;
  connection?: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
}

export interface SignalingData {
  type: 'offer' | 'answer';
  sdp: string;
  slotIndex?: number;
  timestamp: number;
}

export interface GameMessage {
  from: string;
  message: string;
  timestamp: number;
}

export type ConnectionRole = 'host' | 'guest';
