import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../lib/auth/AuthProvider";
import { getPreciseJoinLocation } from "../lib/nativePreciseLocation";
import type { PickAgainInviteeSummary } from "../lib/authTypes";
import { useAppStore } from "../lib/store/AppStoreProvider";
import type { Venue, VenueCategory } from "../lib/types";
import { useInvitePeople } from "./useInvitePeople";

type UseCreateGroupFlowOptions = {
  initialCategory?: VenueCategory;
  initialInvitees?: PickAgainInviteeSummary[];
  initialVenue?: Venue | null;
};

export function useCreateGroupFlow({
  initialCategory = "bar",
  initialInvitees = [],
  initialVenue = null,
}: UseCreateGroupFlowOptions = {}) {
  const store = useAppStore();
  const { authStatus, authenticatedUser, isNative } = useAuth();
  const router = useRouter();
  const [category, setCategory] = useState<VenueCategory>(initialCategory);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(initialVenue);
  const closeVotingInHours = 3;
  const inviteState = useInvitePeople({ initialInvitees });

  useEffect(() => {
    setCategory(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    setSelectedVenue(initialVenue);
  }, [initialVenue]);

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
        initialVenue: selectedVenue || undefined,
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
    selectedVenue,
    setCategory,
    setInviteDialogOpen,
    setSelectedVenue,
    submitting,
    ...inviteState,
  };
}

export type CreateGroupFlowState = ReturnType<typeof useCreateGroupFlow>;
