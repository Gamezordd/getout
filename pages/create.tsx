import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { CreateGroupForm, EntryShell } from "../components/entry/EntryFlow";
import { PlaceResult } from "../components/PlaceSearch";
import { useAppStore } from "../lib/store/AppStoreProvider";
import type { VenueCategory } from "../lib/types";

function CreatePage() {
  const store = useAppStore();
  const router = useRouter();
  const [name, setName] = useState("");
  const [location, setLocation] = useState<PlaceResult | null>(null);
  const [category, setCategory] = useState<VenueCategory>("bar");
  const [closeVotingInHours, setCloseVotingInHours] = useState(3);
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("getout-user-details");
    if (!stored) return;
    try {
      const payload = JSON.parse(stored) as { name?: string; place?: PlaceResult };
      if (payload?.name) setName(payload.name);
      if (payload?.place) setLocation(payload.place);
    } catch {
      // ignore malformed storage
    }
  }, []);

  const handleCreate = async () => {
    if (!trimmedName) {
      setError("Add your name to continue.");
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
      setLocationError("Pick your planning location.");
      return;
    }

    const sessionId = store.ensureSessionId(null);
    try {
      setSubmitting(true);
      setError(null);
      store.setSession(sessionId, "/");
      await store.joinGroup(trimmedName, location.location, category, closeVotingInHours);
      if (saveDetails) {
        localStorage.setItem(
          "getout-user-details",
          JSON.stringify({ name: trimmedName, place: location }),
        );
      } else {
        localStorage.removeItem("getout-user-details");
      }
      router.push({ pathname: "/", query: { sessionId } });
    } catch (err: any) {
      setError(err.message || "Unable to create group.");
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
      <CreateGroupForm
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
        category={category}
        setCategory={setCategory}
        closeVotingInHours={closeVotingInHours}
        setCloseVotingInHours={setCloseVotingInHours}
        saveDetails={saveDetails}
        setSaveDetails={setSaveDetails}
        error={error}
        locationError={locationError}
        submitting={submitting}
        locating={locating}
        nameTooShort={nameTooShort}
        nameTaken={nameTaken}
        isNameValid={isNameValid}
        onDetectLocation={handleDetectLocation}
        onSubmit={handleCreate}
        onBack={() => router.push("/landing")}
      />
    </EntryShell>
  );
}

export default observer(CreatePage);
