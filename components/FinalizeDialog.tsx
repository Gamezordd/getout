import { useState } from "react";
import { observer } from "mobx-react-lite";
import { formatCompactCount } from "../lib/formatCount";
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
  const [finalizing, setFinalizing] = useState(false);
  const votedVenues = store.venues.filter(
    (venue) => (store.votes?.[venue.id]?.length || 0) > 0,
  );
  const leadingVenue = votedVenues[0] || null;
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

  const effectiveSelectedVenueId =
    selectedVenueId && votedVenues.some((venue) => venue.id === selectedVenueId)
      ? selectedVenueId
      : leadingVenue?.id || null;
  const selectedVenue =
    votedVenues.find((venue) => venue.id === effectiveSelectedVenueId) || null;
  const voteCount = selectedVenue ? store.votes?.[selectedVenue.id]?.length || 0 : 0;

  return (
    <Dialog
      isOpen={showFinalizeDialog}
      onClose={() => {
        setSelectedVenueId(null);
        setShowFinalizeDialog(false);
      }}
      title="Finalize venue"
      description="Choose one of the voted venues to lock for everyone in this group."
    >
      <div className="flex flex-col">
        <div className="mt-4 space-y-2">
          {votedVenues.length > 0 ? (
            votedVenues.map((venue, index) => {
              const venueVoteCount = store.votes?.[venue.id]?.length || 0;
              const isSelected = venue.id === effectiveSelectedVenueId;
              return (
                <button
                  key={venue.id}
                  type="button"
                  onClick={() => setSelectedVenueId(venue.id)}
                  className={`flex w-full items-start justify-between gap-3 rounded-[20px] border px-4 py-4 text-left transition ${
                    isSelected
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {venue.name}
                      </p>
                      {index === 0 && (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-700">
                          Leading
                        </span>
                      )}
                    </div>
                    {venue.address && (
                      <p className="mt-1 text-xs text-slate-500">{venue.address}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    {formatCompactCount(venueVoteCount)} {venueVoteCount === 1 ? "vote" : "votes"}
                  </span>
                </button>
              );
            })
          ) : (
            <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs text-slate-600">
                Venues will appear here once they have at least one vote.
              </p>
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={!selectedVenue || finalizing}
          onClick={async () => {
            if (!selectedVenue) return;
            try {
              setFinalizing(true);
              await store.finalizeVenue(selectedVenue.id);
              setSelectedVenueId(null);
              setShowFinalizeDialog(false);
            } catch (err: any) {
              // Keep existing global error surface in store.
            } finally {
              setFinalizing(false);
            }
          }}
          className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {finalizing
            ? "Locking..."
            : selectedVenue
              ? `Lock ${selectedVenue.name}`
              : "Lock venue"}
        </button>
      </div>
    </Dialog>
  );
});

export default FinalizeDialog;
