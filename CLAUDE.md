# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

SuperLista is a mobile-first PWA (Create React App) for managing supermarket shopping lists: add products manually or by scanning a barcode, browse live prices at Carrefour/Día/ChangoMas/Coto/Vea/Jumbo/Easy, and compare which supermarket is cheapest for the current list. Data persists per-user in Firebase Realtime Database.

## Commands

```bash
npm install          # install dependencies
npm start             # dev server on http://localhost:3000
npm run build          # production build to build/
npm test               # Jest + React Testing Library, interactive watch mode
npm test -- --watchAll=false --testPathPattern=App.test.js   # run a single test file, non-interactively
npm run data:copy      # copy scraped supermarket JSON from src/data/ into public/data/ (see "Local supermarket data" below)
npm run start-https    # dev server with HTTPS=true (needed to test the camera-based barcode scanner over LAN/on a phone)
```

Docker (alternative to a local Node install): `docker-compose up` builds and runs the dev server on port 3000 with the source tree bind-mounted for hot reload; requires a `.env` file (see below).

There is no separate lint script; ESLint runs as part of `react-scripts start`/`build` via the `react-app` config in `package.json`.

## Environment setup

A `.env` file (gitignored) must define the Firebase web config:
```
REACT_APP_FIREBASE_API_KEY=
REACT_APP_FIREBASE_AUTH_DOMAIN=
REACT_APP_FIREBASE_DATABASE_URL=
REACT_APP_FIREBASE_PROJECT_ID=
REACT_APP_FIREBASE_STORAGE_BUCKET=
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=
REACT_APP_FIREBASE_APP_ID=
```
`.env.test` in the repo shows the expected shape (values are for the project's own Firebase instance — a Firebase web API key is not a secret, security comes from Realtime Database rules). Never re-add `DANGEROUSLY_DISABLE_HOST_CHECK=true`; it was removed as a security fix (DNS-rebinding exposure on the dev server).

`api/supermarket-proxy.js` (the Vercel serverless proxy) additionally reads `ALLOWED_ORIGIN` to restrict CORS — set it to the deployed domain(s) in Vercel's project settings, comma-separated for multiple.

## Architecture

### State layering: Context → hook → service

Firebase reads/writes are centralized in `src/services/firebaseService.js` (Realtime Database only — Firestore was removed as unused). Each domain wraps that service in a custom hook that owns the React state and subscriptions, and a thin Context component exposes the hook's return value to the tree:

- `AuthContext` (`src/context/AuthContext.js`) — Firebase Auth session, wraps `firebase/auth` directly.
- `UserListsContext` → `useUserLists` hook — a user's shopping lists (`Users/{uid}/User_Lists/{listId}`).
- `ProductsContext` → `useProducts` hook — products within the *currently selected* list (`Users/{uid}/User_Lists/{listId}/products/{productId}`); depends on both `AuthContext` and `UserListsContext`.

Provider nesting in `App.js` reflects this dependency: `Router > AuthProvider > UserListsProvider > ProductsProvider`. When adding a new piece of Firebase-backed state, follow the same pattern rather than calling `firebaseService` directly from components.

Realtime Database also has a top-level `Categories/{id}` node (shared across all users, not per-uid) read via `subscribeToCategories` and written via `addCategory`. Its content is fully defined by `src/utils/categoryMapping.js` — `ALL_CATEGORIES` (34 entries: one universal `OTROS_CATEGORY` id 0, `CARREFOUR_CATEGORIES` ids 100-117, `CHANGOMAS_CATEGORIES` ids 200-214), sourced from each retailer's own mega-menu — and was rebuilt from scratch in Firebase to exactly match it via `scripts/rebuildCategories.js` (one-off, needs `scripts/serviceAccountKey.json`, gitignored — see the script for the Admin SDK setup). Carrefour's and ChangoMas's category names are kept as fully separate sets, never merged into a shared generic list — they're genuinely different strings (e.g. "Perfumería y farmacia" vs "Perfumería"), and reconciling them into one list is what used to cause every scan to spawn a new one-off category.

`resolveProductCategory` in `categoryMapping.js` (shared by the barcode-scan handlers in `App.js` and `Supermercados.js`) is the only place a category ever gets attached to a scanned product: for Carrefour/ChangoMas it maps the raw VTEX category path to one of that brand's curated main-category titles via `mapToCarrefourCategory`/`mapToChangoMasCategory`, then looks it up by title in the live `Categories` list (always found, since Firebase mirrors `ALL_CATEGORIES`); for any other brand (Día, Jumbo, Vea, Easy, ...) — or no detected brand at all — it never attempts to map anything and returns "Otros" directly, for the user to recategorize by hand. Which mapper applies is driven by GPS-detected supermarket (`App.js`, `detectedSupermarket.brandKey`) or the explicitly selected brand tab (`Supermercados.js`, `selectedBrand.id`). On the main list screen, exactly one brand's categories are ever shown at a time — never a mix of Carrefour's and ChangoMas's, and never neither: `App.js` computes a single `activeBrandKey` (the GPS-detected brand when it's Carrefour or ChangoMas, otherwise Carrefour as the default) and derives `activeCategories` (`getCategorySetForBrand`) from it, used by both the `CategoryFilter` ribbon and `ProductForm`'s category picker.

### Routing

`App.js` defines routes directly with `react-router-dom` v6 (`/`, `/auth`, `/supermercados`, `/comparar`) — there is no shared layout component. `/supermercados` and `/comparar` each re-declare their own `<Header><SidebarMenu>` wrapper inline in the route's `element`; if you change the app shell (header, sidebar, container), update all three call sites.

### Local supermarket price data (not Firebase)

Product/branch data for Carrefour, Día, ChangoMas, Coto, Vea, Jumbo, Easy comes from static JSON in `public/data/`, fetched directly with `fetch()` at runtime — this is a *separate* data path from Firebase:
- `public/data/supermarkets_list.json` — brand list.
- `public/data/super/{brand}.json` — branches per brand (with lat/long, used for GPS-nearest-branch sorting).
- `public/data/products/{brand}/{branchId}.json` — full product catalog for one branch.

The `scripts/` directory holds one-off Node scripts (not run automatically) that scrape/transform this data into `src/data/super` and `src/data/products` (gitignored, not present by default); `npm run data:copy` (`scripts/organize_data_for_public.js`) copies that into `public/data/`. If `public/data` is missing branch/product files for a brand, regenerating it requires those scripts and raw source data, not just re-running the app.

`Supermercados.js` and `Comparador.js` both independently implement fuzzy word-matching search against these catalogs and Haversine-distance branch sorting — logic is duplicated between the two rather than shared.

### Live price lookups (barcode scanning)

Scanning a barcode (`html5-qrcode`) tries a live EAN lookup first for the three brands with a working API (Carrefour, Día, ChangoMas), then falls back to the static branch JSON above:
- **Dev**: `src/setupProxy.js` proxies `/proxy-api/{carrefour|dia|changomas}` to each brand's site via `http-proxy-middleware` (avoids CORS).
- **Prod (Vercel)**: `api/supermarket-proxy.js` is a serverless function that does the same via `/api/supermarket-proxy?brand=...&ean=...`, with an `ALLOWED_ORIGIN` CORS allowlist and a 30-req/min-per-IP in-memory rate limit.
- `src/services/supermarketService.js` calls whichever endpoint is live and caches results in `localStorage` (`superlista_{brand}_ean_cache`, TTL-based).

### Theming (dark mode)

All colors/spacing/shadows are CSS custom properties in `src/styles/variables.css`, with a `:root[data-theme="dark"]` override block. `src/hooks/useTheme.js` toggles `data-theme` on `<html>` and persists the choice to `localStorage` (`superlista_theme`); an inline blocking script in `public/index.html` applies the saved/OS-preferred theme before first paint to avoid a flash of the wrong theme.

**Important gotcha**: several tokens are theme-adaptive for use as *text/icon* color on a themed background (e.g. `--primary-color`, `--accent-color`, `--danger-color` get lighter in dark mode for legibility). Using those as a *solid fill behind white button text* fails WCAG contrast in dark mode. Use the dedicated non-adaptive fill tokens instead: `--primary-solid-end`/`--primary-solid-hover`, `--success-solid`/`--success-solid-hover`, `--danger-solid`/`--danger-solid-hover` (see `.btn-primary`/`.btn-success`/`.btn-danger` in `src/components/Buttons/Button.css` for the pattern). Similarly, `--glass-bg-strong`/`--glass-bg-soft`/`--glass-border`/`--bg-glass`/`--scrim-color`/`--hairline-shade` exist so translucent "glass" surfaces (headers, modals, overlays) adapt per theme instead of hardcoding `rgba(255,255,255,...)`.

Hover effects that use `transform` (lift/scale) should be scoped inside `@media (hover: hover) and (pointer: fine)` — on touch screens `:hover` has no "unhover" event and the effect sticks after a tap (see `.supermarket-card:hover` in `Supermercados.css`).

### Notifications

All user-facing alerts/confirms/toasts go through `src/Notifications/NotificationsServices.js` (a SweetAlert2 wrapper: `showErrorAlert`, `showSuccessAlert`, `showSuccessToast`, `showConfirmAlert`, `showInputAlert`). Don't use `window.alert`/`confirm`/`window.confirm` in new code — SweetAlert2 popups are styled via the `.swal2-*` overrides in `App.css` to follow the current theme.

### Mobile swipe gestures

`src/hooks/useSwipeable.js` implements the swipe-left-to-delete / swipe-right-to-edit gesture used by `ProductItem`; it returns `wrapperProps` (event handlers to spread onto the wrapper element) plus `translateX`/`isDragging` for the transform-based drag animation.
