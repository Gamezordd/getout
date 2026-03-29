import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import { useState } from "react";
import MobileAuthCard from "../components/MobileAuthCard";
import { EntryShell, LandingHero } from "../components/entry/EntryFlow";
import { useAuth } from "../lib/auth/AuthProvider";
import { CATEGORY_OPTIONS } from "../lib/entryFlow";
import { useAppStore } from "../lib/store/AppStoreProvider";
import type { VenueCategory } from "../lib/types";

const CLOSE_VOTING_BADGES = [
  { value: 1, label: "1h" },
  { value: 3, label: "3h" },
  { value: 6, label: "6h" },
];

function LandingPage() {
  const store = useAppStore();
  const { authStatus, authenticatedUser, isNative } = useAuth();
  const router = useRouter();
  const [category, setCategory] = useState<VenueCategory>("bar");
  const [closeVotingInHours, setCloseVotingInHours] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (isNative && authStatus !== "signed_in") {
      setError("Sign in with Google to create a group in the mobile app.");
      return;
    }
    const sessionId = store.ensureSessionId(null);
    try {
      setSubmitting(true);
      setError(null);
      store.setSession(sessionId, "/");
      await store.joinGroup({
        name: isNative ? authenticatedUser?.displayName : undefined,
        venueCategory: category,
        closeVotingInHours,
      });
      router.replace({ pathname: "/", query: { sessionId } });
    } catch (err: any) {
      setError(err.message || "Unable to create group.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <EntryShell>
      <LandingHero
        onCreate={handleCreate}
        controls={
          <div className="mt-6 space-y-3 rounded-[24px] border border-white/10 bg-[#141418]/90 p-4 backdrop-blur-sm">
            {isNative ? (
              <MobileAuthCard className="border-none bg-transparent p-0" />
            ) : null}
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b8b9c]">
                Looking for
              </p>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_OPTIONS.map((option) => {
                  const isSelected = option.value === category;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setCategory(option.value)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        isSelected
                          ? "bg-[#00e5a0] text-black"
                          : "border border-white/10 bg-[#1c1c22] text-[#d7d7e0]"
                      }`}
                    >
                      <span className="mr-1.5">{option.emoji}</span>
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b8b9c]">
                Close voting in?
              </p>
              <div className="flex flex-wrap gap-2">
                {CLOSE_VOTING_BADGES.map((option) => {
                  const isSelected = option.value === closeVotingInHours;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setCloseVotingInHours(option.value)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        isSelected
                          ? "bg-[#00e5a0] text-black"
                          : "border border-white/10 bg-[#1c1c22] text-[#d7d7e0]"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            <p className="text-xs text-[#64647a]">
              {isNative
                ? "Your Google profile name will be used automatically for mobile-created groups."
                : "We&apos;ll start with an approximate location, then ask for precise access inside the group."}
            </p>
          </div>
        }
        createButtonLabel={
          isNative && authStatus !== "signed_in"
            ? "Sign in to create"
            : submitting
              ? "Creating group..."
              : "Create group"
        }
      />
    </EntryShell>
  );
}

export default observer(LandingPage);
