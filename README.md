# NXE

A webOS home app that recreates the look and motion of the late-2008 console
dashboard on a rooted LG TV. It runs from `file://` on the TV, and in desktop
Chrome against a mock Luna transport for development.

Start with [`AGENTS.md`](./AGENTS.md) and [`docs/STATUS.md`](./docs/STATUS.md).

```bash
bun install
bun run dev      # http://localhost:5173/?boot=off
bun run verify   # check, lint, format and tests
./build.sh       # IPK in dist/
```

The app ships with an original default theme. Other looks are theme add-ons
(see [`docs/THEMES.md`](./docs/THEMES.md)) and are not part of this repository.

NXE is not affiliated with Microsoft, LG or Valve. See [`NOTICE.md`](./NOTICE.md).
