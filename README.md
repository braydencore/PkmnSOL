# PkmnSOL

A browser-based, FireRed-style monster-catching RPG, played inside a realistic
on-screen Game Boy Advance shell — D-pad, A/B, Start/Select, shoulder buttons
and all. Works with a keyboard on desktop or by tapping the shell's buttons
on a touchscreen.

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
| A (confirm/interact) | Z, Space | A |
| B (cancel/back) | X, Escape | B |
| Menu | Enter | START |
| Fullscreen | F | — |
| Mute | M | — |

The console shell scales to fit the window; on phones, rotate to landscape
(a real GBA is held sideways).

## Origins

The game engine, battle system, maps and UI were forked from
[blackscythe123/FireRed-RPG](https://github.com/blackscythe123/FireRed-RPG),
itself generated as a single-shot build. On top of that base, this fork adds:

- A CSS-drawn, always-visible Game Boy Advance shell (bezel, D-pad, A/B,
  Start/Select, shoulder buttons, speaker grille) instead of a translucent
  mobile-only button overlay.
- The window-fit scaling logic in `js/main.js` now scales the whole shell as
  one unit, so every button stays proportional to the screen at any size.

## Status & disclaimers

This is a fan project for personal experimentation, not a commercial
product. Overworld tiles and character sprites are sourced from a
Pokemon-Obsidian–derived fan asset pack and are Nintendo/Game
Freak/Creatures-derived artwork; battle sprites come from PokeAPI. None of
this is affiliated with or endorsed by Nintendo, Game Freak, or Creatures
Inc. Don't ship this commercially — swap the art first.
