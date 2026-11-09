# Repair (working title)

A guided app for couples who are **actively struggling**, not a general relationship-maintenance tool.
It offers assessments, short lessons, guided exercises, structured conversations, private journaling
and daily rituals, and **every activity belongs to a problem-focused module** such as *Calming the
Storm*, *Repairing Trust*, *Healing After Infidelity* or *Exploring Intimacy*.

- **What we teach:** [`docs/content-map.md`](docs/content-map.md) (14 modules, research basis, safety system)
- **How we build it:** [`docs/build-plan.md`](docs/build-plan.md) (architecture, phases, progress)

> Repair is an educational tool, not therapy or a crisis service. All content requires review by a
> licensed couples therapist before it is published.

## Repo layout

```
apps/mobile/              Expo (React Native + TypeScript, Expo Router) app
packages/content-schema/  Zod schemas + types for all content
packages/scoring/         Pure assessment scoring, comparison and module ranking (unit tested)
content/                  The activity library as YAML (modules/<slug>/…, global/…)
scripts/build-content.ts  Validates /content and compiles it into the app's bundle
supabase/                 Postgres schema with row-level security + RLS tests
docs/                     Content map and build plan
```

## Getting started

```bash
corepack enable            # provides pnpm
pnpm install
pnpm content:build         # validate content and regenerate the app bundle
pnpm test                  # scoring + content tests
pnpm mobile                # start Expo (press i / a / w for iOS, Android, web)
```

## Authoring content

1. Edit or add YAML under `content/modules/<slug>/` (activities may be in subfolders such as
   `lessons/`). Each file declares `type:` (`assessment`, `lesson`, `exercise`, `conversation`,
   `journal`, `ritual`). See Module 1, `content/modules/calming-the-storm/`, for complete examples.
2. Run `pnpm content:build`. It checks the schema, unique ids, cross-references, outline titles and
   the minimum content a module needs before its status can move past `draft`.
3. Commit the YAML **and** the regenerated `apps/mobile/src/content/content.generated.json`
   (CI fails if the bundle is stale).

Module `status` goes `draft` → `in_review` (fully authored, awaiting clinical review) → `published`.

## Safety and privacy principles

- Every partner takes a **private safety screen** first. A positive result turns on *safety mode*
  for that person only: together-activities and high-conflict modules are paused, support resources
  are shown, and the partner is never notified.
- User data is **private by default**. Sharing is explicit, per item. Sensitive assessment areas
  (affairs, stay-or-go) are never included in partner comparisons.
- In Supabase, safety data is owner-only by RLS, and partners read shared assessments only through
  a summary view that never exposes raw answers. See `supabase/tests/rls_test.sql`.

## Database tests

```bash
# Against any Postgres 15+ you can create databases on:
PGHOST=localhost PGPORT=5432 PGUSER=postgres supabase/tests/run.sh
```
