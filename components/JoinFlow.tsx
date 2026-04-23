import { observer } from "mobx-react-lite";
import { useEffect, useMemo, useState } from "react";
import { EntryHeader, EntryShell } from "./entry/EntryFlow";
import { useAuth } from "../lib/auth/AuthProvider";
import { getPreciseJoinLocation } from "../lib/nativePreciseLocation";
import { useAppStore } from "../lib/store/AppStoreProvider";

type Props = {
  onJoined: () => void;
  onNativeSignInRequired?: (redirectUrl: string) => void;
};

function JoinFlow({ onJoined, onNativeSignInRequired }: Props) {
  const store = useAppStore();
  const { authStatus, authenticatedUser, isNative } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loginRedirect = useMemo(() => {
    if (!store.slug) return "/landing";
    return `/${store.slug}`;
  }, [store.slug]);

  useEffect(() => {
    if (!store.sessionId) return;
    if (isNative && authStatus === "signed_out") {
      if (onNativeSignInRequired) {
        onNativeSignInRequired(loginRedirect);
      }
    }
  }, [authStatus, isNative, loginRedirect, onNativeSignInRequired, store.sessionId]);

  useEffect(() => {
    if (!store.sessionId || !store.browserId) return;
    if (isNative && authStatus !== "signed_in") return;

    let cancelled = false;
    const run = async () => {
      try {
        setSubmitting(true);
        setError(null);
        const preciseLocation =
          isNative && authStatus === "signed_in"
            ? await getPreciseJoinLocation({ isNative, promptIfNeeded: false })
            : null;
        await store.joinGroup({
          name: isNative ? authenticatedUser?.displayName : undefined,
          location: preciseLocation?.location,
          locationLabel: preciseLocation?.locationLabel || undefined,
          locationSource: preciseLocation ? "precise" : undefined,
        });
        if (!cancelled) {
          onJoined();
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

    void run();
    return () => {
      cancelled = true;
    };
  }, [authStatus, authenticatedUser?.displayName, isNative, onJoined, store, store.browserId, store.sessionId]);

  if (isNative && authStatus !== "signed_in") {
    return null;
  }

  return (
    <EntryShell>
      <EntryHeader
        title="Joining group"
        subtitle="We're placing you and checking for your latest saved location."
        onBack={() => {
          if (typeof window !== "undefined") window.history.back();
        }}
      />
      <div className="rounded-[24px] border border-white/10 bg-[#141418]/90 p-5 text-center backdrop-blur-sm">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-[#00e5a0]" />
        <p className="font-display text-xl font-bold tracking-[-0.03em] text-white">
          {submitting ? "Getting you in..." : "Almost there"}
        </p>
        <p className="mt-2 text-sm text-[#8b8b9c]">
          If your device location is already available, we&apos;ll use it automatically.
        </p>
        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
      </div>
    </EntryShell>
  );
}

export default observer(JoinFlow);
