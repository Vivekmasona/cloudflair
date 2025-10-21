export default {
  async fetch(request, env, ctx) {
    // Normal HTTP response for GET
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("🎧 Bihar FM Signaling Server Active!", { status: 200 });
    }

    // WebSocket upgrade
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept(); // very important in Cloudflare

    handleSession(server);
    return new Response(null, { status: 101, webSocket: client });
  },
};

const clients = new Map();

function handleSession(ws) {
  const id =
    (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  clients.set(id, { ws, role: null });
  console.log("🔗 Connected:", id);

  ws.addEventListener("message", (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (err) {
      return;
    }

    const { type, role, target, payload } = msg;

    // registration
    if (type === "register") {
      clients.get(id).role = role;
      console.log(`🧩 ${id} registered as ${role}`);

      if (role === "listener") {
        // notify all broadcasters that new listener joined
        for (const [, c] of clients)
          if (c.role === "broadcaster")
            safeSend(c.ws, { type: "listener-joined", id });
      }
    }

    // relay signals
    if (["offer", "answer", "candidate"].includes(type) && target) {
      const t = clients.get(target);
      if (t) safeSend(t.ws, { type, from: id, payload });
    }
  });

  ws.addEventListener("close", () => {
    clients.delete(id);
    console.log("❌ Closed:", id);
    // notify broadcaster when listener left
    for (const [, c] of clients)
      if (c.role === "broadcaster")
        safeSend(c.ws, { type: "peer-left", id });
  });

  ws.addEventListener("error", (err) => {
    console.log("⚠️ WS error:", err.message);
  });
}

function safeSend(ws, data) {
  try {
    ws.send(JSON.stringify(data));
  } catch (err) {}
}
