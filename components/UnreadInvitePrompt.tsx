import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Dialog from "./Dialog";
import type { InviteListItem } from "../lib/authTypes";
import { useAuth } from "../lib/auth/AuthProvider";

export default function UnreadInvitePrompt() {
  const router = useRouter();
  const { authStatus, isNative, startupResolved } = useAuth();
  const [invite, setInvite] = useState<InviteListItem | null>(null);
  const [open, setOpen] = useState(false);
  const lastCheckedUserStateRef = useRef<string | null>(null);

  useEffect(() => {
    if (!router.isReady || !startupResolved || !isNative) return;

    if (authStatus !== "signed_in") {
      lastCheckedUserStateRef.current = null;
      setInvite(null);
      setOpen(false);
      return;
    }

    if (
      router.pathname === "/login" ||
      router.pathname === "/join" ||
      router.pathname === "/invites" ||
      router.pathname === "/collections"
    ) {
      return;
    }

    if (lastCheckedUserStateRef.current === authStatus) {
      return;
    }

    lastCheckedUserStateRef.current = authStatus;

    const load = async () => {
      const response = await fetch("/api/invites/latest-unread");
      const payload = (await response.json().catch(() => ({}))) as {
        invite?: InviteListItem | null;
      };
      if (!response.ok || !payload.invite) {
        return;
      }
      setInvite(payload.invite);
      setOpen(true);
    };

    void load();
  }, [authStatus, isNative, router, router.isReady, router.pathname, startupResolved]);

  if (!isNative || !invite) {
    return null;
  }

  return (
    <Dialog
      isOpen={open}
      onClose={() => setOpen(false)}
      title="Group invite waiting"
      description={`${invite.inviter.displayName} invited you to contribute to a group.`}
      overlayClassName="items-end pb-24"
      contentClassName="items-end"
    >
      <div className="mt-4 w-full space-y-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-600">
            Most recent invite
          </p>
          <p className="mt-2 text-sm text-slate-700">
            Open the join flow now or find it later in your Invites inbox.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void router.push(invite.joinUrl);
            }}
            className="flex-1 rounded-2xl bg-[#00e5a0] px-4 py-3 text-sm font-bold text-black"
          >
            Join now
          </button>
        </div>
      </div>
    </Dialog>
  );
}
