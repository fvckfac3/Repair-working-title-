# Repair mobile prototype

Expo SDK 58 and Expo Router power this local-first development prototype. See the [root README](../../README.md) for setup and the [release-readiness checklist](../../docs/release-readiness.md) for required clinical, safety, privacy and security work.

- `src/app/(tabs)`: Today, Library, Us and Me.
- `src/app/module/[slug].tsx`: module overview and entry checks.
- `src/app/activity/[id].tsx`: routes to the activity players in `src/features/players`.
- `src/app/safety.tsx`: support information and resource links.
- `src/content/`: generated content bundle and lookup helpers. Edit YAML, not the generated JSON.
- `src/state/`: local device state and persistence.

The development preview uses unreviewed draft content. It must not be publicly released or used for sensitive data. AsyncStorage is not application-level encryption and the prototype has no app lock, separate accounts, pairing or in-app sharing. Device access or monitoring can expose local information; navigation away from the app does not erase traces.

```bash
pnpm start       # from this folder; or run `pnpm mobile` at the root
pnpm typecheck
pnpm lint
```
