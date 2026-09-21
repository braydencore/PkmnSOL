# PkmnSOL

A browser-based, real-time multiplayer monster-catching RPG client, built
with Phaser 3 and TypeScript. This is the static client half of a
client/server pair — it talks to a persistent backend over REST and
WebSockets for accounts, sessions, and live multiplayer position/state
sync.

## Running it

This is a prebuilt static site (Vite output) — just serve the folder:

```
python3 -m http.server 8080
```

then visit `http://localhost:8080/`.

To rebuild from source instead of editing the built output directly, see
the [poposafari/client](https://github.com/poposafari/client) repo, set
`VITE_API_BASE_URL` / `VITE_SOCKET_SERVER_URL` in `.env.production` to
point at the backend, and run `pnpm run build`.

## Backend

The companion server (REST API + Socket.io + game loop, Postgres via
Drizzle ORM) lives in a fork of
[poposafari/server](https://github.com/poposafari/server) and is deployed
separately. This client is configured to talk to that server's live URL
at build time via `VITE_API_BASE_URL` / `VITE_SOCKET_SERVER_URL`; there's
no client-side game logic that runs standalone without it (accounts,
login, and multiplayer state all require the server to be reachable).

## Origins

Forked from [poposafari/client](https://github.com/poposafari/client) and
[poposafari/server](https://github.com/poposafari/server), which provide
real Pokémon-species gameplay with a genuine multiplayer architecture
(persistent accounts, JWT auth, OAuth login, live position broadcast over
WebSockets) rather than a single-player/local-save-only engine.

## Status & disclaimers

This is a fan project for personal experimentation, not a commercial
product. It uses Pokémon species data/artwork and is not affiliated with
or endorsed by Nintendo, Game Freak, or Creatures Inc. Don't ship this
commercially.
