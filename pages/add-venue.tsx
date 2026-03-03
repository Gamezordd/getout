import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import PlaceSearch, { PlaceResult } from "../components/PlaceSearch";
import { useAppStore } from "../lib/store/AppStoreProvider";

function AddVenuePage() {
  const store = useAppStore();
  const router = useRouter();
  const sessionId =
    typeof router.query.sessionId === "string" ? router.query.sessionId : "";
  const [venues, setVenues] = useState<PlaceResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const organizerLocation = useMemo(() => {
    const organizer = store.users.find((user) => user.isOrganizer);
    return organizer?.location;
  }, [store.users]);

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
    router.replace(
      { pathname: "/join", query: { sessionId: store.sessionId } },
      undefined,
      {
        shallow: true,
      },
    );
  }, [router, router.isReady, store.currentUserId, store.sessionId]);

  const handleAddVenue = async () => {
    if (!store.sessionId) {
      setError("Missing session. Open this page from a group link.");
      return;
    }
    if (venues.length === 0) {
      setError("Select at least one venue.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      for (const place of venues) {
        // Add sequentially to surface the first failing venue.
        await store.addManualVenue(place);
      }
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
            onClick={() =>
              router.push({
                pathname: "/",
                query: sessionId ? { sessionId } : {},
              })
            }
            className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Go back"
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
              className="h-4 w-4"
            >
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
            clearOnSelect
            locationBias={
              organizerLocation
                ? {
                    lat: organizerLocation.lat,
                    lng: organizerLocation.lng,
                    radiusKm: 40,
                  }
                : undefined
            }
            onSelect={(place) => {
              setVenues((current) => {
                if (current.some((item) => item.id === place.id)) {
                  return current;
                }
                return [...current, place];
              });
              setError(null);
            }}
          />

          {venues.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 max-h-[45vh] overflow-y-auto">
              <p className="text-base font-semibold text-ink">
                Selected venues ({venues.length})
              </p>
              <div className="space-y-2">
                {venues.map((place) => (
                  <div
                    key={place.id}
                    className="flex items-start justify-between gap-3 rounded-xl bg-white px-3 py-2 shadow-sm"
                  >
                    <div>
                      <p className="text-base font-semibold text-ink">
                        {place.name}
                      </p>
                      {place.address && (
                        <p className="text-base text-slate-500">
                          {place.address}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setVenues((current) =>
                          current.filter((item) => item.id !== place.id),
                        )
                      }
                      className="rounded-full px-2 py-1 text-base font-semibold text-slate-500 hover:bg-slate-100"
                      aria-label={`Remove ${place.name}`}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {error && <p className="text-base text-red-600">{error}</p>}

          <button
            type="button"
            onClick={handleAddVenue}
            disabled={submitting || venues.length === 0}
            className="w-full rounded-full bg-ink px-5 py-3 text-base font-semibold text-white disabled:opacity-60"
          >
            {submitting
              ? "Adding..."
              : venues.length > 1
                ? `Add ${venues.length} venues`
                : "Add venue"}
          </button>
        </div>
      </div>
    </main>
  );
}

export default observer(AddVenuePage);
