import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import PlaceSearch, { PlaceResult } from "../components/PlaceSearch";
import { useAppStore } from "../lib/store/AppStoreProvider";
import type { VenueCategory } from "../lib/types";

const CATEGORY_OPTIONS: Array<{ value: VenueCategory; label: string }> = [
  { value: "bar", label: "Bars" },
  { value: "restaurant", label: "Restaurants" },
  { value: "cafe", label: "Cafes" },
  { value: "night_club", label: "Night clubs" },
  { value: "brewery", label: "Breweries" }
];

function JoinPage() {
  const store = useAppStore();
  const router = useRouter();
  const sessionId = typeof router.query.sessionId === "string" ? router.query.sessionId : "";
  const addUser = router.query.addUser === "1";
  const [name, setName] = useState("");
  const [location, setLocation] = useState<PlaceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    if (!sessionId) {
      router.replace({ pathname: "/create" }, undefined, { shallow: true });
      return;
    }
    store.setSession(sessionId, "/");
  }, [router, router.isReady, sessionId, store]);

  useEffect(() => {
    if (!sessionId) return;
    store.loadGroup();
  }, [sessionId, store]);

  const handleJoin = async () => {
    if (!store.sessionId) {
      setError("Missing session. Open this page from a group link.");
      return;
    }
    if (!name.trim()) {
      setError("Add your name to join.");
      return;
    }
    if (!location) {
      setLocationError("Pick a planning location to join.");
      return;
    }
    if (!store.venueCategory) {
      await store.loadGroup();
    }

    try {
      setSubmitting(true);
      setError(null);
      await store.joinGroup(name.trim(), location.location, undefined, {
        preserveCurrentUser: addUser
      });
      router.push({ pathname: "/", query: { sessionId: store.sessionId } });
    } catch (err: any) {
      setError(err.message || "Unable to join group.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-mist px-4 pb-8 pt-6">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-ink">Join this group</h1>
          <button
            type="button"
            onClick={() => router.push({ pathname: "/", query: sessionId ? { sessionId } : {} })}
            className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Go back"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4">
              <path
                fillRule="evenodd"
                d="M12.707 4.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l3.293 3.293a1 1 0 11-1.414 1.414l-5-5a1 1 0 010-1.414l5-5a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-semibold text-ink">Your name</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Type your name"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
            />
          </div>

          <p className="rounded-xl bg-slate-100 px-4 py-3 text-xs text-slate-600">
            Category for this group:{" "}
            <span className="font-semibold text-ink">
              {CATEGORY_OPTIONS.find((option) => option.value === store.venueCategory)?.label || "Bars"}
            </span>
          </p>

          <PlaceSearch
            label="Your planning location"
            placeholder="Search for your neighborhood"
            onSelect={(place) => {
              setLocation(place);
              setLocationError(null);
              setError(null);
            }}
          />

          {location && <p className="text-xs text-slate-500">Selected: {location.address}</p>}
          {locationError && <p className="text-xs text-red-600">{locationError}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="button"
            onClick={handleJoin}
            disabled={submitting}
            className="w-full rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "Joining..." : "Join group"}
          </button>
        </div>
      </div>
    </main>
  );
}

export default observer(JoinPage);
