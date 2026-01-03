import 'dotenv/config';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { spotifyClient } from './spotify.js';
import { quizGenerator } from './quiz-generator.js';
import { PreviewScraper } from './preview-scraper.js';

const PORT = process.env.PORT || 8080;

// Helper function to parse JSON body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

// Create HTTP server for health checks and API endpoints
const server = createServer(async (req, res) => {
  // Enable CORS for frontend requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check endpoint
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'cabu-music-quiz-server',
      rooms: rooms.size,
      connections: clients.size,
      spotify: !!process.env.SPOTIFY_CLIENT_ID,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // OAuth: Get authorization URL
  if (req.url === '/api/spotify/auth/url' && req.method === 'GET') {
    try {
      const authUrl = spotifyClient.getAuthorizationUrl();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, authUrl }));
    } catch (error) {
      console.error('Auth URL error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // OAuth: Exchange code for token
  if (req.url === '/api/spotify/auth/callback' && req.method === 'POST') {
    try {
      const { code } = await parseBody(req);
      const sessionData = await spotifyClient.exchangeCodeForToken(code);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, ...sessionData }));
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // Get session info (includes access token for Web Playback SDK)
  if (req.url?.startsWith('/api/spotify/session/') && req.method === 'GET') {
    try {
      const sessionId = req.url.split('/api/spotify/session/')[1];
      const session = spotifyClient.getSession(sessionId);

      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Session not found' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, session }));
    } catch (error) {
      console.error('Session error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // Scrape preview URL (for free users without auth)
  if (req.url?.startsWith('/api/spotify/preview/') && req.method === 'GET') {
    try {
      const trackId = req.url.split('/api/spotify/preview/')[1];
      const previewData = await PreviewScraper.getPreviewUrl(trackId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, ...previewData }));
    } catch (error) {
      console.error('Preview scrape error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // Batch scrape preview URLs
  if (req.url === '/api/spotify/preview/batch' && req.method === 'POST') {
    try {
      const { trackIds } = await parseBody(req);

      if (!trackIds || !Array.isArray(trackIds)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'trackIds array required' }));
        return;
      }

      const previews = await PreviewScraper.batchGetPreviewUrls(trackIds);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, previews }));
    } catch (error) {
      console.error('Batch preview error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // Spotify search endpoint (sessionId optional - if not provided, uses client credentials)
  if (req.url === '/api/spotify/search' && req.method === 'POST') {
    try {
      const { sessionId, filters, limit } = await parseBody(req);

      // sessionId is optional - if not provided, use client credentials (free mode)
      const tracks = await spotifyClient.searchTracks(sessionId || null, filters || {}, limit || 50);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, tracks }));
    } catch (error) {
      console.error('Search error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // Get track details endpoint
  if (req.url?.startsWith('/api/spotify/track/') && req.method === 'POST') {
    try {
      const trackId = req.url.split('/api/spotify/track/')[1];
      const { sessionId } = await parseBody(req);

      if (!sessionId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Session ID required' }));
        return;
      }

      const track = await spotifyClient.getTrackDetails(sessionId, trackId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, track }));
    } catch (error) {
      console.error('Track details error:', error);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // Quiz generation endpoint
  if (req.url === '/api/quiz/generate' && req.method === 'POST') {
    try {
      const { sessionId, ...settings } = await parseBody(req);

      // sessionId is optional - if not provided, use preview URLs (free mode)
      const questions = await quizGenerator.generateQuestions(sessionId || null, settings);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, questions }));
    } catch (error) {
      console.error('Quiz generation error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // 404 Not Found
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, error: 'Not Found' }));
});

// Create WebSocket server attached to HTTP server
const wss = new WebSocketServer({ server });

// Store rooms: Map<roomCode, Set<WebSocket>>
const rooms = new Map();

// Store client metadata: Map<WebSocket, { roomCode, role }>
const clients = new Map();

server.listen(PORT, () => {
  console.log(`🚀 Cabu Music Quiz Server running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   OAuth endpoints (Premium users):`);
  console.log(`     GET  /api/spotify/auth/url`);
  console.log(`     POST /api/spotify/auth/callback`);
  console.log(`     GET  /api/spotify/session/:id`);
  console.log(`   Preview endpoints (Free users):`);
  console.log(`     GET  /api/spotify/preview/:trackId`);
  console.log(`     POST /api/spotify/preview/batch`);
  console.log(`   API endpoints (authenticated):`);
  console.log(`     POST /api/spotify/search`);
  console.log(`     POST /api/spotify/track/:id`);
  console.log(`     POST /api/quiz/generate`);
  console.log(`   Spotify: ${process.env.SPOTIFY_CLIENT_ID ? '✓ OAuth Configured' : '✗ Not configured'}`);
});

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
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
