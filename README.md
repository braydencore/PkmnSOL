# PkmnSOL

A small, from-scratch Game Boy Advance-style walking-around demo, played
inside a CSS-drawn GBA shell (D-pad + A button). Works with a keyboard on
desktop or by tapping the shell's buttons on a touchscreen, in either
portrait or landscape.

**Current scope is intentionally small:** you can walk around Pallet Town,
go in and out of one house (with stairs to the upstairs bedroom), read one
sign, and walk up Route 1. There is no battle system, no items, no catching,
and no save/load yet — this is the overworld/movement layer only.

## Running it

No build step, no dependencies. Either:

- Open `index.html` directly in a browser, or
- Serve the folder with any static file server, e.g.:
  ```
  python3 -m http.server 8080
  ```
  then visit `http://localhost:8080/`.

## Controls

| Action | Keyboard | Shell button |
|---|---|---|
| Move | Arrow keys / WASD | D-pad |
| A (talk/advance text) | Z, Space | A |

## Engine design

Every tile is its own dedicated PNG (`assets/tiles/*.png`), drawn to its
destination cell on a canvas with **no sprite-sheet slicing** — there is no
shared tileset atlas and no source-rectangle coordinate table to get wrong.
Maps are plain, human-readable text files (`maps/*.txt`): one line per
placed tile (`filename.png:x,y`), plus a few header lines for size, map
connectors, warps and signs.

Mobile fit uses two independent, deliberately-separated scale factors:
1. An integer device-pixel scale for the canvas itself, so art pixels never
   land on a fractional device pixel.
2. A separate outer CSS transform that fits the whole shell to the
   viewport in any aspect ratio, letterboxing/pillarboxing inside the
   screen bezel rather than leaving blank space around the console.

## Origins

Built from scratch, using the map data, tile/sprite art, and two music
tracks from [jamescastells/pokemonHTML](https://github.com/jamescastells/pokemonHTML)
(a proof-of-concept jQuery/DOM walking demo) as the starting content — the
rendering engine, mobile shell, map/warp/sign logic and all other code here
are new.

## Status & disclaimers

This is a fan project for personal experimentation, not a commercial
product. Tile and sprite art originates from the pokemonHTML project linked
above and is itself derived from Nintendo/Game Freak/Creatures-owned
Pokémon artwork. None of this is affiliated with or endorsed by Nintendo,
Game Freak, or Creatures Inc. Don't ship this commercially — swap the art
first.
