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

// Player information
export interface PlayerInfo {
  id: string;
  name: string;
  role: 'host' | 'guest';
  connected: boolean;
}

// Game message types
export type GameMessageType =
  | 'player-joined'
  | 'player-left'
  | 'round-start'
  | 'answer-submitted'
  | 'round-end'
  | 'score-update'
  | 'game-start'
  | 'game-end';

// Base game message structure
export interface GameMessage<T = any> {
  type: GameMessageType;
  from: string; // player ID
  timestamp: number;
  data: T;
}

// Specific message payloads
export interface PlayerJoinedData {
  player: PlayerInfo;
}

export interface PlayerLeftData {
  playerId: string;
}

export interface RoundStartData {
  round: number;
  question: {
    id: string;
    type: string;
    question: string;
    imageUrl: string | null;
  };
  timeLimit: number;
}

export interface AnswerSubmittedData {
  playerId: string;
  answer: string;
  submittedAt: number;
}

export interface RoundEndData {
  round: number;
  correctAnswer: string;
  results: Array<{
    playerId: string;
    playerName: string;
    answer: string;
    correct: boolean;
    points: number;
    totalScore: number;
    currentStreak: number;
  }>;
}

export interface ScoreUpdateData {
  scores: Array<{
    playerId: string;
    totalScore: number;
    correctAnswers: number;
    currentStreak: number;
  }>;
}

export interface GameStartData {
  players: PlayerInfo[];
}

export interface GameEndData {
  finalScores: any[]; // Array of PlayerScore objects
}

export type ConnectionRole = 'host' | 'guest';
