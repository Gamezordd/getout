import Dialog from "./Dialog";
import { useAppStore } from "../lib/store/AppStoreProvider";

interface Props {
  showGroupSettings: boolean;
  setShowGroupSettings: (open: boolean) => void;
}

export default function GroupSettingsDialog({
  showGroupSettings,
  setShowGroupSettings,
}: Props) {
  const store = useAppStore();
  const venueById = new Map<string, { name: string }>();
  [...store.venues, ...store.manualVenues].forEach((venue) => {
    venueById.set(venue.id, { name: venue.name });
  });

  return (
    <Dialog
      isOpen={showGroupSettings}
      onClose={() => setShowGroupSettings(false)}
      title="Group settings"
      description="Current participants and their picks."
    >
      <div className="mt-4 space-y-2 flex-grow min-h-0 overflow-y-auto">
        {store.users.length === 0 && (
          <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600">
            No participants yet.
          </p>
        )}
        {store.users.map((user) => {
          const pickedVenueId = Object.keys(store.votes || {}).find((venueId) =>
            store.votes?.[venueId]?.includes(user.id)
          );
          const pickedName = pickedVenueId ? venueById.get(pickedVenueId)?.name : null;

          return (
            <div
              key={user.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <img src={user.avatarUrl} alt={user.name} className="h-7 w-7 rounded-full" />
                <div>
                  <p className="text-sm font-semibold text-ink">{user.name}</p>
                  {user.isOrganizer && <p className="text-[11px] text-slate-500">Organizer</p>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-500">
                  {pickedName || "No pick"}
                </span>
                {store.isCurrentUserOrganizer && !user.isOrganizer && (
                  <button
                    type="button"
                    onClick={() => store.removeUser(user.id)}
                    className="rounded-full border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-600"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
