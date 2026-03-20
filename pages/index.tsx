import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BottomDrawer, { BottomDrawerHandle } from "../components/BottomDrawer";
import { useAppStore } from "../lib/store/AppStoreProvider";
import FinalizeDialog from "../components/FinalizeDialog";
import { Header } from "../components/Header";
import DrawerContent from "../components/DrawerContent";
import LockedVenueDialog from "../components/LockedVenueDialog";
import InviteDialog from "../components/InviteDialog";
import usePusher from "../hooks/usePusher";
import useRedirections from "../hooks/useRedirections";
import PickButton from "../components/PickButton";
import { MapContainer } from "../components/MapContainer";
import { registerPushSubscription } from "../lib/pushClient";

function HomePage() {
  const store = useAppStore();
  const [joinNotice, setJoinNotice] = useState<string | null>(null);
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);

  const seenUserIdsRef = useRef<Set<string>>(new Set());
  const usersInitializedRef = useRef(false);
  const bottomSheetRef = useRef<BottomDrawerHandle>(null);
  const pushInitRef = useRef(false);

  usePusher();

  const {selectedVenue} = store;
  useRedirections();

  const handleEditUser = useCallback(
    (userId: string) => {
      if (userId !== store.currentUserId) return;
      bottomSheetRef.current?.snapTo("max");
    },
    [store.currentUserId],
  );

  useEffect(() => {
    if (store.selectedVenue) {
      bottomSheetRef.current?.snapTo("mid");
    }
  }, [store.selectedVenue]);

  useEffect(() => {
    const currentIds = new Set(store.users.map((user) => user.id));
    if (!usersInitializedRef.current) {
      seenUserIdsRef.current = currentIds;
      usersInitializedRef.current = true;
      return;
    }

    const addedUsers = store.users.filter(
      (user) => !seenUserIdsRef.current.has(user.id),
    );
    const joinedByOthers = addedUsers.find(
      (user) => user.id !== store.currentUserId,
    );
    if (joinedByOthers) {
      setJoinNotice(`${joinedByOthers.name} joined the group`);
      setTimeout(() => setJoinNotice(null), 2500);
    }
    seenUserIdsRef.current = currentIds;
  }, [store.currentUserId, store.users]);

  useEffect(() => {
    if (!store.sessionId || !store.ownerKey) return;
    store.initGroup();
  }, [store, store.sessionId, store.ownerKey]);

  useEffect(() => {
    store.loadGroup();
  }, [store, store.sessionId]);

  useEffect(() => {
    if (pushInitRef.current) return;
    if (!store.sessionId || !store.currentUserId) return;
    pushInitRef.current = true;
    registerPushSubscription({
      sessionId: store.sessionId,
      userId: store.currentUserId,
    }).catch(() => {
      // Ignore subscription errors.
    });
  }, [store.currentUserId, store.sessionId]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      store.fetchSuggestions();
    }, 400);
    return () => clearTimeout(timeout);
  }, [store, store.sessionId, store.users.length, store.manualVenues.length]);

  const showVoteFooter =
    !store.lockedVenue && store.hasCurrentUserLocation && store.selectedVenue;

  const errorBanner = useMemo(
    () => store.mapError || store.groupError || store.suggestionWarning,
    [store.groupError, store.mapError, store.suggestionWarning],
  );

  if (!store.currentUser) {
    return null;
  }

  return (
    <div className="relative flex flex-col h-full overflow-clip bg-mist">
      <Header />
      <MapContainer onFinalizeClick={() => setShowFinalizeDialog(true)} />

      {errorBanner && (
        <div className="pointer-events-none absolute inset-x-4 top-16 z-20 rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {errorBanner}
        </div>
      )}
      {joinNotice && (
        <div className="pointer-events-none absolute inset-x-4 top-28 z-20 rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
          {joinNotice}
        </div>
      )}
      {!store.lockedVenue && (
        <BottomDrawer
          ref={bottomSheetRef}
          bottomOffset={selectedVenue ? 280 : 0}
          allowScroll={!selectedVenue}
          render={(isExpanded) => (
            <DrawerContent
              isExpanded={isExpanded}
              onEditUser={handleEditUser}
            />
          )}
        />
      )}
      {showVoteFooter && <PickButton />}
      <FinalizeDialog
        showFinalizeDialog={showFinalizeDialog}
        setShowFinalizeDialog={setShowFinalizeDialog}
      />

      <LockedVenueDialog />
      <InviteDialog />
    </div>
  );
}

export default observer(HomePage);
