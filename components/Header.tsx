import { useCallback, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import useInstallPrompt from "../hooks/useInstallPrompt";
import { useAuth } from "../lib/auth/AuthProvider";
import { useAppStore } from "../lib/store/AppStoreProvider";

type HeaderProps = {
  onInviteClick: () => void;
};

export const Header = observer(function Header({ onInviteClick }: HeaderProps) {
  const store = useAppStore();
  const { authenticatedUser, isNative } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const { canInstall, triggerInstall } = useInstallPrompt();

  const handleEditLocation = useCallback(() => {
    if (!store.sessionId) return;
    router.push({
      pathname: "/edit",
      query: { sessionId: store.sessionId },
    });
  }, [router, store.sessionId]);

  const handleAddVenue = useCallback(() => {
    if (!store.sessionId) return;
    router.push({
      pathname: "/add-venue",
      query: { sessionId: store.sessionId },
    });
  }, [router, store.sessionId]);

  useEffect(() => {
    if (!menuOpen) return;

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!menuRef.current || !target) return;
      if (!menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0a0a0d]/90 px-4 py-3 backdrop-blur-xl">
      <div className="mx-auto relative flex max-w-[430px] items-center justify-between gap-3">
        <h1 className="font-display text-xl font-extrabold tracking-[-0.04em] text-[#f0f0f5]">
          Get<span className="text-[#00e5a0]">Out</span>
        </h1>
        <div className="flex items-center gap-2">
          {store.shareUrl && (
            <button
              type="button"
              onClick={onInviteClick}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#1c1c22] px-3 py-1.5 text-[11px] font-semibold text-[#f0f0f5]"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
                className="h-3.5 w-3.5 text-[#00e5a0]"
              >
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a2.98 2.98 0 0 0 0-1.39l7-4.11A2.99 2.99 0 1 0 14 5a3 3 0 0 0 .05.54l-7 4.11a3 3 0 1 0 0 4.7l7.05 4.14c-.03.17-.05.34-.05.51a3 3 0 1 0 3-2.92Z" />
              </svg>
              <span>Invite</span>
            </button>
          )}
          {store.sessionId && (
            <button
              type="button"
              onClick={handleAddVenue}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#00e5a0] px-3 py-1.5 text-[11px] font-bold text-black"
              aria-label="Add venue"
            >
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
                className="h-3.5 w-3.5 text-black"
              >
                <path d="M10 2a6 6 0 0 1 6 6c0 4.418-4.5 8.667-5.37 9.46a1 1 0 0 1-1.26 0C8.5 16.667 4 12.418 4 8a6 6 0 0 1 6-6zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
                <path d="M10 6.5a.5.5 0 0 1 .5.5v1.5H12a.5.5 0 0 1 0 1h-1.5V11a.5.5 0 0 1-1 0V9.5H8a.5.5 0 0 1 0-1h1.5V7a.5.5 0 0 1 .5-.5z" />
              </svg>
              <span>Add venue</span>
            </button>
          )}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="rounded-full border border-white/10 bg-[#141418] p-2 text-[#f0f0f5]"
              aria-label="Open menu"
            >
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
                className="h-4 w-4"
              >
                <path d="M10 4.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 7a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 7a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-12 z-20 w-48 rounded-2xl border border-white/10 bg-[#141418] p-1.5 shadow-2xl">
                {canInstall && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      void triggerInstall();
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#f0f0f5] hover:bg-white/5"
                  >
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                      className="h-4 w-4 text-[#8b8b9c]"
                    >
                      <path d="M10 2a1 1 0 0 1 1 1v7.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 3.99a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.41L9 10.6V3a1 1 0 0 1 1-1Z" />
                      <path d="M4 14a1 1 0 0 1 1 1v1h10v-1a1 1 0 1 1 2 0v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1a1 1 0 0 1 1-1Z" />
                    </svg>
                    Add to homescreen
                  </button>
                )}
                <a
                  href="/create"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#f0f0f5] hover:bg-white/5"
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                    className="h-4 w-4 text-[#8b8b9c]"
                  >
                    <path d="M10 2a1 1 0 011 1v6h6a1 1 0 110 2h-6v6a1 1 0 11-2 0v-6H3a1 1 0 110-2h6V3a1 1 0 011-1z" />
                  </svg>
                  Create new group
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    handleEditLocation();
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#f0f0f5] hover:bg-white/5"
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                    className="h-4 w-4 text-[#8b8b9c]"
                  >
                    <path d="M17.414 2.586a2 2 0 0 0-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 0 0 0-2.828z" />
                    <path d="M5 14a1 1 0 0 0-1 1v2h2a1 1 0 0 0 1-1v-1.586l-2 2V14z" />
                  </svg>
                  Edit location
                </button>
                {isNative && authenticatedUser ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/profile");
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#f0f0f5] hover:bg-white/5"
                  >
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                      className="h-4 w-4 text-[#8b8b9c]"
                    >
                      <path d="M10 2a4 4 0 100 8 4 4 0 000-8ZM4 16a6 6 0 1112 0H4Z" />
                    </svg>
                    Profile
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
});
