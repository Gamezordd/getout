import { type ReactNode, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import Dialog from "./Dialog";
import InvitePeoplePickerPanel from "./InvitePeoplePickerPanel";
import { useInvitePeople } from "../hooks/useInvitePeople";
import { useAuth } from "../lib/auth/AuthProvider";
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
  const { authStatus, isNative } = useAuth();
  const inviteState = useInvitePeople();
  const [showInvitePicker, setShowInvitePicker] = useState(false);

  const handleClose = () => {
    if (store.sessionId && typeof window !== "undefined") {
      localStorage.setItem(`getout-invite-shown-${store.sessionId}`, "1");
    }
    setShowInvitePicker(false);
    onClose();
  };

  useEffect(() => {
    if (!isOpen) {
      setShowInvitePicker(false);
    }
  }, [isOpen]);

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
    <>
      <Dialog
        isOpen={isOpen && !showInvitePicker}
        onClose={handleClose}
        title={title}
        description="Invite friends to instantly calculate the best spots and vote to pick one."
      >
        <div className="mt-4 flex w-full flex-col gap-3">
          <div className="flex w-full items-center justify-center gap-3">
            {isNative && authStatus === "signed_in" ? (
              <ShareAction
                label="Invite friends"
                onClick={() => setShowInvitePicker(true)}
                className="gap-2 border border-slate-200 bg-ink flex-grow px-4 py-3 text-sm font-semibold text-white shadow-sm"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  className="h-4 w-4 text-white"
                >
                  <path
                    d="M15 19c0-2.21-1.79-4-4-4s-4 1.79-4 4M11 11a3 3 0 100-6 3 3 0 000 6Zm7 1v6m-3-3h6"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>Invite friends</span>
              </ShareAction>
            ) : (
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
            )}

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

      <Dialog
        isOpen={isOpen && showInvitePicker}
        onClose={() => setShowInvitePicker(false)}
        title="Invite friends"
        description="Search saved friends by name or email, or type an app user's exact email."
        className="max-h-[75svh]"
      >
        <InvitePeoplePickerPanel
          inviteState={inviteState}
          primaryActionLabel={
            inviteState.sendingInvites ? "Sending..." : "Send invites"
          }
          primaryActionDisabled={
            !store.sessionId ||
            inviteState.sendingInvites ||
            inviteState.selectedInvitees.length === 0
          }
          onPrimaryAction={() => {
            if (!store.sessionId) return;
            void inviteState
              .sendInvites({
                sessionId: store.sessionId,
                browserId: store.browserId,
              })
              .then(({ sentCount }) => {
                if (sentCount > 0) {
                  setShowInvitePicker(false);
                }
              })
              .catch(() => undefined);
          }}
          secondaryActionLabel="Back"
          onSecondaryAction={() => setShowInvitePicker(false)}
        />
      </Dialog>
    </>
  );
});

export default InviteDialog;
