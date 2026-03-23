import { observer } from "mobx-react-lite";
import { toast } from "sonner";
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
import useForegroundResume from "../hooks/useForegroundResume";
import PickButton from "../components/PickButton";
import { MapContainer } from "../components/MapContainer";
import { registerPushSubscription } from "../lib/pushClient";

function HomePage() {
  const store = useAppStore();
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteDialogTitle, setInviteDialogTitle] = useState("You're the first one here!");

  const bottomSheetRef = useRef<BottomDrawerHandle>(null);
  const pushInitRef = useRef(false);

  const handleJoinEvent = useCallback(
    (userId: string) => {
      if (userId === store.currentUserId) return;
      const joinedUser = store.users.find((user) => user.id === userId);
      toast.success(`${joinedUser?.name || "Someone"} has joined!`, {
        description: "Suggestions have been updated",
      });
    },
    [store.currentUserId, store.users],
  );

  const handleVoteEvent = useCallback(
    (voterId: string) => {
      if (voterId === store.currentUserId) return;
      const voter = store.users.find((user) => user.id === voterId);
      toast.info(`${voter?.name || "Someone"} has voted`,);
    },
    [store.currentUserId, store.users],
  );

  usePusher(handleJoinEvent, handleVoteEvent);

  const {selectedVenue} = store;
  useRedirections();
  useForegroundResume(async () => {
    if (!store.sessionId) return;
    await store.loadGroup();
    if (store.users.length === 0) return;
    await store.fetchSuggestions();
  });

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
      <Header
        onInviteClick={() => {
          setInviteDialogTitle("Leave no one behind!");
          setShowInviteDialog(true);
        }}
      />
      <MapContainer onFinalizeClick={() => setShowFinalizeDialog(true)} />

      {errorBanner && (
        <div className="pointer-events-none absolute inset-x-4 top-16 z-20 rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {errorBanner}
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
      <InviteDialog
        isOpen={showInviteDialog}
        title={inviteDialogTitle}
        onOpen={() => {
          setInviteDialogTitle("You're the first one here!");
          setShowInviteDialog(true);
        }}
        onClose={() => setShowInviteDialog(false)}
      />
    </div>
  );
}

export default observer(HomePage);
