# Kahu Web 2

Beginner-friendly browser client for **Kuba**, using the same **Kahu** WebAssembly engine as [Kahu-web](https://github.com/oscarlo11212821/Kahu-web).

New here:

- Three.js 3D board with push animations
- Learn / Play / Puzzles modes
- Easy · Medium · Hard instead of raw search time
- Coach tips and Hint
- Advanced (KFEN, ms) tucked away

No C++ rebuild needed — this reuses `kahu.wasm`, `kahu.js`, and `C16_C12_blind.nnue`.

## Run locally

Workers and WebAssembly need a static server (`file://` will not work):

```bash
python3 -m http.server -d . 8766
```

Open [http://127.0.0.1:8766/](http://127.0.0.1:8766/).

Three.js loads from jsDelivr (needs network on first load).

## Layout

| Path | Role |
|---|---|
| `index.html`, `style.css` | Beginner shell |
| `js/app.js` | Modes, play loop, puzzles |
| `js/board3d.js` | Three.js board |
| `js/engine-bridge.js` | Worker wrapper |
| `js/kuba.js` | KFEN / move helpers |
| `worker.js`, `kahu.js`, `kahu.wasm` | Engine (from Kahu-web) |
| `C16_C12_blind.nnue`, `puzzles.txt` | Network + tactics |

## License

Engine bits follow the original project (GPL-3.0). See the upstream `LICENSE`.
