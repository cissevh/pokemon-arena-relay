# Pokémon Arena relay

Tiny WebSocket server for Pokémon Arena online battles. It pairs two players by a 4-letter room code and forwards their messages; the games do everything else. The source of truth is `server/` in the game folder.

- Run locally: `npm install && npm start` (port 9080, or `PORT`).
- Deploy on Render: New + → Blueprint → this repository → Apply (uses `render.yaml`, free plan).
- In the game's online lobby, use the Render address with `wss://`, e.g. `wss://pokemon-arena-relay.onrender.com`.
