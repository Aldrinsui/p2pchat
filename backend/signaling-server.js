import { WebSocketServer } from "ws";

/**
 * Minimal Signaling Server for SecureChat
 * 
 * This server facilitates the initial WebRTC handshake (SDP offers/answers and ICE candidates).
 * It uses a "room" concept to group peers. Messages are broadcast to everyone in the room
 * except the sender.
 * 
 * Usage:
 * 1. Install dependencies: npm install ws
 * 2. Run: node signaling-server.js
 */

const PORT = 8080;
const wss = new WebSocketServer({ port: PORT });
const rooms = new Map();

wss.on("connection", (ws) => {
  console.log("New signaling client connected.");

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      const room = data.room || 'main';

      // Initialize room if it doesn't exist
      if (!rooms.has(room)) {
        rooms.set(room, new Set());
      }
      rooms.get(room).add(ws);

      // Relay message to all other clients in the same room
      let broadcastCount = 0;
      for (const client of rooms.get(room)) {
        if (client !== ws && client.readyState === ws.OPEN) {
          client.send(JSON.stringify(data));
          broadcastCount++;
        }
      }
      
      if (broadcastCount > 0) {
        console.log(`Relayed ${data.type} from ${data.from?.substring(0,8)}... to ${broadcastCount} peers in room: ${room}`);
      }
    } catch (err) {
      console.error("Failed to parse or relay signaling message:", err);
    }
  });

  ws.on("close", () => {
    console.log("Signaling client disconnected.");
    // Cleanup: Remove client from all rooms
    for (const clients of rooms.values()) {
      clients.delete(ws);
    }
    // Cleanup: Remove empty rooms
    for (const [room, clients] of rooms.entries()) {
      if (clients.size === 0) {
        rooms.delete(room);
      }
    }
  });

  ws.on("error", (err) => {
    console.error("WebSocket client error:", err);
  });
});

console.log(`✅ Signaling server running on ws://localhost:${PORT}`);
console.log(`To use: Update your SecureChat settings to ws://localhost:${PORT}`);