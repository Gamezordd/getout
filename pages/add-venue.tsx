import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import PlaceSearch, { PlaceResult } from "../components/PlaceSearch";
import { useAppStore } from "../lib/store/AppStoreProvider";

function AddVenuePage() {
  const store = useAppStore();
  const router = useRouter();
  const sessionId = typeof router.query.sessionId === "string" ? router.query.sessionId : "";
  const [venue, setVenue] = useState<PlaceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    if (!router.isReady || !store.sessionId) return;
    if (store.currentUserId) return;
    router.replace({ pathname: "/join", query: { sessionId: store.sessionId } }, undefined, {
      shallow: true
    });
  }, [router, router.isReady, store.currentUserId, store.sessionId]);

  const handleAddVenue = async () => {
    if (!store.sessionId) {
      setError("Missing session. Open this page from a group link.");
      return;
    }
    if (!venue) {
      setError("Select a venue first.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await store.addManualVenue(venue);
      router.push({ pathname: "/", query: { sessionId: store.sessionId } });
    } catch (err: any) {
      setError(err.message || "Unable to add venue.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-mist px-4 pb-8 pt-6">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-ink">Add manual venue</h1>
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
          <PlaceSearch
            label="Venue"
            placeholder="Search for a specific bar"
            onSelect={(place) => {
              setVenue(place);
              setError(null);
            }}
          />

          {venue && <p className="text-xs text-slate-500">Selected: {venue.address}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="button"
            onClick={handleAddVenue}
            disabled={submitting}
            className="w-full rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "Adding..." : "Add venue"}
          </button>
        </div>
      </div>
    </main>
  );
}

export default observer(AddVenuePage);
