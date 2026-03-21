import { type ReactNode, useEffect } from "react";
import { observer } from "mobx-react-lite";
import Dialog from "./Dialog";
import { useAppStore } from "../lib/store/AppStoreProvider";

type ShareActionProps = {
  label: string;
  onClick: () => void | Promise<void>;
  className: string;
  children: ReactNode;
};

type InviteDialogProps = {
  isOpen: boolean;
  title: string;
  onOpen: () => void;
  onClose: () => void;
};

function ShareAction({ label, onClick, className, children }: ShareActionProps) {
  const handleClick = () => {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function"
    ) {
      navigator.vibrate(12);
    }
    void onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center rounded-full text-ink transition active:scale-[0.97] ${className}`}
    >
      {children}
    </button>
  );
}

const InviteDialog = observer(function InviteDialog({
  isOpen,
  title,
  onOpen,
  onClose,
}: InviteDialogProps) {
  const store = useAppStore();

  const handleClose = () => {
    if (store.sessionId && typeof window !== "undefined") {
      localStorage.setItem(`getout-invite-shown-${store.sessionId}`, "1");
    }
    onClose();
  };

  useEffect(() => {
    if (!store.sessionId || !store.currentUserId) return;
    if (store.users.length !== 1) {
      if (isOpen) {
        onClose();
      }
      return;
    }
    const onlyUser = store.users[0];
    if (!onlyUser || onlyUser.id !== store.currentUserId) return;

    const key = `getout-invite-shown-${store.sessionId}`;
    const alreadyShown =
      typeof window !== "undefined" ? localStorage.getItem(key) === "1" : false;
    if (!alreadyShown && !isOpen) {
      onOpen();
    }
  }, [
    isOpen,
    onClose,
    onOpen,
    store.currentUserId,
    store.sessionId,
    store.users,
  ]);

  if (!isOpen) return null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      description="Invite friends to instantly calculate the best spots and vote to pick one."
    >
      <div className="mt-4 flex w-full flex-col gap-3">
        <div className="flex w-full items-center justify-center gap-3">
          <ShareAction
            label="Social Share"
            onClick={() => store.socialShare()}
            className="gap-2 border border-slate-200 bg-ink flex-grow px-4 py-3 text-sm font-semibold text-white shadow-sm"
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              className="h-3.5 w-3.5 text-white"
            >
              <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a2.98 2.98 0 0 0 0-1.39l7-4.11A2.99 2.99 0 1 0 14 5a3 3 0 0 0 .05.54l-7 4.11a3 3 0 1 0 0 4.7l7.05 4.14c-.03.17-.05.34-.05.51a3 3 0 1 0 3-2.92Z" />
            </svg>
            <span>Share Invite Link</span>
          </ShareAction>

          <ShareAction
            label="Copy invite link"
            onClick={() => store.copyShareLink()}
            className="h-10 w-10 border border-slate-200 bg-white shadow-sm"
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              className="h-5 w-5 text-slate-700"
            >
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1Zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2Zm0 16H8V7h11v14Z" />
            </svg>
          </ShareAction>
        </div>
      </div>
    </Dialog>
  );
});

export default InviteDialog;
