# Blindfold Trainer

A static web app for training chess visualization. It fetches a random game played by a top
Lichess player, shows the first *n* moves in algebraic notation, and you rebuild the resulting
position on an empty board. Submissions are scored square by square; points and streaks are kept
in `localStorage`.

Everything runs in the browser using the public [Lichess API](https://lichess.org/api) — no backend.

## Development

```sh
npm install
npm run dev      # local dev server
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build
```

## Deploying to GitHub Pages

1. Push the repository to GitHub (branch `main`).
2. In the repo settings, go to **Pages → Build and deployment → Source** and select **GitHub Actions**.
3. Every push to `main` runs `.github/workflows/deploy.yml`, which builds the site and publishes `dist/`.

The Vite `base` is `./`, so the site works under `https://<user>.github.io/<repo>/` without changes.

## How it works

- `src/lichess.ts` – picks a random player from `/api/player/top`, then downloads a batch of their
  rated games (`/api/games/user`) from a random point in the last two years and picks one long enough.
- `src/game.ts` – replays the moves with chess.js to get the target position.
- `src/board.ts` – chessground board with spare-piece palettes (drag, click-to-place, eraser).
- `src/scoring.ts` – per-square comparison and points.
- `src/storage.ts` – settings and stats in `localStorage`.
