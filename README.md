# GetOut Meetup Planner

## Setup

1. Install dependencies: `npm install`
2. Create `.env.local` using `.env.local.example` as a template
3. Run the dev server: `npm run dev`

## Notes

- The app uses Mapbox GL JS for rendering and Mapbox Geocoding API for search.
- Suggestions and ETA calculations are in `/api/suggestions` using Google Places + Distance Matrix.
- Suggestions are 4.5+ rated bars with 200+ reviews within 5km of the group centroid, ranked by total drive time.
- Suggested place cards can be enriched asynchronously with Gemini-powered review characteristics; enrichment is cached by Google place id and batched to minimize Gemini calls.
- Production AI enrichment runs through a Vercel Queue consumer configured in `vercel.json`, so long-running Gemini/review work is durable on Vercel.
- Manual venues can be added and are merged into the ranked list.
- Group membership and votes are persisted in Redis via Upstash.
- Realtime updates and voting use Pusher. All members are notified on joins, venue changes, and votes.
- The device that creates the session stores an owner key locally and is the only one allowed to remove users.

## Capacitor Android shell

1. Set `CAPACITOR_SERVER_URL` to the deployed Next.js app URL that serves this project.
2. Run `npm run cap:sync`.
3. Run `npm run cap:android` to open the Android project.

The Android manifest is configured as a share target for `text/plain`. When a user shares a Google Maps link into the app, the native shell routes it into `/add-venue`, resolves the link to a place via `/api/resolve-shared-place`, and lets the user add it through the existing manual venue flow.

## Mobile Google sign-in

- Mobile auth uses Google Sign-In on Android and stores app users + sessions in Neon Postgres.
- Set `DATABASE_URL` and `GOOGLE_AUTH_SERVER_CLIENT_ID` in your environment.
- For Android builds, also provide `GOOGLE_AUTH_SERVER_CLIENT_ID` to Gradle or add `google.auth.serverClientId=...` to `android/local.properties`.
- Web keeps the existing anonymous/open flow; only the native app shows Google sign-in.

## Android FCM invite notifications

- Invite notifications now use FCM for authenticated Android app users and keep Web Push for browser users.
- Add `android/app/google-services.json` from your Firebase project before running Android builds.
- Set `FIREBASE_SERVICE_ACCOUNT_JSON` on the server so the Next.js API can send FCM messages.
- Android notification taps deep-link into `/join?sessionId=...` inside the Capacitor app.
