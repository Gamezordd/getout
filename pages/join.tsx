import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import PlaceSearch, { PlaceResult } from "../components/PlaceSearch";
import { getDistanceKm } from "../lib/distance";
import { useAppStore } from "../lib/store/AppStoreProvider";
import type { VenueCategory } from "../lib/types";

const CATEGORY_OPTIONS: Array<{ value: VenueCategory; label: string }> = [
  { value: "bar", label: "Bars" },
  { value: "restaurant", label: "Restaurants" },
  { value: "cafe", label: "Cafes" },
  { value: "night_club", label: "Night clubs" },
  { value: "brewery", label: "Breweries" },
];

const MAX_JOIN_DISTANCE_KM = 80;
const LOCATION_DISTANCE_ERROR =
  "Provided location is too far from the group location.";

function JoinPage() {
  const store = useAppStore();
  const router = useRouter();
  const sessionId =
    typeof router.query.sessionId === "string" ? router.query.sessionId : "";
  const [name, setName] = useState("");
  const [location, setLocation] = useState<PlaceResult | null>(null);
  const [saveDetails, setSaveDetails] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const trimmedName = name.trim();
  const normalizedName = trimmedName.toLowerCase();
  const nameTooShort = trimmedName.length > 0 && trimmedName.length < 3;
  const nameTaken = store.users.some(
    (user) => user.name.trim().toLowerCase() === normalizedName,
  );
  const isNameValid = trimmedName.length >= 3 && !nameTaken;

  const organizerLocation = useMemo(() => {
    const organizer = store.users.find((user) => user.isOrganizer);
    return organizer?.location;
  }, [store.users]);

  const isLocationTooFar = useMemo(() => {
    if (!location || !organizerLocation) return false;
    return (
      getDistanceKm(location.location, organizerLocation) > MAX_JOIN_DISTANCE_KM
    );
  }, [location, organizerLocation]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("getout-user-details");
    if (!stored) return;
    try {
      const payload = JSON.parse(stored) as {
        name?: string;
        place?: PlaceResult;
      };
      if (payload?.name) setName(payload.name);
      if (payload?.place) setLocation(payload.place);
    } catch {
      // ignore malformed storage
    }
  }, []);

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
    if (!location) return;
    if (isLocationTooFar) {
      setLocationError(LOCATION_DISTANCE_ERROR);
      return;
    }
    setLocationError((current) =>
      current === LOCATION_DISTANCE_ERROR ? null : current,
    );
  }, [isLocationTooFar, location]);

  const handleJoin = async () => {
    if (!store.sessionId) {
      setError("Missing session. Open this page from a group link.");
      return;
    }
    if (!trimmedName) {
      setError("Add your name to join.");
      return;
    }
    if (trimmedName.length < 3) {
      setError("Name must be at least 3 characters.");
      return;
    }
    if (nameTaken) {
      setError("That name is already taken in this group.");
      return;
    }
    if (!location) {
      setLocationError("Pick a planning location to join.");
      return;
    }
    if (isLocationTooFar) {
      setLocationError(LOCATION_DISTANCE_ERROR);
      return;
    }
    if (!store.venueCategory) {
      await store.loadGroup();
    }

    try {
      setSubmitting(true);
      setError(null);
      await store.joinGroup(trimmedName, location.location);
      if (saveDetails) {
        localStorage.setItem(
          "getout-user-details",
          JSON.stringify({ name: trimmedName, place: location }),
        );
      } else {
        localStorage.removeItem("getout-user-details");
      }
      router.push({ pathname: "/", query: { sessionId: store.sessionId } });
    } catch (err: any) {
      setError(err.message || "Unable to join group.");
    } finally {
      setSubmitting(false);
    }
  };

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

  return (
    <main className="min-h-screen bg-mist px-4 pb-8 pt-6">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-ink">
            You've been invited
          </h1>
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
        <p className="mt-2 text-base font-semibold text-slate-500">
          {store.users.length}{" "}
          {store.users.length === 1 ? "person is" : "people are"} waiting on you
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-base font-semibold text-ink">
              Your name
            </label>
            <div className="relative mt-2">
              <input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                }}
                placeholder="Type your name"
                className={`w-full rounded-xl border bg-white px-4 py-3 text-base shadow-sm focus:border-slate-400 focus:outline-none ${
                  isNameValid ? "border-emerald-300 pr-10" : "border-slate-200"
                }`}
              />
              {isNameValid && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500">
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                    className="h-4 w-4"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.704 5.29a1 1 0 0 1 0 1.415l-7.5 7.5a1 1 0 0 1-1.415 0l-3-3a1 1 0 1 1 1.415-1.415l2.293 2.293 6.793-6.793a1 1 0 0 1 1.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              )}
            </div>
            {nameTooShort && (
              <p className="mt-2 text-sm text-red-600">
                Name must be at least 3 characters.
              </p>
            )}
            {nameTaken && (
              <p className="mt-2 text-sm text-red-600">
                That name is already taken in this group.
              </p>
            )}
          </div>

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
            locationBias={
              organizerLocation
                ? {
                    lat: organizerLocation.lat,
                    lng: organizerLocation.lng,
                    radiusKm: 40,
                  }
                : undefined
            }
            resultFilter={(place) => {
              if (!organizerLocation) return true;
              return (
                getDistanceKm(place.location, organizerLocation) <=
                MAX_JOIN_DISTANCE_KM
              );
            }}
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

          <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-base text-slate-600">
            <span>Picking</span>
            <span className="font-semibold text-ink">
              {CATEGORY_OPTIONS.find(
                (option) => option.value === store.venueCategory,
              )?.label || "Bars"}
            </span>
          </div>

          <label className="flex items-center gap-3 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={saveDetails}
              onChange={(event) => setSaveDetails(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-ink"
            />
            Save my details for next time
          </label>

          <button
            type="button"
            onClick={handleJoin}
            disabled={submitting || isLocationTooFar}
            className="w-full rounded-full bg-ink px-5 py-3 text-base font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "Suii..." : "Join & Pick"}
          </button>
        </div>
      </div>
    </main>
  );
}

export default observer(JoinPage);
