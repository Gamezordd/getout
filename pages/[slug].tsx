import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import GroupSession from "../components/GroupSession";
import JoinFlow from "../components/JoinFlow";
import { useAppStore } from "../lib/store/AppStoreProvider";
import { useAuth } from "../lib/auth/AuthProvider";
import { isValidSlug } from "../lib/wordList";

type View = "loading" | "join" | "group" | "error";

function SlugPage() {
  const store = useAppStore();
  const { isNative } = useAuth();
  const router = useRouter();
  const slug = typeof router.query.slug === "string" ? router.query.slug : null;
  const [view, setView] = useState<View>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady || !slug) return;

    if (!isValidSlug(slug)) {
      setErrorMessage("This link is not valid.");
      setView("error");
      return;
    }

    // Store already has this slug wired up (e.g. just created/joined the group)
    if (store.slug === slug && store.identityResolved) {
      setView(store.currentUserId ? "group" : "join");
      return;
    }

    let cancelled = false;

    const resolve = async () => {
      try {
        const res = await fetch(`/api/slugs/resolve?slug=${encodeURIComponent(slug)}`);
        if (!res.ok) {
          if (!cancelled) {
            setErrorMessage("This group link has expired or is no longer valid.");
            setView("error");
          }
          return;
        }
        const { sessionId } = await res.json();
        if (cancelled) return;

        store.setSession(sessionId, "/");
        store.setSlug(slug);

        const browserId = store.browserId;
        if (!browserId) {
          setView("join");
          return;
        }

        const params = new URLSearchParams({ sessionId, browserId });
        const groupRes = await fetch(`/api/group?${params.toString()}`);
        if (!groupRes.ok || cancelled) {
          if (!cancelled) setView("join");
          return;
        }
        const groupData = await groupRes.json();
        if (cancelled) return;

        if (groupData.currentUserId) {
          setView("group");
        } else {
          setView("join");
        }
      } catch {
        if (!cancelled) {
          setErrorMessage("Something went wrong. Please try again.");
          setView("error");
        }
      }
    };

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, slug, store]);

  if (view === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0d]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-[#00e5a0]" />
      </div>
    );
  }

  if (view === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0d] px-6 text-center">
        <p className="font-display text-xl font-bold text-white">Link unavailable</p>
        <p className="text-sm text-[#8b8b9c]">{errorMessage}</p>
        <button
          type="button"
          onClick={() => void router.replace("/landing")}
          className="mt-2 rounded-full bg-[#00e5a0] px-5 py-2.5 text-sm font-bold text-black"
        >
          Start a new group
        </button>
      </div>
    );
  }

  if (view === "join") {
    return (
      <JoinFlow
        onJoined={() => {
          if (store.lockedVenue) {
            void router.replace({
              pathname: "/final",
              query: { sessionId: store.sessionId },
            });
          } else {
            setView("group");
          }
        }}
        onNativeSignInRequired={(redirectUrl) => {
          if (isNative) {
            void router.replace({ pathname: "/login", query: { redirect: redirectUrl } });
          }
        }}
      />
    );
  }

  return (
    <GroupSession
      onBack={() => void router.replace("/dashboard")}
      onLockedVenue={() => {
        void router.replace({
          pathname: "/final",
          query: { sessionId: store.sessionId },
        });
      }}
    />
  );
}

export default observer(SlugPage);
