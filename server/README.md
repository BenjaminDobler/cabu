# Cabu Signaling Server

Minimal WebSocket signaling server for WebRTC peer connections.

## Features

- Room-based signaling with 6-character codes
- Supports up to 4 players per room
- Relays WebRTC offers, answers, and ICE candidates
- Automatic room cleanup
- No game data stored (pure signaling)

## Local Development

```bash
cd server
npm install
npm run dev
```

Server runs on `http://localhost:8080`

## Deployment

### Option 1: Render.com (Free Tier)

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set **Root Directory**: `server`
4. Set **Build Command**: `npm install`
5. Set **Start Command**: `npm start`
6. Deploy!

### Option 2: Railway.app (Free Tier)

1. Connect GitHub repository
2. Railway auto-detects the Node.js app
3. Set root directory to `server`
4. Deploy!

### Option 3: Fly.io

```bash
cd server
fly launch
fly deploy
```

### Option 4: Docker

```bash
cd server
docker build -t cabu-signaling .
docker run -p 8080:8080 cabu-signaling
```

## Environment Variables

- `PORT` - Server port (default: 8080)

## API

WebSocket messages:

### Client → Server

- `create-room` - Create a new room
- `join-room` - Join existing room
- `offer` - WebRTC offer
- `answer` - WebRTC answer
- `ice-candidate` - ICE candidate
- `leave-room` - Leave room

### Server → Client

- `room-created` - Room created successfully
- `room-joined` - Joined room successfully
- `player-joined` - Another player joined
- `player-left` - Player left room
- `error` - Error message
