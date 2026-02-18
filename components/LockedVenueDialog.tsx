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
    </Dialog>
  );
});

export default LockedVenueDialog;
