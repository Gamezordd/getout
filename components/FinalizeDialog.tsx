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
  const selectedVenue = store.selectedVenue;
  const voteCount = selectedVenue ? store.votes?.[selectedVenue.id]?.length || 0 : 0;

  return (
    <Dialog
      isOpen={showFinalizeDialog}
      onClose={() => setShowFinalizeDialog(false)}
      title="Finalize venue"
      description="Lock the currently selected venue for everyone in this group."
    >
      <div className="flex flex-col">
        <div className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
          {selectedVenue ? (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {selectedVenue.name}
                  </p>
                  {selectedVenue.address && (
                    <p className="mt-1 text-xs text-slate-500">
                      {selectedVenue.address}
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                  {formatCompactCount(voteCount)} {voteCount === 1 ? "vote" : "votes"}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                This will lock the selected venue and end venue selection for the group.
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-600">
              No venue is currently selected.
            </p>
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
              setShowFinalizeDialog(false);
            } catch (err: any) {
              // Keep existing global error surface in store.
            } finally {
              setFinalizing(false);
            }
          }}
          className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {finalizing ? "Locking..." : "Lock selected venue"}
        </button>
      </div>
    </Dialog>
  );
});

export default FinalizeDialog;
