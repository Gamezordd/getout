# GetOut Meetup Planner

## Setup
1. Install dependencies: `npm install`
2. Create `.env.local` using `.env.local.example` as a template
3. Run the dev server: `npm run dev`

## Notes
- The app uses Mapbox GL JS for rendering and Mapbox Geocoding API for search.
- Suggestions and ETA calculations are in `/api/suggestions` using Google Places + Distance Matrix.
- Suggestions are 4.5+ rated bars with 200+ reviews within 5km of the group centroid, ranked by total drive time.
- Manual venues can be added and are merged into the ranked list.
- Group membership and votes are persisted in Redis via Upstash.
- Realtime updates and voting use Pusher. All members are notified on joins, venue changes, and votes.
- The device that creates the session stores an owner key locally and is the only one allowed to remove users.
