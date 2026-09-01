# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm start` — start the Expo dev server (Metro). Press `i`/`a`/`w` in the terminal, or use the targeted scripts below.
- `npm run ios` / `npm run android` / `npm run web` — start the dev server and open the app in a specific target.
- `npm run lint` — run ESLint via `expo lint` (flat config in `eslint.config.js`, extends `eslint-config-expo`).
- `npm run reset-project` — one-way scaffolding reset: moves `app/`, `components/`, `hooks/`, `constants/`, `scripts/` to `app-example/` and regenerates a blank `app/`. Only run this if the user explicitly asks to blank out the starter template.

There is no test runner and no build/typecheck script configured yet (`tsc` can be run directly via `npx tsc --noEmit` against `tsconfig.json` if needed).

## Architecture

This is an Expo Router (v6) app using the `app/` directory for file-based routing, currently the unmodified `create-expo-app` default template.

- **Routing**: `app/_layout.tsx` is the root `Stack`, wrapping everything in React Navigation's `ThemeProvider` (light/dark switched via `useColorScheme`). It declares two routes: the `(tabs)` group (header hidden) and `modal` (presented as a modal). `unstable_settings.anchor` is set to `(tabs)`, making it the initial route.
- **Tabs**: `app/(tabs)/_layout.tsx` defines the bottom tab navigator (`Home` → `index.tsx`, `Explore` → `explore.tsx`), using `HapticTab` as the custom tab button and `IconSymbol` for icons.
- **Path alias**: `@/*` maps to the project root (configured in `tsconfig.json`), used throughout instead of relative imports.
- **Theming**: `constants/theme.ts` defines the `Colors` (light/dark) and `Fonts` (per-platform) tokens. `hooks/use-theme-color.ts` resolves a color for the current scheme, and `components/themed-text.tsx` / `themed-view.tsx` are the primitives that consume it — prefer these over raw `Text`/`View` when adding UI so light/dark mode keeps working.
- **Platform-specific files**: the `.ios.tsx` / `.web.tsx` suffix convention is in use (e.g. `hooks/use-color-scheme.web.ts`, `components/ui/icon-symbol.ios.tsx`) — Metro picks the right file per platform automatically; add new platform variants the same way rather than branching on `Platform.OS` inside a shared file when the implementations diverge significantly.
- **Icons**: `components/ui/icon-symbol.tsx` wraps SF Symbols on iOS (via `icon-symbol.ios.tsx`) and maps to Material Icons on other platforms — new icon names must be added to the mapping in the non-iOS variant.
- New routes are added simply by creating a file under `app/` (or `app/(tabs)/` for another tab); Expo Router derives the route tree from the file structure, and `experiments.typedRoutes` in `app.json` generates typed route params into `.expo/types/router.d.ts`.

## Session start checklist

At the start of every session, check `bugs.md` and `features.md` in the project root for entries older than 30 days (entry format: `## [YYYY-MM-DD] Title`). If any are found, remind the user about them by name (title + date) before proceeding with other work.
