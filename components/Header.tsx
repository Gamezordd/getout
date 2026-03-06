import { useCallback, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useAppStore } from "../lib/store/AppStoreProvider";
import { useRouter } from "next/router";

interface Props {
  onFinalizeClick: () => void;
}

export const Header = observer(function Header({ onFinalizeClick }: Props) {
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

  const canFinalize =
    store.isCurrentUserOrganizer &&
    store.hasFinalizeQuorum &&
    !store.lockedVenue;

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
          {store.sessionId && (
            <button
              type="button"
              onClick={handleAddVenue}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600"
              aria-label="Add venue"
            >
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
                className="h-3.5 w-3.5 text-slate-500"
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
                <a
                  href="/create"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMenuOpen(false)}
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
                  Create new group
                </a>
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
                    <path d="M10 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm-7 6a6 6 0 0 1 12 0 1 1 0 1 1-2 0 4 4 0 0 0-8 0 1 1 0 0 1-2 0Zm13-5a1 1 0 0 1 1 1v1h1a1 1 0 1 1 0 2h-1v1a1 1 0 1 1-2 0v-1h-1a1 1 0 1 1 0-2h1v-1a1 1 0 0 1 1-1Z" />
                  </svg>
                  Add user
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    handleEditLocation();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-slate-100"
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                    className="h-4 w-4 text-slate-500"
                  >
                    <path d="M17.414 2.586a2 2 0 0 0-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 0 0 0-2.828z" />
                    <path d="M5 14a1 1 0 0 0-1 1v2h2a1 1 0 0 0 1-1v-1.586l-2 2V14z" />
                  </svg>
                  Edit location
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
});
