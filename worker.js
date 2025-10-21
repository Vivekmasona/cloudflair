// worker.js — Cloudflare Worker as WebSocket signaling server
export default {
  async fetch(req, env) {
    const upgradeHeader = req.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("WebSocket only", { status: 400 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    handleSession(server);
    return new Response(null, { status: 101, webSocket: client });
  },
};

const sessions = new Map();
let broadcaster = null;

function handleSession(ws) {
  ws.accept();
  let id = Math.random().toString(36).slice(2, 10);
  let role = null;

  ws.onmessage = async (msg) => {
    try {
      const data = JSON.parse(msg.data);

      // Broadcaster joins
      if (data.type === "register" && data.role === "broadcaster") {
        broadcaster = ws;
        role = "broadcaster";
        ws.send(JSON.stringify({ type: "ready" }));
      }

      // Listener joins
      else if (data.type === "register" && data.role === "listener") {
        sessions.set(id, ws);
        role = "listener";

        if (broadcaster) {
          broadcaster.send(JSON.stringify({ type: "listener-joined", id }));
        }
      }

      // Offer/Answer/Candidate relay
      else if (["offer", "answer", "candidate"].includes(data.type)) {
        const target = sessions.get(data.target) || (data.target === "broadcaster" ? broadcaster : null);
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify({ ...data, from: id }));
        }
      }
    } catch (err) {
      console.error("Error:", err);
    }
  };

  ws.onclose = () => {
    if (role === "listener") {
      sessions.delete(id);
      if (broadcaster && broadcaster.readyState === WebSocket.OPEN) {
        broadcaster.send(JSON.stringify({ type: "peer-left", id }));
      }
    }
    if (role === "broadcaster") {
      broadcaster = null;
    }
  };
}
