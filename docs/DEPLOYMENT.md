# Deployment guide

Three deployables share one Supabase project:

| Piece | Host | Notes |
|---|---|---|
| Postgres, Auth, Storage, Realtime, Edge Functions | Supabase | 18 migrations, 6 functions |
| Mobile app | EAS Build → Play Store (AAB) | Expo SDK 58 (RN 0.88, React 19.3) |
| Organizer/admin console | Vercel (Next.js 16) | Server components + server actions |

---

## 1. Supabase project

```bash
supabase login
supabase projects create arenax --region ap-south-1   # or use the dashboard
supabase link --project-ref <ref>
supabase db push                                       # applies supabase/migrations/*
```

Then:

1. **Auth → Providers**
   - Phone: enable, add Twilio/MSG91. Set OTP length 6.
   - Google: enable, add redirect `arenax://auth-callback` and the Vercel domain callback.
2. **Auth → URL configuration** — add `https://<admin-domain>` and `arenax://auth-callback`.
3. **Storage** — the migrations create `evidence` (private), `avatars` (public), `clips` (public).
   Verify the buckets exist after `db push`; if the project predates the migration, create them
   manually with the same names and limits (5 MB / 2 MB / 25 MB).
4. **Realtime** — enable for `notifications` and `chat_messages` (database → replication).
5. **Functions**

```bash
supabase functions deploy create-tournament
supabase functions deploy publish-room
supabase functions deploy reveal-rooms
supabase functions deploy request-ad-reward
supabase functions deploy verify-play-purchase
supabase functions deploy admob-ssv --no-verify-jwt
```

6. **Secrets**

```bash
supabase secrets set CRON_SECRET=<random>
supabase secrets set EXPO_ACCESS_TOKEN=<expo token>
supabase secrets set ADMOB_ENV=production
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON="$(cat service-account.json)"
supabase secrets set ANDROID_PACKAGE_NAME=com.arenax.app
supabase secrets set VIP_PRODUCT_IDS=arenax_vip_monthly,arenax_vip_yearly
```

7. **Cron** — Supabase Cron (or GitHub Actions) every minute:

```sql
select net.http_post(
  url := 'https://<ref>.supabase.co/functions/v1/reveal-rooms',
  headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>', 'Content-Type', 'application/json'),
  body := '{}'::jsonb
);
```

The worker reveals rooms exactly at `start_time - 10 min`, sends 30/10-minute reminders and is
idempotent (`reveal_notified_at`, notification bucket checks).

---

## 2. Admin console (Vercel)

```bash
cd arenax
npm install
npm run admin:build          # verify locally
```

Vercel project settings:

- Root directory: `arenax/apps/admin`
- Install command: `npm install` (workspace root auto-detected via `package-lock.json`)
- Build command: `npm run build --workspace arenax-admin` (or `next build` inside the app)
- Environment variables:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Create the first admin manually in the SQL editor:

```sql
update public.profiles set role = 'admin' where id = '<your-auth-user-id>';
```

Organizers are approved from `/users` (or `select public.approve_organizer('<uuid>');`).

> The console never uses the service-role key. RLS and the SECURITY DEFINER RPCs gate every action.

---

## 3. Mobile app (EAS)

```bash
cd arenax/apps/mobile
npx eas login
npx eas init                              # writes extra.eas.projectId
npx eas build --platform android --profile preview     # APK for testers
npx eas build --platform android --profile production  # AAB for Play
npx eas submit --platform android
```

`apps/mobile/eas.json` defines the profiles. Required build env:

```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_ADMOB_REWARDED_ANDROID_ID
EXPO_PUBLIC_POSTHOG_KEY        # optional
```

Push notifications need an FCM v1 service account uploaded to Expo (`eas credentials`).

### Web preview (optional)

```bash
npm run --workspace arenax-mobile build:web
npx serve apps/mobile/dist
```

A React Native web build is useful for demos, but AdMob, Play Billing and push are native-only and
degrade gracefully.

---

## 4. Smoke test after deploy

1. Sign in with phone OTP on a physical device.
2. Add a BGMI in-game ID in Profile.
3. Register for a seeded tournament — confirm the slot decrements once.
4. Cancel and confirm the slot returns / waitlist promotion fires.
5. As organizer, publish rooms in the console → verify `revealed_at = start - 10 min`.
6. Wait for the cron minute → confirm in-app notification + push.
7. Submit a result screenshot from two accounts, approve one in the console.
8. Send a chat message; try a blocked word (should be masked).
9. Trigger a duplicate screenshot (same file) → submission becomes `flagged`, report created.
10. Redeem a referral code → both players gain 75 XP.
11. Open `/legal` and verify the free-entry disclaimer.

---

## 5. Rollback

- Mobile: Play Console staged rollout halt.
- Admin: Vercel instant rollback to the previous deployment.
- Database: migrations are forward-only. Take a Supabase daily backup before large schema changes;
  restore via dashboard if needed.
