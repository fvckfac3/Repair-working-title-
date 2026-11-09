# Repair mobile app

Expo SDK 58 app using Expo Router (`src/app`). See the repo root README for setup.

- `src/app/(tabs)`: Today, Library, Us, Me
- `src/app/module/[slug].tsx`: module overview, with gating and outline
- `src/app/activity/[id].tsx`: dispatches to the players in `src/features/players`
- `src/app/safety.tsx`: Safety & Support (crisis resources, quick exit)
- `src/content`: the generated content bundle plus helpers. Do not edit the JSON by hand.
- `src/state/store.tsx`: local-first persisted state (private, on device)

```bash
pnpm start        # from this folder, or `pnpm mobile` from the repo root
pnpm typecheck
pnpm lint
```
