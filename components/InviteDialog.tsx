import Dialog from "./Dialog";
import { useAppStore } from "../lib/store/AppStoreProvider";
import { useEffect, useState } from "react";

export default function InviteDialog() {
  const store = useAppStore();
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  const handleClose = () => {
    if (store.sessionId && typeof window !== "undefined") {
      localStorage.setItem(`getout-invite-shown-${store.sessionId}`, "1");
    }
    setShowInviteDialog(false);
  };

  useEffect(() => {
    if (!store.sessionId || !store.currentUserId) return;
    if (store.users.length !== 1) {
      setShowInviteDialog(false);
      return;
    }
    const onlyUser = store.users[0];
    if (!onlyUser || onlyUser.id !== store.currentUserId) return;

    const key = `getout-invite-shown-${store.sessionId}`;
    const alreadyShown =
      typeof window !== "undefined" ? localStorage.getItem(key) === "1" : false;
    if (!alreadyShown) {
      setShowInviteDialog(true);
    }
  }, [store.currentUserId, store.sessionId, store.users]);

  if (!showInviteDialog) return null;

  return (
    <Dialog
      isOpen={showInviteDialog}
      onClose={handleClose}
      title="getout is best enjoyed with friends"
      description="Share your group link to get better meetup options."
    >
      <button
        type="button"
        onClick={store.copyShareLink}
        className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-ink px-4 py-3 text-sm font-semibold text-white"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4">
          <path d="M7 3a2 2 0 00-2 2v1a1 1 0 11-2 0V5a4 4 0 014-4h6a4 4 0 014 4v6a4 4 0 01-4 4h-1a1 1 0 110-2h1a2 2 0 002-2V5a2 2 0 00-2-2H7z" />
          <path d="M3 9a4 4 0 014-4h6a4 4 0 014 4v6a4 4 0 01-4 4H7a4 4 0 01-4-4V9zm4-2a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2V9a2 2 0 00-2-2H7z" />
        </svg>
        {store.copyStatus || "Copy share link"}
      </button>
    </Dialog>
  );
}
