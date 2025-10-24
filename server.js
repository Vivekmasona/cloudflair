// server.js
// Simple chat server with app-level heartbeat for Cloudflare compatibility
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

const PORT = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("WebSocket chat server running.");
});

const wss = new WebSocketServer({ server });

/** Broadcast helper */
function broadcast(data, except = null) {
  const message = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN && client !== except) {
      client.send(message);
    }
  }
}

/** Application-level heartbeat interval (send "ping" message) */
const APP_PING_INTERVAL = 25 * 1000; // 25 seconds

wss.on("connection", (ws, req) => {
  ws.isAlive = true;
  ws.id = Math.random().toString(36).slice(2, 9);
  console.log("Client connected:", ws.id);

  // When client sends a message
  ws.on("message", (msg) => {
    let data;
    try { data = JSON.parse(msg.toString()); } catch(e) { return; }

    if (data?.type === "pong") {
      // application-level pong from client
      ws.isAlive = true;
      return;
    }

    if (data?.type === "join") {
      ws.name = data.name || "Anonymous";
      broadcast({ type: "system", text: `${ws.name} joined.`, ts: Date.now() });
      return;
    }

    if (data?.type === "chat") {
      const payload = {
        type: "chat",
        from: ws.name || "Anonymous",
        text: data.text,
        ts: Date.now(),
      };
      broadcast(payload);
      return;
    }

    // unknown message types can be logged
    console.log("Unknown message:", data);
  });

  ws.on("close", () => {
    console.log("Client disconnected:", ws.id);
    broadcast({ type: "system", text: `${ws.name || "A user"} left.`, ts: Date.now() });
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
  });
});

/** Periodic app-level ping to all clients */
setInterval(() => {
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    // If client hasn't answered our last pong, consider it dead and terminate
    if (client.isAlive === false) {
      console.log("Terminating stale client:", client.id);
      try { client.terminate(); } catch(e) {}
      continue;
    }
    client.isAlive = false;
    // send small JSON ping — Cloudflare treats data frames as activity
    client.send(JSON.stringify({ type: "ping", ts: Date.now() }));
  }
}, APP_PING_INTERVAL);

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
