// Bihar FM - Cloudflare Worker (WebRTC Signaling + Metadata Relay)

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    // Health check route
    if (pathname === "/") {
      return new Response("🎧 Bihar FM WebRTC Signaling (Cloudflare) is Live!");
    }

    // WebSocket upgrade
    if (pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 400 });
      }

      const [client, server] = Object.values(new WebSocketPair());
      handleSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not Found", { status: 404 });
  },
};

// ===== WebSocket Logic =====
const clients = new Map(); // id -> { ws, role }

function safeSend(ws, data) {
  try {
    ws.send(JSON.stringify(data));
  } catch (err) {
    console.error("Send error:", err.message);
  }
}

function handleSocket(ws) {
  const id = crypto.randomUUID();
  clients.set(id, { ws, role: null });
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

    // Register client as broadcaster/listener
    if (type === "register") {
      clients.get(id).role = role;
      console.log(`🧩 ${id} registered as ${role}`);

      if (role === "listener") {
        // Notify all broadcasters that a listener joined
        for (const [, c] of clients)
          if (c.role === "broadcaster")
            safeSend(c.ws, { type: "listener-joined", id });
      }
      return;
    }

    // Relay WebRTC signaling (offer/answer/candidate)
    if (["offer", "answer", "candidate"].includes(type) && target) {
      const t = clients.get(target);
      if (t) safeSend(t.ws, { type, from: id, payload });
      return;
    }

    // Metadata relay from broadcaster → all listeners
    if (type === "metadata") {
      console.log(`🎵 Metadata: ${payload?.title || "Unknown"}`);
      for (const [, c] of clients)
        if (c.role === "listener")
          safeSend(c.ws, {
            type: "metadata",
            title: payload.title,
            artist: payload.artist,
            cover: payload.cover,
          });
      return;
    }
  });

  ws.addEventListener("close", () => {
    const role = clients.get(id)?.role;
    clients.delete(id);
    console.log(`❌ ${role || "client"} disconnected: ${id}`);

    if (role === "listener") {
      for (const [, c] of clients)
        if (c.role === "broadcaster")
          safeSend(c.ws, { type: "peer-left", id });
    }
  });

  ws.addEventListener("error", (err) =>
    console.error("WebSocket error:", err.message)
  );
}
