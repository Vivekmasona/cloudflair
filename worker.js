export default {
  fetch(request, env) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("🎧 Bihar FM Signaling Server Active!", { status: 200 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    handleSession(server);
    return new Response(null, { status: 101, webSocket: client });
  },
};

const clients = new Map();

function handleSession(ws) {
  const id = crypto.randomUUID();
  clients.set(id, { ws });
  console.log("🔗 Client connected:", id);

  ws.accept();

  ws.addEventListener("message", (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    const { type, role, target, payload } = msg;

    if (type === "register") {
      clients.get(id).role = role;
      if (role === "listener") {
        for (const [, c] of clients)
          if (c.role === "broadcaster")
            safeSend(c.ws, { type: "listener-joined", id });
      }
    }

    if (["offer", "answer", "candidate"].includes(type) && target) {
      const t = clients.get(target);
      if (t) safeSend(t.ws, { type, from: id, payload });
    }
  });

  ws.addEventListener("close", () => {
    clients.delete(id);
    for (const [, c] of clients)
      if (c.role === "broadcaster") safeSend(c.ws, { type: "peer-left", id });
  });
}

function safeSend(ws, data) {
  try { ws.send(JSON.stringify(data)); } catch {}
}
