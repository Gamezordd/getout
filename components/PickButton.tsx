import { useCallback } from "react";
import { observer } from "mobx-react-lite";
import { useAppStore } from "../lib/store/AppStoreProvider";

const PickButton = observer(function PickButton() {
  const store = useAppStore();
  const triggerHaptic = useCallback(() => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(12);
    }
  }, []);

  const handleVote = useCallback(() => {
    if (!store.selectedVenue || !store.currentUserId) return;
    store.applyVote(store.currentUserId, store.selectedVenue.id);
    store.vote(store.selectedVenue.id);
  }, [store]);

  return (
    <div className="w-full inset-x-0 bottom-0 z-[100] bg-mist/95 px-4 pb-3 pt-2 backdrop-blur border-t border-slate-200">
      <button
        type="button"
        onClick={() => {
          triggerHaptic();
          handleVote();
        }}
        disabled={!store.currentUserId}
        className={`w-full rounded-2xl px-4 py-3 text-base font-semibold transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 ${
          store.currentUserId &&
          store.votes?.[store.selectedVenue?.id || ""]?.includes(
            store.currentUserId,
          )
            ? "bg-emerald-700 text-white shadow-emerald-200"
            : "bg-emerald-500 text-white shadow-emerald-300"
        }`}
      >
        {store.currentUserId &&
        store.votes?.[store.selectedVenue?.id || ""]?.includes(
          store.currentUserId,
        )
          ? "Picked"
          : "Pick This Venue"}
      </button>
    </div>
  );
});

export default PickButton;
