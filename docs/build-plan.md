# Repair: Build Plan

## Part 5: Technical architecture

### Stack
- **App:** Expo (latest SDK), TypeScript, Expo Router (file-based navigation), TanStack Query (server state, once sync lands); local-first state currently lives in a small React context store (`apps/mobile/src/state/store.tsx`), React Hook Form + Zod, Reanimated (card swipes), expo-notifications, expo-secure-store, expo-local-authentication (app lock), AsyncStorage (offline persistence today; MMKV or encrypted storage later).
- **Backend:** Supabase. Auth (email, Apple and Google), Postgres with RLS, Realtime (synced conversation guides and partner presence), Edge Functions (pairing invites, scoring, notifications, crisis detection), Storage (illustrations and audio).
- **Payments:** RevenueCat (subscriptions). **Analytics:** PostHog, privacy-respecting with no journal content. **Errors:** Sentry.
- **Testing:** Vitest (scoring and content logic), React Native Testing Library, Maestro (E2E mobile flows).

### Content-as-code
All module content lives in the repo as validated files, so it can be versioned and reviewed by the clinical advisor through PRs:
```
content/
  modules/<slug>/module.yaml          # title, tier, description, order, gating, intensity
  modules/<slug>/assessment.yaml      # items, scales, scoring, bands, recommendations
  modules/<slug>/lessons/*.yaml       # cards + takeaway question
  modules/<slug>/exercises/*.yaml     # step definitions (input types)
  modules/<slug>/conversations/*.yaml # turns, prompts, timers, rules
  modules/<slug>/journal.yaml
  modules/<slug>/ritual.yaml
  global/onboarding-health-check.yaml, safety-screen.yaml, checkins.yaml
packages/content-schema/              # Zod schemas + TS types shared by app & scripts
scripts/build-content.ts              # validate + compile to apps/mobile/src/content/content.generated.json
```
The app loads content from Supabase, caches it offline, and falls back to the bundled copy on first run.

### Repo layout (monorepo, pnpm workspaces)
```
apps/mobile/              # Expo app
  app/(auth)/ (onboarding)/ (tabs)/today|library|us|profile
  app/module/[slug]/  app/activity/[type]/[id]
  src/features/{assessment,lesson,exercise,conversation,journal,checkin,ritual,pairing,safety}
  src/components/ src/lib/{supabase,scoring,notifications}
packages/content-schema/  packages/scoring/   # pure TS, unit tested
content/  supabase/migrations/  supabase/functions/
docs/content-map.md       # Part 2 of this plan, kept as the source of truth
```

### Data model (Supabase)
- `profiles` (user_id, display_name, pronouns, safety_mode bool [readable only by the user], settings)
- `couples` (id, created_at, status) · `couple_members` (couple_id, user_id, role, joined_at) · `pair_invites` (code, inviter, expires_at)
- `content_modules`, `content_items` (id, module_slug, type, version, body jsonb), synced from the repo
- `assessment_responses` (user_id, item_id, answers jsonb, scores jsonb, visibility, taken_at)
- `activity_progress` (user_id, couple_id, item_id, status, step, completed_at)
- `journal_entries` (user_id, prompt_id, body encrypted, visibility)
- `conversation_sessions` (couple_id, guide_id, state jsonb, turn, started_at), using Realtime
- `checkins` (user_id, couple_id, kind daily|weekly, values jsonb, note, visibility)
- `safety_screens` (user_id, result, created_at). RLS: **owner-only, no couple access, ever**.
- RLS rule: a row is visible to a partner only if `visibility != 'private'` AND both users share an active couple.

### Key engines
- **Scoring engine** (`packages/scoring`): reverse-scored items, subscale sums or means, severity bands, a recommendation map, and a partner comparison (gap analysis that highlights differences above a threshold).
- **Recommendation engine:** onboarding scores feed a module priority list (rules-based weighting, with safety mode overriding everything). It powers the "Today" tab: one suggested activity per day, mixing solo and together.
- **Conversation player:** a state machine of turns. The two phones sync through Realtime channels, or the couple passes a single phone back and forth. It includes a "flooding: take 20" pause that starts a break timer and schedules a resume nudge.

---

## Part 6: Build phases

**Phase 0: Setup (week 1)**
- Initialize the pnpm monorepo, the Expo app (TS, Expo Router), ESLint/Prettier, and Vitest. Add CI with GitHub Actions (typecheck, lint, test, validate-content).
- Create the Supabase project and write the first migrations. Commit `docs/content-map.md` containing Part 2.

**Phase 1: Foundation (weeks 2–4)**
- Auth, profiles and onboarding. Pairing (invite code or link via Edge Function), plus solo mode.
- The content schema, validator, sync script and offline cache.
- Tabs: Today / Library / Us / Profile. Module list and module detail screens.

**Phase 2: Activity players (weeks 4–7)**
- Assessment player plus the scoring package (unit tested), with a results screen and a partner comparison view.
- Lesson card player; exercise step renderer (text, list, ranking, slider, card sort, timer); journal with privacy controls.
- Conversation guide player (single-device first, then realtime two-device). Check-ins and trend charts. Ritual scheduler with notifications.

**Phase 3: Safety system (weeks 6–8, runs in parallel)**
- Private safety screen and safety mode. Quick exit, app lock, crisis resources, crisis keyword detection, severity-based therapist prompts.
- An RLS test suite proving that private and safety data can never be read by the partner.

**Phase 4: Launch content (weeks 6–10)**
- Write and clinically review **Modules 1, 2, 3, 4 and 7** in full, plus the onboarding health check. These five cover the most common presenting problems.
- Illustrations and audio narration for lessons.

**Phase 5: Remaining modules (weeks 10–16)**
- Modules 5 (with its gating flow), 6, 8 (with the mutual-match reveal), 9, 10, 11, 12, 13 and 14.

**Phase 6: Engagement & monetization (weeks 12–16)**
- Recommendation engine for the Today tab, streaks and milestones, push notifications.
- RevenueCat paywall. Suggested split: free access to Module 1, the onboarding assessment, check-ins and safety resources (safety is never paywalled); premium for the full library.
- PostHog events and Sentry.

**Phase 7: Beta (weeks 16–20)**
- TestFlight and Play internal testing with 20–50 couples. Therapist-referred beta testers if possible.
- Iterate, write the privacy policy and terms, then submit to the app stores.

---

## Verification
- **Unit:** `pnpm test`. Covers the scoring package (reverse items, bands, comparisons), content schema validation, and the recommendation rules.
- **Content:** `pnpm validate-content` in CI. Every module must have ≥1 assessment, ≥4 lessons, ≥3 exercises and ≥2 conversation guides, and all cross-references must resolve.
- **Security:** a SQL/RLS test suite (pgTAP or a Supabase test script) that logs in as partner B and asserts no access to A's private journals, safety screens or private assessments.
- **E2E (Maestro):** onboarding → pair two accounts → take an assessment → complete a lesson → run a two-device conversation guide → trigger safety mode and confirm that partner B's view is unchanged and gets no notification.
- **Manual:** `npx expo start` on iOS simulator and Android emulator. Walk through Module 1 end to end on both platforms.
- **Clinical sign-off:** the LMFT advisor approves each module before it is marked `published` in `module.yaml`.

## Progress

- [x] Phase 0: monorepo, Expo app, CI, Supabase migration, content map
- [x] Content-as-code pipeline: Zod schema (`packages/content-schema`), validator/compiler (`scripts/build-content.ts`)
- [x] Scoring engine with unit tests (`packages/scoring`)
- [x] Supabase schema with RLS + regression tests (`supabase/tests`)
- [x] Activity players: assessment, lesson, exercise, conversation (single device), journal, ritual
- [x] Safety system v1: private screen, safety mode, quick exit, crisis resources, module gating
- [x] Module 1 *Calming the Storm* authored; Modules 2–14 outlined
- [ ] Auth + Supabase sync + partner pairing UI (schema and RPCs are ready)
- [ ] Two-device realtime conversation guides
- [ ] Partner result comparison UI (`compareResults` is implemented and tested)
- [ ] App lock, encrypted journal at rest, crisis keyword detection
- [ ] Author Modules 2, 3, 4, 7 → clinical review → publish
- [ ] Notifications, RevenueCat, PostHog, Sentry
- [ ] Beta
