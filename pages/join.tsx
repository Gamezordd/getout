import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { EntryShell, JoinGroupForm } from "../components/entry/EntryFlow";
import { PlaceResult } from "../components/PlaceSearch";
import { getDistanceKm } from "../lib/distance";
import { useAppStore } from "../lib/store/AppStoreProvider";

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
  const organizer = useMemo(
    () => store.users.find((user) => user.isOrganizer) || null,
    [store.users],
  );

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
      router.replace({ pathname: "/landing" }, undefined, { shallow: true });
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
    <EntryShell>
      <JoinGroupForm
        onBack={() =>
          router.push({ pathname: "/", query: sessionId ? { sessionId } : {} })
        }
        name={name}
        setName={(value) => {
          setName(value);
          setError(null);
        }}
        location={location}
        setLocation={(place) => {
          setLocation(place);
          setLocationError(null);
          setError(null);
        }}
        saveDetails={saveDetails}
        setSaveDetails={setSaveDetails}
        error={error}
        locationError={locationError}
        submitting={submitting || isLocationTooFar}
        locating={locating}
        nameTooShort={nameTooShort}
        nameTaken={nameTaken}
        isNameValid={isNameValid}
        onDetectLocation={handleDetectLocation}
        onSubmit={handleJoin}
        peopleWaiting={store.users.length}
        organizerName={organizer?.name || null}
        organizerLocationBias={
          organizerLocation
            ? { lat: organizerLocation.lat, lng: organizerLocation.lng, radiusKm: 40 }
            : undefined
        }
        resultFilter={(place) => {
          if (!organizerLocation) return true;
          return getDistanceKm(place.location, organizerLocation) <= MAX_JOIN_DISTANCE_KM;
        }}
        category={store.venueCategory}
      />
    </EntryShell>
  );
}

export default observer(JoinPage);
