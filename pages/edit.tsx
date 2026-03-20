import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import PlaceSearch, { PlaceResult } from "../components/PlaceSearch";
import { useAppStore } from "../lib/store/AppStoreProvider";

function EditPage() {
  const store = useAppStore();
  const router = useRouter();
  const sessionId =
    typeof router.query.sessionId === "string" ? router.query.sessionId : "";
  const [location, setLocation] = useState<PlaceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);

  const currentUser = useMemo(() => {
    return store.currentUser;
  }, [store.currentUser]);

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

  useEffect(() => {
    if (!router.isReady || !store.sessionId || !store.identityResolved) return;
    if (store.currentUserId) return;
    router.replace(
      { pathname: "/join", query: { sessionId: store.sessionId } },
      undefined,
      {
        shallow: true,
      },
    );
  }, [
    router,
    router.isReady,
    store.currentUserId,
    store.identityResolved,
    store.sessionId,
  ]);

  const handleDetectLocation = async () => {
    if (!("geolocation" in navigator)) {
      setLocationError("Location services are not supported.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const params = new URLSearchParams({
            lat: String(position.coords.latitude),
            lng: String(position.coords.longitude),
          });
          const response = await fetch(`/api/reverse-geocode?${params}`);
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.message || "Unable to detect address.");
          }
          const data = (await response.json()) as { result?: PlaceResult };
          if (!data.result) {
            throw new Error("Unable to detect address.");
          }
          setLocation(data.result);
        } catch (err: any) {
          setLocationError(err.message || "Unable to detect address.");
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocationError("Location permission denied.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleUpdate = async () => {
    if (!store.sessionId) {
      setError("Missing session. Open this page from a group link.");
      return;
    }
    if (!store.currentUserId) {
      setError("Missing user. Join the group first.");
      return;
    }
    if (!location) {
      setLocationError("Pick a new planning location.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await store.updateUserLocation(store.currentUserId, location.location);
      router.push({ pathname: "/", query: { sessionId: store.sessionId } });
    } catch (err: any) {
      setError(err.message || "Unable to update location.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-mist px-4 pb-8 pt-6">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-ink">Update location</h1>
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
        <p className="mt-2 text-sm text-slate-500">
          {currentUser?.name
            ? `Updating for ${currentUser.name}`
            : "Pick a new location for this session."}
        </p>

        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-base font-semibold text-ink">
              Your location
            </label>
            <button
              type="button"
              onClick={handleDetectLocation}
              disabled={locating}
              className="text-xs font-semibold text-blue-500 hover:text-blue-600 disabled:opacity-60"
            >
              {locating ? "Detecting..." : "Detect location"}
            </button>
          </div>
          <PlaceSearch
            label=""
            placeholder="Search for your neighborhood"
            selectedPlace={location}
            onSelect={(place) => {
              setLocation(place);
              setLocationError(null);
              setError(null);
            }}
          />
          {locationError && (
            <p className="text-base text-red-600">{locationError}</p>
          )}
          {error && <p className="text-base text-red-600">{error}</p>}

          <button
            type="button"
            onClick={handleUpdate}
            disabled={submitting}
            className="w-full rounded-full bg-ink px-5 py-3 text-base font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Update location"}
          </button>
        </div>
      </div>
    </main>
  );
}

export default observer(EditPage);
