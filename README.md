# Repair (working title)

Repair is an early, local-first Expo prototype for people navigating relationship difficulties. Its content library is organized into problem-focused modules with assessments, short lessons, exercises, conversation guides, journals and rituals. The app is an educational tool, not therapy, a crisis service, or a validated diagnostic instrument.

> **Internal development only.** The content and safety screen require independent clinical and domestic-violence-specialist review. This prototype must not be publicly released or used to collect real sensitive information in its present form. See [release readiness](docs/release-readiness.md).

## Current capabilities and limitations

The development build includes a local safety check, a relationship check-in, a browsable content library, activity players, a journal and safety resources. Activities and assessments are drafts for review, not approved care. Safety mode takes a conservative approach to restricting relationship activities. The app cannot establish that someone is safe; someone may seek support whether or not a screen is completed.

Release builds currently provide the support screen only: draft activities and the safety check are disabled. Existing device data is not automatically deleted, but it cannot be viewed in the release-build UI. You can request deletion of the local snapshot from Safety & Support; backups and other copies may remain.

The app currently keeps data on the device using AsyncStorage. It has **no application lock or application-level encryption**, and anyone with device access may be able to see stored information or settings. It does not implement accounts, partner pairing, private partner verification, in-app sharing, server sync, or notifications. Opening another app or website does not erase traces or prevent device monitoring. Use only test information while developing.

The Supabase schema is a proposed backend and is not connected to the mobile app. Database policies and tests are development safeguards, not proof that a deployed service or pairing system is ready for use. Do not enable sync without the security, consent, clinical and operational work in the release-readiness checklist.

## Repository layout

```text
apps/mobile/               Expo SDK 58, React Native and Expo Router
packages/content-schema/   Zod schemas and content types
packages/scoring/          Pure assessment scoring and module ranking
content/                   Module activities and global resources in YAML
scripts/build-content.ts   Validates and compiles content for the app
supabase/                  Proposed Postgres schema, migrations and RLS tests
docs/                      Product map, architecture and release checklist
```

## Getting started

Use Node.js **22.13 or newer** and pnpm 10.28.0 (specified in `package.json`).
See the [Expo SDK 58 reference](https://docs.expo.dev/versions/v58.0.0/) for supported runtimes and platforms.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm content:build
pnpm test
pnpm typecheck
pnpm --filter mobile lint
pnpm mobile
```

Expo starts in development mode. Use a compatible development client or simulator to inspect the app. A production web bundle can be checked with `pnpm --filter mobile exec expo export --platform web`; it is not a substitute for native-device testing or release approval.

## Authoring and review

Content lives in `content/modules/<slug>/` and `content/global/`. Each activity is an original YAML file validated against `packages/content-schema`. Follow an existing module's structure; keep IDs unique, references accurate, modes honest, and activities consistent with the module outline. Do not describe a feature as present if the app does not implement it.

Run `pnpm content:build` after edits and commit both the YAML and `apps/mobile/src/content/content.generated.json`. `pnpm content:check` verifies that the bundle is current. `draft` and `in_review` mean the material is unfinished or awaiting review; **neither means a clinician has approved it**. Only mark content `published` after documented specialist review and completion of the relevant release requirements.

## Database tests

Install the PostgreSQL 16 server binaries (`initdb`, `pg_ctl`, `createdb`, and `psql`) and run the tests as a non-root user:

```bash
bash supabase/tests/run.sh
```

The runner starts a disposable socket-only PostgreSQL cluster, ignores existing connection settings, and removes it on exit. It does not connect to an existing server. CI also runs content validation, unit tests, typechecking, mobile lint, a web bundle and the SQL/RLS suite.

See [the content map](docs/content-map.md), [build plan](docs/build-plan.md), and [release-readiness checklist](docs/release-readiness.md) for more context. The older build plan describes planned features as well as delivered work; the running app and this README are authoritative for current functionality.
