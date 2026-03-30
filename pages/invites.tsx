import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { EntryHeader, EntryShell } from "../components/entry/EntryFlow";
import type { InviteListItem } from "../lib/authTypes";
import { useAuth } from "../lib/auth/AuthProvider";

function InvitesPage() {
  const router = useRouter();
  const { authStatus, isNative } = useAuth();
  const [invites, setInvites] = useState<InviteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady || !isNative || authStatus === "unknown") return;
    if (authStatus === "signed_out") {
      void router.replace({
        pathname: "/login",
        query: { redirect: "/invites" },
      });
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/invites");
        const payload = (await response.json().catch(() => ({}))) as {
          invites?: InviteListItem[];
          message?: string;
        };
        if (!response.ok) {
          throw new Error(payload.message || "Unable to load invites.");
        }
        setInvites(payload.invites || []);
      } catch (err: any) {
        setError(err.message || "Unable to load invites.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [authStatus, isNative, router, router.isReady]);

  if (!isNative || authStatus !== "signed_in") {
    return null;
  }

  return (
    <EntryShell>
      <EntryHeader
        title="Invites"
        subtitle="Groups waiting on your contribution"
        onBack={() => router.push("/dashboard")}
      />
      <div className="space-y-3">
        {loading ? (
          <div className="rounded-[24px] border border-white/10 bg-[#141418]/90 p-6 text-center text-sm text-[#8b8b9c]">
            Loading invites...
          </div>
        ) : null}
        {error ? (
          <div className="rounded-[24px] border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error}
          </div>
        ) : null}
        {!loading && !error && invites.length === 0 ? (
          <div className="rounded-[24px] border border-white/10 bg-[#141418]/90 p-6 text-center">
            <div className="text-4xl">✉</div>
            <p className="mt-3 font-display text-xl font-bold tracking-[-0.03em] text-white">
              No pending invites
            </p>
            <p className="mt-2 text-sm text-[#8b8b9c]">
              When friends invite you into a group, it will show up here.
            </p>
          </div>
        ) : null}
        {invites.map((invite) => (
          <button
            key={invite.id}
            type="button"
            onClick={() => router.push(invite.joinUrl)}
            className="w-full rounded-[24px] border border-white/10 bg-[#141418]/90 p-5 text-left backdrop-blur-sm"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#00e5a0]">
              Pending invite
            </p>
            <p className="mt-2 font-display text-xl font-bold tracking-[-0.03em] text-white">
              {invite.inviter.displayName}
            </p>
            <p className="mt-2 text-sm text-[#8b8b9c]">
              Invited you to contribute to a group. Open the join flow and we&apos;ll take you there directly.
            </p>
            <div className="mt-4 inline-flex rounded-full bg-[#00e5a0] px-4 py-2 text-xs font-bold text-black">
              Open invite
            </div>
          </button>
        ))}
      </div>
    </EntryShell>
  );
}

export default observer(InvitesPage);
