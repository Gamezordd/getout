import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { EntryHeader, EntryShell } from "../components/entry/EntryFlow";
import { useAuth } from "../lib/auth/AuthProvider";
import { useAppStore } from "../lib/store/AppStoreProvider";

function JoinPage() {
  const store = useAppStore();
  const { authStatus, authenticatedUser, isNative } = useAuth();
  const router = useRouter();
  const sessionId =
    typeof router.query.sessionId === "string" ? router.query.sessionId : "";
  const loginRedirect = useMemo(
    () =>
      sessionId
        ? `/join?sessionId=${encodeURIComponent(sessionId)}`
        : "/landing",
    [sessionId],
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    if (!sessionId) {
      router.replace({ pathname: "/landing" }, undefined, { shallow: true });
      return;
    }
    store.setSession(sessionId, "/");
  }, [router, router.isReady, sessionId, store]);

  useEffect(() => {
    if (!router.isReady || !isNative || authStatus !== "signed_out") return;
    void router.replace({
      pathname: "/login",
      query: { redirect: loginRedirect },
    });
  }, [authStatus, isNative, loginRedirect, router, router.isReady]);

  useEffect(() => {
    if (!router.isReady || !sessionId || !store.browserId) return;
    if (isNative && authStatus !== "signed_in") return;

    let cancelled = false;
    const run = async () => {
      try {
        setSubmitting(true);
        setError(null);
        await store.joinGroup({
          name: isNative ? authenticatedUser?.displayName : undefined,
        });
        if (!cancelled) {
          if(!store.lockedVenue){
            return router.replace({ pathname: "/", query: { sessionId } });
          }
          return router.replace(
            { pathname: "/final", query: { sessionId: store.sessionId } },
            undefined,
            {
              shallow: true,
            },
          );
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Unable to join group.");
        }
      } finally {
        if (!cancelled) {
          setSubmitting(false);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [
    authStatus,
    authenticatedUser?.displayName,
    isNative,
    router,
    router.isReady,
    sessionId,
    store,
    store.browserId,
  ]);

  if (isNative && authStatus !== "signed_in") {
    return null;
  }

  return (
    <EntryShell>
      <EntryHeader
        title="Joining group"
        subtitle="We’re placing you using your approximate location first."
        onBack={() => router.push("/landing")}
      />
      <div className="rounded-[24px] border border-white/10 bg-[#141418]/90 p-5 text-center backdrop-blur-sm">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-[#00e5a0]" />
        <p className="font-display text-xl font-bold tracking-[-0.03em] text-white">
          {submitting ? "Getting you in..." : "Almost there"}
        </p>
        <p className="mt-2 text-sm text-[#8b8b9c]">
          We&apos;ll ask for precise location after you enter the group so suggestions get closer to you.
        </p>
        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
      </div>
    </EntryShell>
  );
}

export default observer(JoinPage);
