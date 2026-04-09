import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../lib/auth/AuthProvider";
import { getPreciseJoinLocation } from "../lib/nativePreciseLocation";
import type { PickAgainInviteeSummary } from "../lib/authTypes";
import { useAppStore } from "../lib/store/AppStoreProvider";
import type { VenueCategory } from "../lib/types";
import { useInvitePeople } from "./useInvitePeople";

type UseCreateGroupFlowOptions = {
  initialCategory?: VenueCategory;
  initialInvitees?: PickAgainInviteeSummary[];
};

export function useCreateGroupFlow({
  initialCategory = "bar",
  initialInvitees = [],
}: UseCreateGroupFlowOptions = {}) {
  const store = useAppStore();
  const { authStatus, authenticatedUser, isNative } = useAuth();
  const router = useRouter();
  const [category, setCategory] = useState<VenueCategory>(initialCategory);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const closeVotingInHours = 3;
  const inviteState = useInvitePeople({ initialInvitees });

  useEffect(() => {
    setCategory(initialCategory);
  }, [initialCategory]);

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
      const preciseLocation =
        isNative && authStatus === "signed_in"
          ? await getPreciseJoinLocation({
              isNative,
              promptIfNeeded: false,
            })
          : null;
      await store.joinGroup({
        createIfMissing: true,
        name: isNative ? authenticatedUser?.displayName : undefined,
        location: preciseLocation?.location,
        locationLabel: preciseLocation?.locationLabel || undefined,
        locationSource: preciseLocation ? "precise" : undefined,
        venueCategory: category,
        closeVotingInHours,
      });
      void router.replace({ pathname: "/", query: { sessionId } });
    } catch (err: any) {
      setError(err.message || "Unable to create group.");
    } finally {
      setSubmitting(false);
    }
  };

  return {
    category,
    error,
    handleCreate,
    inviteDialogOpen,
    setCategory,
    setInviteDialogOpen,
    submitting,
    ...inviteState,
  };
}

export type CreateGroupFlowState = ReturnType<typeof useCreateGroupFlow>;
