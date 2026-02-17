import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import { useState } from "react";
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

function CreatePage() {
  const store = useAppStore();
  const router = useRouter();
  const [name, setName] = useState("");
  const [location, setLocation] = useState<PlaceResult | null>(null);
  const [category, setCategory] = useState<VenueCategory>("bar");
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Add your name to continue.");
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
      await store.initGroup();
      await store.joinGroup(name.trim(), location.location, category);
      router.push({ pathname: "/", query: { sessionId } });
    } catch (err: any) {
      setError(err.message || "Unable to create group.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-mist px-4 pb-8 pt-6">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-bold text-ink">GetOut</h1>
        </div>
        <p className="mt-2 text-sm font-semibold text-slate-500">Lets pick today's spot. Fast.</p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-semibold text-ink">Your name</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Type your name"
              style={{ fontSize: 18}}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
            />
          </div>

          <PlaceSearch
            label="Your location"
            placeholder="Search for your neighborhood"
            onSelect={(place) => {
              setLocation(place);
              setLocationError(null);
              setError(null);
            }}
          />
          {location && <p className="text-xs text-slate-500">Selected: {location.address}</p>}

          <div>
            <label className="text-sm font-semibold text-ink">Looking for</label>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as VenueCategory)}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {locationError && <p className="text-xs text-red-600">{locationError}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="button"
            onClick={handleCreate}
            disabled={submitting}
            className="w-full rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "Suii..." : "Start Picking"}
          </button>
        </div>
      </div>
    </main>
  );
}

export default observer(CreatePage);
