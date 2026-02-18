import { useRouter } from "next/router";
import { useAppStore } from "../lib/store/AppStoreProvider";
import { useEffect } from "react";

export default function useRedirections() {
  const store = useAppStore();
  const router = useRouter();
    useEffect(() => {
      if (!router.isReady) return;
  
      const sessionId =
        typeof router.query.sessionId === "string" ? router.query.sessionId : null;
  
      if (!sessionId) {
        router.replace({ pathname: "/create" }, undefined, { shallow: true });
        return;
      }
  
      store.setSession(sessionId, router.pathname);
    }, [router.isReady, router.pathname, router.query.sessionId, store]);
  
    useEffect(() => {
      if (!router.isReady || !store.sessionId) return;
      if (store.currentUserId) return;
  
      router.replace({ pathname: "/join", query: { sessionId: store.sessionId } }, undefined, {
        shallow: true
      });
    }, [router, router.isReady, store.currentUserId, store.sessionId]);
  
    useEffect(() => {
      if (!router.isReady) return;
      const venueIdFromUrl =
        typeof router.query.venueId === "string" ? router.query.venueId : null;
      if (venueIdFromUrl !== store.selectedVenueId && !store.selectedVenueId) {
        store.setSelectedVenue(venueIdFromUrl);
      }
    }, [router.isReady, router.query.venueId, store, store.selectedVenueId]);
  
    useEffect(() => {
      if (!router.isReady || !store.sessionId) return;
  
      const currentVenueId =
        typeof router.query.venueId === "string" ? router.query.venueId : null;
      if (currentVenueId === store.selectedVenueId) return;
  
      const nextQuery: Record<string, string> = { sessionId: store.sessionId };
      if (store.selectedVenueId) {
        nextQuery.venueId = store.selectedVenueId;
      }
  
      router.replace(
        { pathname: router.pathname, query: nextQuery },
        undefined,
        { shallow: true, scroll: false }
      );
    }, [
      router,
      router.isReady,
      router.pathname,
      router.query.venueId,
      store.selectedVenueId,
      store.sessionId
    ]);
  }