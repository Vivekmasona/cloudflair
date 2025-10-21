// worker.js
const clients = new Map(); // id -> { ws, role }

export default {
  fetch(request, env, ctx) {
    // Non-WebSocket requests (for browser test)
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("🎧 FM WebRTC Cloudflare Signaling Server is Live!", { status: 200 });
    }

    // Upgrade request to WebSocket
    const [client, server] = Object.values(new WebSocketPair());
    handleSession(server);
    return new Response(null, { status: 101, webSocket: client });
  },
};

function safeSend(ws, data) {
  try {
    ws.send(JSON.stringify(data));
  } catch {}
}

function handleSession(ws) {
  const id = crypto.randomUUID();
  clients.set(id, { ws });
  console.log("🔗 Connected:", id);

  ws.accept();

  ws.addEventListener("message", (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    const { type, role, target, payload } = msg;

    // Register client
    if (type === "register") {
      clients.get(id).role = role;
      console.log(`🧩 ${id} registered as ${role}`);
      if (role === "listener") {
        for (const [, c] of clients)
          if (c.role === "broadcaster")
            safeSend(c.ws, { type: "listener-joined", id });
      }
    }

    // Relay offer/answer/candidate
    if (["offer", "answer", "candidate"].includes(type) && target) {
      const t = clients.get(target);
      if (t) safeSend(t.ws, { type, from: id, payload });
    }
  });

  ws.addEventListener("close", () => {
    clients.delete(id);
    console.log("❌ Disconnected:", id);
    for (const [, c] of clients)
      if (c.role === "broadcaster")
        safeSend(c.ws, { type: "peer-left", id });
  });

  // Periodic ping to keep connection alive
  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN)
      safeSend(ws, { type: "ping" });
    else clearInterval(pingInterval);
  }, 25000);
}
