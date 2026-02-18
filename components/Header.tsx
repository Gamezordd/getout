import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "../lib/store/AppStoreProvider";
import { useRouter } from "next/router";

interface Props {
  onFinalizeClick: () => void;
}

export function Header({ onFinalizeClick }: Props) {
  const store = useAppStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const handleAddSelf = useCallback(() => {
    if (!store.sessionId) return;
    router.push({
      pathname: "/join",
      query: { sessionId: store.sessionId, addUser: "1" },
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

  const canFinalize =
    store.isCurrentUserOrganizer && store.hasFinalizeQuorum && !store.lockedVenue;

  return (
    <header className="inset-x-0 w-full top-0 z-10 bg-white/90 px-4 py-2.5 shadow-sm backdrop-blur">
      <div className="relative flex items-center justify-between gap-3">
        <h1 className="text-base font-semibold text-ink">GetOut</h1>
        <div className="flex items-center gap-2">
          {store.shareUrl && (
            <button
              type="button"
              onClick={store.copyShareLink}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600"
            >
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
                className="h-3.5 w-3.5 text-slate-500"
              >
                <path d="M7 3a2 2 0 00-2 2v1a1 1 0 11-2 0V5a4 4 0 014-4h6a4 4 0 014 4v6a4 4 0 01-4 4h-1a1 1 0 110-2h1a2 2 0 002-2V5a2 2 0 00-2-2H7z" />
                <path d="M3 9a4 4 0 014-4h6a4 4 0 014 4v6a4 4 0 01-4 4H7a4 4 0 01-4-4V9zm4-2a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2V9a2 2 0 00-2-2H7z" />
              </svg>
              <span>{store.copyStatus || "Copy link"}</span>
            </button>
          )}
          {store.isCurrentUserOrganizer && (
            <button
              type="button"
              disabled={!canFinalize}
              onClick={() => {
                onFinalizeClick();
              }}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                canFinalize
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "border border-slate-200 text-slate-400"
              }`}
            >
              Finalize
            </button>
          )}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="rounded-full border border-slate-200 p-1.5 text-slate-600"
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
              <div className="absolute right-0 top-10 z-20 w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    handleAddSelf();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-slate-100"
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                    className="h-4 w-4 text-slate-500"
                  >
                    <path d="M10 2a1 1 0 011 1v6h6a1 1 0 110 2h-6v6a1 1 0 11-2 0v-6H3a1 1 0 110-2h6V3a1 1 0 011-1z" />
                  </svg>
                  Add user
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    handleAddVenue();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-slate-100"
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                    className="h-4 w-4 text-slate-500"
                  >
                    <path d="M10 2a1 1 0 011 1v1.05A7.002 7.002 0 0116.95 10H18a1 1 0 110 2h-1.05A7.002 7.002 0 0111 17.95V19a1 1 0 11-2 0v-1.05A7.002 7.002 0 013.05 12H2a1 1 0 110-2h1.05A7.002 7.002 0 019 4.05V3a1 1 0 011-1zm0 4a4 4 0 100 8 4 4 0 000-8z" />
                  </svg>
                  Add venue
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
