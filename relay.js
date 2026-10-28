// Pokémon Arena relay server.
// Pairs two players by a 4-letter room code and forwards everything one sends to the other.
// The game itself (host's copy) decides rounds; this server never looks inside battle messages.
//
//   client -> server  {"t":"host"}               server -> client  {"t":"room","code":"ABCD"}
//   client -> server  {"t":"join","code":"ABCD"} server -> both     {"t":"paired","role":"host"|"guest"}
//                                                server -> client  {"t":"error","msg":"..."}
//   when one player leaves                       server -> other   {"t":"peer_left"}
//   anything else, once paired, goes to the other player unchanged.
//
// Run locally: npm install && npm start   (listens on PORT, default 9080)

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 9080;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, easy to read out loud
const rooms = new Map(); // code -> { host, guest }

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(`Pokemon Arena relay is running. Open rooms: ${rooms.size}\n`);
});
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

function newCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  } while (rooms.has(code));
  return code;
}

function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function partnerOf(ws) {
  const room = ws.room && rooms.get(ws.room);
  if (!room) return null;
  return room.host === ws ? room.guest : room.host;
}

function leave(ws) {
  const room = ws.room && rooms.get(ws.room);
  if (!room) return;
  const other = room.host === ws ? room.guest : room.host;
  rooms.delete(ws.room);
  ws.room = null;
  if (other) {
    other.room = null;
    send(other, { t: 'peer_left' });
  }
}

wss.on('connection', (ws) => {
  ws.room = null;
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });

  ws.on('message', (data, isBinary) => {
    const other = partnerOf(ws);
    if (other) {
      // Paired: pass it straight on (the game's battle traffic).
      if (other.readyState === other.OPEN) other.send(data, { binary: isBinary });
      return;
    }
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.t === 'host') {
      leave(ws);
      const code = newCode();
      rooms.set(code, { host: ws, guest: null });
      ws.room = code;
      send(ws, { t: 'room', code });
    } else if (msg.t === 'join') {
      const code = String(msg.code || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return send(ws, { t: 'error', msg: `No room called ${code || '(empty)'}. Check the code.` });
      if (room.guest || room.host === ws) return send(ws, { t: 'error', msg: `Room ${code} is already full.` });
      leave(ws);
      room.guest = ws;
      ws.room = code;
      send(room.host, { t: 'paired', role: 'host' });
      send(ws, { t: 'paired', role: 'guest' });
    } else if (msg.t === 'leave') {
      leave(ws);
    }
    // Anything else before pairing (keep-alive pings) is ignored.
  });

  ws.on('close', () => leave(ws));
  ws.on('error', () => leave(ws));
});

// Drop connections that stopped answering (closed laptop, lost Wi-Fi).
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, () => console.log(`Pokemon Arena relay listening on port ${PORT}`));
