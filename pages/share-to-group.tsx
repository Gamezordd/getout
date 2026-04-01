import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { EntryHeader, EntryShell } from "../components/entry/EntryFlow";
import type { RecentGroupSummary } from "../lib/authTypes";
import { useAuth } from "../lib/auth/AuthProvider";
import { isGoogleMapsShareUrl } from "../lib/nativeShare";

function ShareToGroupPage() {
  const router = useRouter();
  const { authStatus, isNative } = useAuth();
  const sharedMapsUrl =
    typeof router.query.sharedMapsUrl === "string"
      ? router.query.sharedMapsUrl
      : "";
  const [groups, setGroups] = useState<RecentGroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const redirectTarget = useMemo(() => {
    if (!sharedMapsUrl) return "/share-to-group";
    return buildRedirectRoute(sharedMapsUrl);
  }, [sharedMapsUrl]);

  useEffect(() => {
    if (!router.isReady || !sharedMapsUrl) {
      return;
    }
    if (!isGoogleMapsShareUrl(sharedMapsUrl)) {
      setError("Only Google Maps links can be added to a group right now.");
    }
  }, [router.isReady, sharedMapsUrl]);

  useEffect(() => {
    if (!router.isReady || !isNative || authStatus === "unknown") return;
    if (!sharedMapsUrl) {
      void router.replace("/dashboard");
      return;
    }
    if (authStatus === "signed_out") {
      void router.replace({
        pathname: "/login",
        query: { redirect: redirectTarget },
      });
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/recent-groups");
        const payload = (await response.json().catch(() => ({}))) as {
          groups?: RecentGroupSummary[];
          message?: string;
        };
        if (!response.ok) {
          throw new Error(payload.message || "Unable to load recent groups.");
        }
        setGroups((payload.groups || []).filter((group) => group.status === "live"));
      } catch (err: any) {
        setError(err.message || "Unable to load recent groups.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [authStatus, isNative, redirectTarget, router, router.isReady, sharedMapsUrl]);

  if (!isNative || authStatus !== "signed_in") {
    return null;
  }

  return (
    <EntryShell>
      <EntryHeader
        title="Choose a group"
        subtitle="Pick the live group that should receive this shared place"
        onBack={() => router.push("/dashboard")}
      />
      <div className="space-y-3 overflow-y-auto pb-6">
        <div className="rounded-[24px] border border-white/10 bg-[#141418]/90 p-4 text-sm text-[#8b8b9c]">
          <div className="font-semibold text-white">Shared Google Maps link</div>
          <div className="mt-2 break-all">{sharedMapsUrl}</div>
        </div>

        {loading ? (
          <div className="rounded-[24px] border border-white/10 bg-[#141418]/90 p-6 text-center text-sm text-[#8b8b9c]">
            Loading live groups...
          </div>
        ) : null}

        {error ? (
          <div className="rounded-[24px] border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        {!loading && !error && groups.length === 0 ? (
          <div className="rounded-[24px] border border-white/10 bg-[#141418]/90 p-6 text-center">
            <div className="text-4xl">🪩</div>
            <div className="mt-3 font-display text-xl font-bold tracking-[-0.03em] text-white">
              No live groups available
            </div>
            <div className="mt-2 text-sm text-[#8b8b9c]">
              Open or create a live group first, then share the place again.
            </div>
          </div>
        ) : null}

        {groups.map((group) => (
          <button
            key={group.sessionId}
            type="button"
            onClick={() =>
              router.push({
                pathname: "/add-venue",
                query: {
                  sessionId: group.sessionId,
                  sharedMapsUrl,
                },
              })
            }
            className="flex w-full overflow-hidden rounded-[24px] border border-white/10 bg-[#141418]/90 text-left backdrop-blur-sm"
          >
            <div className="h-[104px] w-[104px] shrink-0 bg-[#1c1c22]">
              {group.imageUrl ? (
                <img
                  src={group.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-3xl">
                  🎉
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 p-4">
              <div className="font-display text-xl font-bold tracking-[-0.03em] text-white">
                {group.title}
              </div>
              <div className="mt-2 text-sm text-[#8b8b9c]">{group.subtitle}</div>
              <div className="mt-4 inline-flex rounded-full bg-[#00e5a0] px-4 py-2 text-xs font-bold text-black">
                Add place to this group
              </div>
            </div>
          </button>
        ))}
      </div>
    </EntryShell>
  );
}

const buildRedirectRoute = (sharedMapsUrl: string) =>
  `/share-to-group?sharedMapsUrl=${encodeURIComponent(sharedMapsUrl)}`;

export default observer(ShareToGroupPage);
