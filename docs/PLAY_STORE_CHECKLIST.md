# Play Store release checklist — ArenaX

ArenaX is a **free-entry** tournament organizer. It is not a real-money gaming app: there is no
wallet, no entry fee, no deposit/withdrawal and no cash-out. Prizes are sponsor-funded and delivered
by organizers. Keep this true — it is the core compliance assumption of the store listing.

---

## 1. App identity

- [ ] Application ID: `com.arenax.app` (see `apps/mobile/app.json` → `android.package`)
- [ ] Version code bumped (`android.versionCode`) and version name set (`version`)
- [ ] App name, icon (512×512 PNG), feature graphic (1024×500), phone screenshots (min 4)
- [ ] Short description ≤ 80 chars, full description ≤ 4000 chars, no publisher logos you don't own
- [ ] Category: **Sports** or **Games → Other** (pick one and be consistent)
- [ ] Contact email (`support@arenax.gg`) + privacy policy URL

## 2. Store listing copy guardrails

- [ ] State clearly: "Free to enter. No entry fees, no wallet, no cash prizes paid by ArenaX."
- [ ] Do not imply publisher endorsement: include the disclaimer
      "Not affiliated with or endorsed by Krafton, Garena, Riot Games or any game publisher."
- [ ] Do not use the words "bet", "wager", "real money", "cash out", "deposit".
- [ ] If sponsor prizes are physical or voucher-based, say so and who fulfils them.

## 3. Data safety form

Declare the following (matches the actual schema):

| Data | Collected | Shared | Purpose |
|---|---|---|---|
| Phone number | Yes (OTP) | No (processed by Supabase/SMS provider) | Account, auth |
| Email (Google sign-in) | Optional | No | Account, auth |
| Name / username | Yes | Public (username only) | Profile, leaderboards |
| Photos/videos | Yes (evidence, clips) | Evidence: organizer + admins only | Fair play, highlights |
| App activity / analytics | Optional (PostHog) | No | Product analytics |
| Device or other IDs | Push token, optional device hash | No | Notifications, anti-abuse |
| Purchase history | Subscription token only (no card data) | Google Play | VIP entitlement |

- [ ] Data is encrypted in transit (TLS) — yes, Supabase + HTTPS
- [ ] Users can request deletion — document the support email flow
- [ ] No data sold

## 4. Ads & purchases

- [ ] "Contains ads" = **Yes** (rewarded ads are optional but present)
- [ ] AdMob app ID in `app.json` replaced from Google's test ID
      (`ca-app-pub-3940256099942544~3347511713` is the test ID — do not ship it)
- [ ] AdMob SSV callback configured → `https://<project>.supabase.co/functions/v1/admob-ssv`
- [ ] "In-app purchases" = **Yes** (VIP subscriptions, cosmetic only)
- [ ] Play Billing products created: `arenax_vip_monthly`, `arenax_vip_yearly`
- [ ] `VIP_PRODUCT_IDS`, `ANDROID_PACKAGE_NAME`, `GOOGLE_SERVICE_ACCOUNT_JSON` set as function secrets
- [ ] Subscription disclosure: price, billing period, auto-renew, cancel path (Play Store)
- [ ] No pay-to-win language; VIP never changes match outcomes

## 5. Permissions justification

| Permission | Why | Notes |
|---|---|---|
| `POST_NOTIFICATIONS` | Match start + room reveal alerts | Ask contextually, not on first launch |
| `READ_MEDIA_IMAGES` / photo picker | Upload result screenshots, clips, avatar | Use the system photo picker where possible |
| `CAMERA` | Optional clip/avatar capture | Only request when the user taps capture |
| Calendar (iOS) | "Add to calendar" is user-initiated (`createEventInCalendarAsync`) | No broad calendar read |

- [ ] Remove unused permissions from the merged manifest (`expo-application` etc. are fine)
- [ ] `SCHEDULE_EXACT_ALARM` is **not** used; local reminders use standard notifications

## 6. Content & UGC policy

Chat, clips, team names and avatars are user-generated content. Play requires moderation and
reporting for UGC apps.

- [ ] In-app profanity filter (client + `chat_filter()` server-side) — implemented
- [ ] Report flow for players (`reports` table + moderation console) — implemented
- [ ] Organizer/admin can mute chat users (`mute_chat_user`) — implemented
- [ ] Clips are `pending` until approved; admins can reject — implemented
- [ ] Blocking: players can leave teams and organizers can remove registrations; add per-player
      blocking before a wide launch if chat volume grows
- [ ] Terms of use and fair-play policy visible in-app (`/legal`) — implemented

## 7. Age rating & audience

- [ ] Complete the IARC questionnaire. Expect **Teen / 13+** due to online chat + ads.
- [ ] Declare an 18+ gate in-app (currently: copy + parental-consent note in `/legal`).
      If you target under-18s, add a real DOB gate before publishing.
- [ ] Do **not** opt into "Designed for Families".
- [ ] If you keep the 18+ rule, add a first-run age confirmation screen (recommended before launch).

## 8. Real-money gaming / contests (India)

- [ ] Legal review of state-wise skill-gaming rules. Free entry with sponsor prizes is the safest
      posture; never add paid entry without a lawyer.
- [ ] No "cash prize" wording if prizes are vouchers/gear.
- [ ] Keep the sponsor-funded prize description in the listing and in-app.
- [ ] If you later add paid entry, the app must move out of "free" positioning and may require a
      different distribution strategy in some Indian states — treat as a separate product decision.

## 9. Account & data controls

- [ ] Account deletion request path documented (`support@arenax.gg`) and actioned within 30 days
- [ ] Data deletion removes: profile, game accounts, registrations, chat, clips, push tokens
- [ ] Evidence screenshots purged after dispute resolution window (define e.g. 90 days)
- [ ] Privacy policy URL live and reachable without login

## 10. Technical release checks

- [ ] `npm run typecheck` clean for mobile + admin
- [ ] `npm run test` green (`@arenax/core` bracket/points/scheduler tests)
- [ ] Supabase migrations applied to production (`supabase db push`)
- [ ] RLS verified with a non-admin test account (cannot read others' evidence, cannot join after cutoff)
- [ ] Edge functions deployed: `create-tournament`, `publish-room`, `reveal-rooms`,
      `request-ad-reward`, `admob-ssv` (`--no-verify-jwt`), `verify-play-purchase`
- [ ] Cron job calls `reveal-rooms` every minute with `x-cron-secret`
- [ ] Push notifications tested on a physical Android device (Expo push token stored)
- [ ] Offline behaviour: tournament list loads from cache; result upload queues
- [ ] Low-end device test (2 GB RAM): no crashes on tournament detail + chat
- [ ] Crash reporting enabled (Sentry or Play Console vitals) — add before launch
- [ ] Signed AAB via EAS, uploaded to **Internal testing** first

## 11. Store review notes (paste into "Notes for reviewers")

```
ArenaX runs free-entry esports tournaments. No entry fee, wallet, deposit or cash-out exists.
Sign-in uses phone OTP (test number: +91XXXXXXXXXX / OTP 123456) or Google.
Result screenshots are uploaded by players and reviewed by organizers.
Rewarded ads are optional and only grant a free tournament slot after AdMob server-side
verification. VIP is a cosmetic subscription processed by Google Play Billing.
Test tournament ID: <uuid> (upcoming, free, 8 slots).
```

Provide a working test account and an upcoming tournament in the review notes. Reviewers cannot
create tournaments without organizer approval.

## 12. Post-launch

- [ ] Play Console vitals + ANR monitoring
- [ ] AdMob policy centre: no invalid traffic
- [ ] Monthly review of reports/disputes SLA (48h)
- [ ] Rotate `CRON_SECRET` and service account keys quarterly
- [ ] Keep sponsor contracts and prize fulfilment receipts for audits
