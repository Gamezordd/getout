import { observer } from "mobx-react-lite";
import Dialog from "./Dialog";
import { useAppStore } from "../lib/store/AppStoreProvider";

const LockedVenueDialog = observer(function LockedVenueDialog() {
  const store = useAppStore();

  if (!store.lockedVenue || !store.currentUserId) return null;

  return (
    <Dialog
      isOpen={!!store.lockedVenue && !!store.currentUserId}
      onClose={() => {}} // Persistent dialog
      title="Venue locked"
      description="Voting has ended. GetOut to:"
    >
      <div className=" flex flex-col">
        <p className="mt-2 text-sm font-semibold text-ink">
          {store.lockedVenue.name}
        </p>
        <p className="mt-1 text-xs text-slate-500">{store.lockedVenue.address}</p>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            `${store.lockedVenue.name} ${store.lockedVenue.address || ""}`.trim(),
          )}`}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white"
        >
          Open in Google Maps
        </a>
        <div className="my-3 h-px w-full bg-slate-200" />
        <a
          href="/create"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
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
      </div>
    </Dialog>
  );
});

export default LockedVenueDialog;
