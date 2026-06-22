# Air Horse Kart

A super cute pastel go-kart racing game made with Next.js and Three.js.

## Features

- Pastel 3D go-kart with cute helmet driver and crown
- Curvy candy race track
- Mobile touch controls
- Keyboard controls
- Drift charging
- Turbo boost
- Hearts as pickups
- Cute cloud obstacles
- Pause and restart UI
- No GLB assets required

## Controls

### Mobile

- Left arrow button: steer left
- Right arrow button: steer right
- DRIFT: hold while steering to charge boost
- TURBO: spend boost when the meter is ready

### Keyboard

- A/D or arrow keys: steer
- Space or Shift: drift
- W or Up Arrow: turbo
- R: restart after crash

## Run locally

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Files

```text
app/layout.jsx
app/page.jsx
app/globals.css
components/CuteKartGame.jsx
package.json
next.config.mjs
jsconfig.json
```

## Notes

This version uses procedural Three.js geometry and canvas textures, so it works without external images or model files. You can later replace the kart group with a GLB model using `GLTFLoader`.
