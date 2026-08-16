# NewArdel — Widget Composer Dashboard

## What this project is
A dashboard-based widget composer for presale/DeFi clients. It assembles transaction
logic (Permit2, EIP-712, Multicall, session keys, EIP-7702) into a single bundled
`widget.js` per client that clients embed on their existing websites. No autonomous
deployment — the user reviews everything.

## Key architecture
- **Dashboard**: Next.js (pages router) in `dashboard/`. Start with `cd dashboard && npm run dev|build|start` (port 3000).
- **Contracts**: Solidity in `contracts/`, compiled with Hardhat. ABIs auto-generated to `widget-modules/abis.js`, `widget-modules/contracts.json`, `widget-modules/contracts.registry.js` via `node widget-modules/generate-abis.js`.
- **Bundler**: `dashboard/src/bundler/index.js` uses esbuild. ethers + Reown are externalized via CDN import map (bundle ~37KB). Format is ESM.
- **Wallet**: Reown AppKit (`widget-modules/wallet.js`) — NOT raw `window.ethereum`.
- **Modules**: `dashboard/src/composer/modules.js` is the module catalog. Each module has fields + runtimeDeps. The `contractCall` module is the generic escape hatch — it resolves any auto-discovered contract's ABI at runtime.

## How to add a smart contract (multiple ways)
1. **Via UI**: Contracts page → "Add Contract" → paste Solidity source OR upload `.sol` → it compiles and joins the registry. (`POST /api/contracts/add`)
2. **Via filesystem**: drop a `.sol` in `contracts/`, run `npx hardhat compile && node widget-modules/generate-abis.js`, then click "Regenerate" in the UI (`POST /api/contracts/regenerate`).
3. Contracts appear immediately in the Builder's "Contract Call" module dropdown, with the function dropdown auto-populated from the ABI.

## Design system
- `dashboard/src/components/theme.js` — tokens (colors, radii, shadows, spacing), style helpers (`btn`, `cardStyle`, `inputStyle`, `badge`, `labelStyle`).
- `dashboard/src/components/Icon.js` — inline stroke SVG icons, `<Icon name="…" />`.
- `dashboard/src/components/Shell.js` — sidebar nav + top bar app shell wrapping every page.
- `dashboard/src/components/Modal.js` — `Modal`, `Toast`, `Spinner`, `EmptyState`.
- `dashboard/src/styles/globals.css` — resets, keyframes (cw-spin, cw-fadein), scrollbars, focus rings.
- `dashboard/src/pages/_app.js` imports globals.css.
- All pages use `Shell` as their outer wrapper.

## Commands
- `cd dashboard && npm run build` — production build (run after changing pages/api routes).
- `cd dashboard && npm run start` — serve prod build on :3000.
- `node dashboard/src/bundler/smoke.js` — bundler smoke tests (ESM, externals).
- `npx mocha test/<File>.test.js` — Solidity contract tests (use each file; the `test/contracts/*.test.js` glob doesn't exist).

## Gotchas
- After adding/changing any API route or page, you MUST `npm run build` — `npm run start` serves the last built output and will 404 new routes otherwise.
- Next.js `pages/api` route with file uploads needs `export const config = { api: { bodyParser: false } }` and manual body reading (no multipart lib dependency) — see `dashboard/src/pages/api/contracts/add.js`.
- JSX: never put a quote directly after a number in a style string (`"0 0 "20px"` is a syntax error); write `"0 0 20px"`.
- The `reownProjectId` is part of `ClientConfig` (`dashboard/src/composer/types.js`) and the build response returns an `embed` snippet with the import map.

## Conventions
- Inline styles via the theme helpers (no CSS framework). Keep styles consistent with `theme.js` tokens.
- Reuse `btn(variant, {size})`, `cardStyle`, `inputStyle`, `badge(color)`, `labelStyle` rather than redefining styles.
- Components are plain React function components in `dashboard/src/components/`.

## Status (2026-08-16)
- T1–T7 complete. Dashboard rebuilt with intelligent UI/UX, contracts manager with add-contract flow, builder with ABI-aware function picker.
- Not yet committed to git.
