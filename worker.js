export default {
  async fetch(req, env) {
    if (req.headers.get("upgrade") !== "websocket") {
      return new Response("🎧 Bihar FM WebSocket Server Live", { status: 200 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    handleSession(server);
    return new Response(null, { status: 101, webSocket: client });
  },
};

const clients = new Map(); // id -> { ws, role }

function broadcastToListeners(data) {
  for (const [, c] of clients)
    if (c.role === "listener" && c.ws.readyState === 1)
      c.ws.send(JSON.stringify(data));
}

function safeSend(ws, data) {
  if (ws.readyState === 1) ws.send(JSON.stringify(data));
}

function handleSession(ws) {
  const id = crypto.randomUUID();
  clients.set(id, { ws, role: null });
  console.log("Client connected:", id);

  ws.accept();

  ws.addEventListener("message", (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    const { type, role, payload } = msg;

    if (type === "register") {
      clients.get(id).role = role;
      console.log(`Registered ${id} as ${role}`);
      return;
    }

    if (type === "metadata") {
      console.log(`Metadata relay: ${payload?.title || "Unknown"}`);
      broadcastToListeners({
        type: "metadata",
        title: payload.title,
        artist: payload.artist,
        cover: payload.cover,
      });
      return;
    }

    if (type === "message") {
      broadcastToListeners({ type: "message", from: id, text: payload.text });
      return;
    }
  });

  ws.addEventListener("close", () => {
    clients.delete(id);
    console.log("Client disconnected:", id);
  });
}
