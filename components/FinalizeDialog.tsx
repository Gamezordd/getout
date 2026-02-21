import { useState } from "react";
import { observer } from "mobx-react-lite";
import Dialog from "./Dialog";
import { useAppStore } from "../lib/store/AppStoreProvider";

interface Props {
  showFinalizeDialog: boolean;
  setShowFinalizeDialog: (open: boolean) => void;
}
const FinalizeDialog = observer(function FinalizeDialog({
  showFinalizeDialog,
  setShowFinalizeDialog,
}: Props) {
  const store = useAppStore();
  const [finalizeVenueId, setFinalizeVenueId] = useState<string | null>(
    store.votedVenues.length > 0 ? store.votedVenues[0].id : null,
  );
  const [finalizing, setFinalizing] = useState(false);

  return (
    <Dialog
      isOpen={showFinalizeDialog}
      onClose={() => setShowFinalizeDialog(false)}
      title="Finalize venue"
      description="Select one of the voted venues to lock for this group."
    >
      <div className="flex flex-col">
        <div className="mt-4 max-h-56 space-y-2 overflow-y-auto">
          {store.votedVenues.length === 0 && (
            <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600">
              No voted venues yet.
            </p>
          )}
          {store.votedVenues.map((venue) => (
            <label
              key={venue.id}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-3 py-2"
            >
              <input
                type="radio"
                name="finalize-venue"
                checked={finalizeVenueId === venue.id}
                onChange={() => setFinalizeVenueId(venue.id)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-semibold text-iletnk">{venue.name}</p>
                <p className="text-xs text-slate-500">{venue.address}</p>
              </div>
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={!finalizeVenueId || finalizing}
          onClick={async () => {
            if (!finalizeVenueId) return;
            try {
              setFinalizing(true);
              await store.finalizeVenue(finalizeVenueId);
              setShowFinalizeDialog(false);
            } catch (err: any) {
              // Keep existing global error surface in store.
            } finally {
              setFinalizing(false);
            }
          }}
          className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {finalizing ? "Locking..." : "Lock venue"}
        </button>
      </div>
    </Dialog>
  );
});

export default FinalizeDialog;
