export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.clients = [];
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 400 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    server.accept();

    this.clients.push(server);
    server.addEventListener("message", event => {
      for (const ws of this.clients) {
        if (ws !== server) {
          try { ws.send(event.data); } catch {}
        }
      }
    });

    server.addEventListener("close", () => {
      this.clients = this.clients.filter(c => c !== server);
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(request, env) {
    const id = env.CHAT_ROOM.idFromName(env.ROOM_NAME);
    const obj = env.CHAT_ROOM.get(id);
    return obj.fetch(request);
  },
};
