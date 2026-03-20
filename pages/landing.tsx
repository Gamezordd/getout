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
  { value: "brewery", label: "Breweries" },
];

function LandingPage() {
  const store = useAppStore();
  const router = useRouter();
  const [step, setStep] = useState<"intro" | "create">("intro");
  const [name, setName] = useState("");
  const [location, setLocation] = useState<PlaceResult | null>(null);
  const [category, setCategory] = useState<VenueCategory>("bar");
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
      await store.joinGroup(trimmedName, location.location, category);
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
    <div className="relative min-h-[100svh] bg-slate-900 text-white">
      <div
        className={`absolute inset-0 bg-cover bg-center`}
        style={{ backgroundImage: "url(/bg_img.jpg)", filter: `blur(${step === "intro" ? "0.7px" : "1.2px"}) brightness(0.7)` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/75 via-slate-900/30 to-slate-900/60" />
      <main className="relative mx-auto flex min-h-[100svh] w-full max-w-5xl flex-col justify-center px-5 py-12 text-left sm:px-8 sm:py-16">
        <div className="w-full rounded-3xl border border-white/10 bg-slate-950/50 px-5 py-7 shadow-2xl backdrop-blur sm:px-8 sm:py-10">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-emerald-200/80">
            GetOut
          </p>

          <div className="relative">
            {step === "intro" && (
              <section
                aria-hidden={step !== "intro"}
                className={`transition-all duration-300 ease-out ${
                  step === "intro"
                    ? "opacity-100 translate-y-0"
                    : "pointer-events-none opacity-0 -translate-y-2"
                } ${step === "intro" ? "relative" : "absolute inset-0"}`}
              >
                <h1 className="mt-4 text-3xl font-semibold text-white sm:text-5xl">
                  Pick a spot together, fast.
                </h1>
                <p className="mt-3 text-sm text-white/80 sm:text-base">
                  Stop arguing in the group chat. GetOut finds venues that work
                  for everyone&apos;s location.
                </p>
                <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => setStep("create")}
                    className="rounded-full bg-emerald-400 px-6 py-2.5 text-sm text-center font-semibold text-emerald-950 shadow-lg shadow-emerald-900/30"
                  >
                    Create a group
                  </button>
                  <p className="text-xs text-white/70 text-center">
                    Have a link? Open it to join.
                  </p>
                </div>
              </section>
            )}
            {step === "create" && (
              <section
                aria-hidden={step !== "create"}
                className={`transition-all duration-300 ease-out ${
                  step === "create"
                    ? "opacity-100 translate-y-0"
                    : "pointer-events-none opacity-0 translate-y-2"
                } ${step === "create" ? "relative" : "absolute inset-0"}`}
              >
                <div className="flex items-center justify-between">
                  <h1 className="mt-4 text-2xl font-semibold text-white sm:text-4xl">
                    Create a group
                  </h1>
                  <button
                    type="button"
                    onClick={() => setStep("intro")}
                    className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-white/70 hover:text-white"
                  >
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                      className="h-4 w-4"
                    >
                      <path
                        fillRule="evenodd"
                        d="M12.707 4.293a1 1 0 0 1 0 1.414L9.414 9H16a1 1 0 1 1 0 2H9.414l3.293 3.293a1 1 0 1 1-1.414 1.414l-5-5a1 1 0 0 1 0-1.414l5-5a1 1 0 0 1 1.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Back
                  </button>
                </div>
                <p className="mt-2 text-sm text-white/70">
                  Tell us where you&apos;re starting so we can do the math.
                </p>

                <div className="mt-5 space-y-4">
                  <div>
                    <label className="text-sm font-semibold text-white">
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
                        className={`w-full rounded-xl border bg-white px-4 py-3 text-base text-ink shadow-sm focus:border-slate-400 focus:outline-none ${
                          isNameValid
                            ? "border-emerald-300 pr-10"
                            : "border-slate-200"
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
                      <p className="mt-2 text-xs text-rose-200">
                        Name must be at least 3 characters.
                      </p>
                    )}
                    {nameTaken && (
                      <p className="mt-2 text-xs text-rose-200">
                        That name is already taken in this group.
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-white">
                      Your location
                    </label>
                    <button
                      type="button"
                      onClick={handleDetectLocation}
                      disabled={locating}
                      className="text-xs font-semibold text-emerald-200 hover:text-emerald-100 disabled:opacity-60"
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

                  <div>
                    <label className="text-sm font-semibold text-white">
                      Looking for
                    </label>
                    <select
                      value={category}
                      onChange={(event) =>
                        setCategory(event.target.value as VenueCategory)
                      }
                      className="mt-2 w-full rounded-xl border border-white/10 bg-white px-4 py-3 text-base text-ink shadow-sm focus:border-slate-400 focus:outline-none"
                    >
                      {CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {locationError && (
                    <p className="text-xs text-rose-200">{locationError}</p>
                  )}
                  {error && <p className="text-xs text-rose-200">{error}</p>}

                  <label className="flex items-center gap-3 text-xs text-white/70">
                    <input
                      type="checkbox"
                      checked={saveDetails}
                      onChange={(event) => setSaveDetails(event.target.checked)}
                      className="h-4 w-4 rounded border-white/40 text-emerald-500"
                    />
                    Save my details for next time
                  </label>

                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={submitting}
                    className="w-full rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-900/30 disabled:opacity-60"
                  >
                    {submitting ? "Starting..." : "Start Picking"}
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default observer(LandingPage);
