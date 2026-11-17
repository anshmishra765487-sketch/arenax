# ArenaX

Mobile-first esports **tournament organizer** for the Indian market (placeholder brand — rename it in
one file, see [Configuration](#configuration)).

Players compete *inside* third-party games (BGMI, Free Fire, Valorant, COD Mobile) through custom
rooms. ArenaX does not host gameplay. It manages registration, brackets, room ID/password sharing,
result verification, leaderboards and community — plus an organizer console for running it all.

> **Compliance — read this first**
> * Tournaments are **free entry**. There is no wallet, no entry fee, no deposit/withdrawal and no
>   real-money gaming.
> * Prize pools are **sponsor-funded only**.
> * `Independent tournament platform. Not affiliated with or endorsed by Krafton, Garena, Riot Games or any game publisher.`
> * No scraping and no unofficial publisher APIs. Results come from organizer-verified screenshots.
> * 18+ gate language and parental-consent notes ship in the app (`/legal`).

---

## Status — Phases 1–6 implemented

| Phase | Scope | State |
|---|---|---|
| 1 | Monorepo, schema + RLS, auth (phone OTP + Google), profiles, tournaments, server-side registration, room lockdown | ✅ |
| 2 | Waitlist, room publish + cron reveal, push tokens, notification inbox, announcements, reminders | ✅ |
| 3 | Brackets (SE/DE/RR/BR scoring), results + duplicate-evidence detection, disputes, strikes/trust, leaderboards, XP/achievements | ✅ |
| 4 | Next.js organizer/admin console: rooms, brackets, results, users, moderation, sponsors, analytics | ✅ |
| 5 | Rewarded ads (AdMob SSV), VIP via Google Play Billing (cosmetic), sponsor analytics, rate limiting | ✅ |
| 6 | Chat, clips, scrims, referrals, streams, team invite codes, offline cache, analytics, legal screens, Play Store checklist | ✅ |

**Not yet verified with real credentials:** AdMob SSV, Play Billing, Expo push and EAS builds need
Google/Expo accounts. The code paths exist and fail closed, but they must be smoke-tested before
release. See [Known limitations](#known-limitations).

---

## Repo layout

```
arenax/
├── apps/
│   ├── mobile/              Expo (React Native) app — Expo Router + NativeWind + TS
│   └── admin/               Next.js 16 organizer/admin console (server actions)
├── packages/
│   ├── config/              @arenax/config — product config (brand, games, rules, legal copy)
│   └── core/                @arenax/core — pure bracket/points/scheduler/moderation logic + tests
├── supabase/
│   ├── migrations/          18 ordered migrations (schema, RLS, RPCs, storage, hardening)
│   └── functions/           create-tournament, publish-room, reveal-rooms, request-ad-reward,
│                            admob-ssv, verify-play-purchase
├── scripts/seed-demo.mjs    Demo organizer + tournaments
└── docs/
    ├── DEPLOYMENT.md        Supabase → Vercel → EAS, secrets, cron, smoke tests
    └── PLAY_STORE_CHECKLIST.md
```

---

## Prerequisites

- Node.js ≥ 20.9 (Next.js 16 requirement) and npm 10+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (or a hosted Supabase project)
- Expo Go on your phone (latest SDK 58) for JS-only screens, or Android Studio / EAS for a dev build
  (AdMob and Play Billing are native-only and need a dev build)
- For real phone OTP: an SMS provider (Twilio / MSG91) configured in Supabase Auth

---

## Quickstart

### 1. Install

```bash
cd arenax
npm install
```

### 2. Start Supabase (local)

```bash
supabase start
```

This prints `API URL`, `anon key` and `service_role key`. Copy them into env files:

```bash
cp .env.example apps/mobile/.env
cp .env.example apps/admin/.env.local
cp .env.example supabase/functions/.env
```

`apps/mobile/.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

`apps/admin/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

> The service-role key is only used by scripts and edge functions. **Never** put it in
> `EXPO_PUBLIC_*` or `NEXT_PUBLIC_*`.

### 3. Apply the schema

```bash
supabase db reset          # runs every migration in supabase/migrations
```

Hosted project:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

### 4. Seed demo content (optional)

```powershell
$env:SUPABASE_URL="http://127.0.0.1:54321"
$env:SUPABASE_SERVICE_ROLE_KEY="<service_role key>"
npm run supabase:demo
```

Creates organizer `organizer@arenax.demo` / `ArenaX!demo123` and three free tournaments.

### 5. Run the apps

```bash
npm run mobile          # Expo dev server → press "a" or scan the QR
npm run admin           # Next.js console on http://localhost:3001
```

Promote yourself to admin (SQL editor):

```sql
update public.profiles set role = 'admin' where id = '<auth-user-id>';
```

### 6. Phone OTP

Supabase dashboard → **Authentication → Providers → Phone** → enable + add your SMS provider.
Locally, Supabase prints the test OTP in the CLI logs when no provider is configured.

Google sign-in: enable the Google provider and add `arenax://auth-callback` as a redirect URL.

---

## What each phase delivers

### Phase 1 — Foundation
Tournament browser and detail, countdowns, server-locked registration, in-game ID verification,
room credentials hidden until reveal time by RLS, profile onboarding, notifications.

### Phase 2 — Lifecycle
Waitlist auto-promotion on cancellation, room publishing with server-derived `revealed_at`,
`reveal-rooms` cron worker (10-minute reveal + 30/10-minute reminders), Expo push tokens,
notification inbox with realtime updates, organizer announcements, local calendar/reminders.

### Phase 3 — Competition
Single elimination, double elimination, round robin and battle-royale scoring in `@arenax/core`
(unit-tested). Result screenshot uploads hashed with SHA-256, duplicate evidence auto-flagged,
disputes, reports, strikes and trust scores, leaderboards, XP/levels, achievements, daily login.

### Phase 4 — Console
`apps/admin`: organizer login, overview stats, tournament creation, room publishing, registration
lists, bracket generation + match advancement, result review, battle-royale result publication,
user bans/strikes/organizer approvals, dispute/report resolution, sponsor management.

### Phase 5 — Monetisation (cosmetic only)
Rewarded ad claims created server-side and only marked rewarded by AdMob's signed SSV callback;
`redeem_ad_reward` books a free slot. VIP subscriptions verified against the Google Play API
(`verify-play-purchase`); only the purchase token is stored. Sponsor impressions/clicks tracked
server-side. Persistent rate limiter for edge functions.

### Phase 6 — Community & polish
Tournament chat with server-side profanity filtering and mutes, clips with likes and moderation,
scrim finder, referrals (+75 XP), live stream links, team invite codes, offline cache + upload
outbox, analytics wrapper, legal/fair-play/publisher-rules screens, Play Store checklist.

---

## Configuration

Everything product-level lives in **`packages/config/src/arena.config.ts`**:

- app name / slug / tagline (rename ArenaX here)
- supported games, publishers, in-game ID regex
- modes, battle-royale point table defaults
- room reveal (10 min) and registration close (15 min) windows
- limits (image size/type, daily ad claims, trust score floor)
- legal copy, disclaimer, 18+ notes
- brand colors

The database mirrors the critical time windows server-side. Config values are used for UI copy and
client-side pre-validation only — never as the enforcement layer.

---

## Security model

| Risk | Control |
|---|---|
| Client fakes registration / exceeds slots | `registrations` has **no insert/update policy**; only `join_tournament()` (SECURITY DEFINER) writes, with `SELECT … FOR UPDATE` slot locking |
| Client reads room details early | `room_details` RLS requires a confirmed registration **and** `now() >= revealed_at`, evaluated on the DB clock |
| Organizer backdates reveal | `room_details_set_reveal` trigger overwrites `revealed_at` from `tournaments.start_time` |
| Organizer edits someone else's tournament | RLS `auth.uid() = organizer_id`; admins have explicit policies |
| Player escalates own role | `prevent_role_self_escalation` trigger |
| Fake in-game ID at registration | `join_tournament()` copies the UID from `game_accounts`, never from the request |
| RLS recursion on teams | membership checks go through SECURITY DEFINER helpers |
| Service RPCs callable by clients | `20260107000001_hardening.sql` revokes PUBLIC/anon EXECUTE from trigger/server-only functions |
| Reused result screenshots | SHA-256 hash trigger flags duplicates, opens a report, reduces trust |
| Ad reward farming | Claims are request → AdMob SSV → redeem; daily cap + rate limiter; client cannot mark rewarded |
| Fake VIP purchases | Play API verification with service account; unique purchase token |
| Ban evasion / abuse | Trust gate (≥ 60), strikes, `device_hash` column for future clustering |
| Chat abuse | Server-side `chat_filter()`, organizer mutes, report flow |

Public data is exposed only through `public.public_profiles` (no phone, ban reason or device hash).

---

## Database

Core: `profiles`, `games`, `game_accounts`, `teams`, `team_members`, `tournaments`, `registrations`,
`room_details`, `notifications`, `push_tokens`, `announcements`.

Competition: `tournament_rounds`, `matches`, `result_submissions`, `disputes`, `reports`, `strikes`,
`leaderboards`, `achievements`, `user_achievements`.

Monetisation: `sponsors`, `sponsor_tournaments`, `sponsor_events`, `ad_reward_claims`,
`subscriptions`, `rate_limits`.

Community: `chat_messages`, `chat_mutes`, `clips`, `clip_likes`, `scrims`, `scrim_applications`,
`referrals`, `streams`, `admin_audit_log`.

Key RPCs: `join_tournament`, `cancel_registration`, `advance_bracket`, `publish_br_result`,
`review_result`, `claim_daily_login`, `redeem_ad_reward`, `is_vip`, `send_chat_message`,
`mute_chat_user`, `toggle_clip_like`, `redeem_referral`, `join_team_by_code`, `ban_user`,
`unban_user`, `issue_strike`, `approve_organizer`, `resolve_dispute`, `resolve_report`,
`admin_dashboard_stats`.

---

## Tests

```bash
npm test
```

- `packages/core` (Vitest): seeding, single/double elimination structure, byes, round-robin pairing,
  battle-royale placement/kill scoring and tiebreaks, schedule packing, profanity filter.
- `apps/mobile` Jest is wired with `--passWithNoTests`; component tests are not written yet.

Type checking:

```bash
npm run typecheck     # mobile + admin
```

### Local verification (this checkout)

| Check | Command | Result |
|---|---|---|
| Core unit tests | `npm run test --workspace @arenax/core` | ✅ 20/20 passing (2 files) |
| Mobile typecheck | `npm run typecheck --workspace arenax-mobile` | ✅ clean |
| Admin typecheck | `npm run typecheck --workspace arenax-admin` | ✅ clean |
| Admin production build | `npm run build --workspace arenax-admin` | ✅ Next.js 16.4.6, all routes compiled |
| Mobile web export | `npm run --workspace arenax-mobile build:web` | ✅ 1671 modules bundled to `dist/` |

A **dev build** (`npx expo run:android` or EAS) is required to exercise AdMob, Play Billing and native
push. Expo Go can open every other screen.

---

## Documentation

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Supabase, Vercel, EAS, secrets, cron, smoke tests
- [`docs/PLAY_STORE_CHECKLIST.md`](docs/PLAY_STORE_CHECKLIST.md) — listing, data safety, ads,
  subscriptions, UGC moderation, review notes

---

## Known limitations

- **Credentials required to verify:** AdMob SSV, Google Play Billing, Expo push and EAS builds are
  implemented but untested without real Google/Expo accounts. They fail closed (no free rewards, no
  VIP without verification).
- **Theme:** dark theme is fully wired; the light/low-end theme toggle is only partially wired.
- **Age gate:** 18+ language and parental consent are in `/legal`; a mandatory first-run DOB gate is
  still recommended before public release.
- **Account deletion:** handled manually via support email; add a self-serve flow before scale.
- **Bracket editing:** regeneration replaces existing matches — do it before you publish results.
- **Package versions:** pinned to Expo SDK 58 (React Native 0.88 / React 19.3) and Next.js 16.4
  (React 19.3). Dependencies install and typecheck locally — see Verification below.

---

## GitHub upload & live link

The project lives in `arenax/` and now has its **own local git repository** with an initial commit
(`ArenaX: free-entry esports tournament organizer (phases 1-6)`). It is deliberately separate from
any unrelated repository that may sit in a parent folder.

To publish it:

```bash
cd arenax
git remote add origin https://github.com/<your-username>/arenax.git
git push -u origin main
```

Create the empty `arenax` repository on GitHub first (no README, no `.gitignore`). If the remote is
already configured, just `git push -u origin main`. Never point `origin` at an unrelated project.

Live links need hosting accounts:

- **Admin console (recommended live link):** import the `arenax` repo in Vercel, set the root
  directory to `apps/admin`, add the two `NEXT_PUBLIC_SUPABASE_*` variables → you get a public URL.
- **Mobile app:** React Native has no website. Build an APK with EAS
  (`npx eas build -p android --profile preview`) and share the install link, or export the web build
  (`npm run --workspace arenax-mobile build:web`) for a demo.
  Push, ads and Play Billing only work in a native build.
