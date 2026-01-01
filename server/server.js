import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

// Store rooms: Map<roomCode, Set<WebSocket>>
const rooms = new Map();

// Store client metadata: Map<WebSocket, { roomCode, role }>
const clients = new Map();

console.log(`🚀 Signaling server running on port ${PORT}`);

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function broadcast(roomCode, message, excludeWs = null) {
  const room = rooms.get(roomCode);
  if (!room) return;

  room.forEach(client => {
    if (client !== excludeWs && client.readyState === 1) {
      client.send(JSON.stringify(message));
    }
  });
}

wss.on('connection', (ws) => {
  console.log('New client connected');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('Received:', message.type, message.roomCode || '');

      switch (message.type) {
        case 'create-room': {
          const roomCode = generateRoomCode();
          rooms.set(roomCode, new Set([ws]));
          clients.set(ws, { roomCode, role: 'host' });

          ws.send(JSON.stringify({
            type: 'room-created',
            roomCode
          }));

          console.log(`✓ Room created: ${roomCode}`);
          break;
        }

        case 'join-room': {
          const { roomCode } = message;
          const room = rooms.get(roomCode);

          if (!room) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Room not found'
            }));
            console.log(`✗ Room not found: ${roomCode}`);
            return;
          }

          // Check room capacity (max 4 players)
          if (room.size >= 4) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Room is full'
            }));
            console.log(`✗ Room full: ${roomCode}`);
            return;
          }

          room.add(ws);
          clients.set(ws, { roomCode, role: 'guest' });

          ws.send(JSON.stringify({
            type: 'room-joined',
            roomCode,
            playerCount: room.size
          }));

          // Notify other players
          broadcast(roomCode, {
            type: 'player-joined',
            playerCount: room.size
          }, ws);

          console.log(`✓ Player joined: ${roomCode} (${room.size}/4 players)`);
          break;
        }

        case 'offer':
        case 'answer':
        case 'ice-candidate': {
          const clientInfo = clients.get(ws);
          if (!clientInfo) return;

          // Relay signaling messages to other peers in the room
          broadcast(clientInfo.roomCode, {
            ...message,
            from: clientInfo.role
          }, ws);

          console.log(`→ Relayed ${message.type} in room ${clientInfo.roomCode}`);
          break;
        }

        case 'leave-room': {
          handleClientLeave(ws);
          break;
        }

        default:
          console.log(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });

  ws.on('close', () => {
    handleClientLeave(ws);
    console.log('Client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

function handleClientLeave(ws) {
  const clientInfo = clients.get(ws);
  if (!clientInfo) return;

  const { roomCode } = clientInfo;
  const room = rooms.get(roomCode);

  if (room) {
    room.delete(ws);

    // Notify others
    broadcast(roomCode, {
      type: 'player-left',
      playerCount: room.size
    });

    // Clean up empty rooms
    if (room.size === 0) {
      rooms.delete(roomCode);
      console.log(`✓ Room deleted: ${roomCode}`);
    } else {
      console.log(`✓ Player left: ${roomCode} (${room.size}/4 players)`);
    }
  }

  clients.delete(ws);
}

// Periodic cleanup of stale connections
setInterval(() => {
  wss.clients.forEach(client => {
    if (client.readyState !== 1) {
      handleClientLeave(client);
    }
  });
}, 30000);

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  wss.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
