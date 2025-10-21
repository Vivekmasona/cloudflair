// worker.js — Cloudflare Worker acting as WebSocket Signaling Server
export default {
  async fetch(request, env) {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("WebSocket endpoint active ✅", { status: 200 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    handleSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  },
};

let broadcaster = null;
const listeners = new Map();

function handleSocket(ws) {
  ws.accept();
  let id = Math.random().toString(36).slice(2, 10);
  let role = null;

  ws.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data);

      // 🔹 Register broadcaster or listener
      if (data.type === "register") {
        role = data.role;
        if (role === "broadcaster") {
          broadcaster = ws;
          ws.send(JSON.stringify({ type: "ready" }));
        } else if (role === "listener") {
          listeners.set(id, ws);
          if (broadcaster && broadcaster.readyState === WebSocket.OPEN) {
            broadcaster.send(JSON.stringify({ type: "listener-joined", id }));
          }
        }
        return;
      }

      // 🔹 Forward signaling messages
      if (data.type === "offer" || data.type === "answer" || data.type === "candidate") {
        const target =
          data.target === "broadcaster" ? broadcaster : listeners.get(data.target);
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify({ ...data, from: id }));
        }
      }
    } catch (err) {
      console.error("Message error:", err);
    }
  };

  ws.onclose = () => {
    if (role === "listener") {
      listeners.delete(id);
      if (broadcaster && broadcaster.readyState === WebSocket.OPEN) {
        broadcaster.send(JSON.stringify({ type: "peer-left", id }));
      }
    }
    if (role === "broadcaster") broadcaster = null;
  };
}
