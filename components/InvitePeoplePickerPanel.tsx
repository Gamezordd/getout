import type { InviteCandidate } from "../hooks/useInvitePeople";

type InvitePeoplePickerState = {
  additionalSelectedInvitees: InviteCandidate[];
  emailLookupLoading: boolean;
  emailLookupResult: InviteCandidate | null;
  filteredFriendResults: InviteCandidate[];
  friendsLoading: boolean;
  inviteError: string | null;
  inviteSearchValue: string;
  selectedInvitees: InviteCandidate[];
  setInviteSearchValue: (value: string) => void;
  toggleInvitee: (invitee: InviteCandidate) => void;
};

type InvitePeoplePickerPanelProps = {
  inviteState: InvitePeoplePickerState;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  primaryActionDisabled?: boolean;
  secondaryActionLabel?: string;
  onSecondaryAction: () => void;
};

export default function InvitePeoplePickerPanel({
  inviteState,
  primaryActionLabel,
  onPrimaryAction,
  primaryActionDisabled = false,
  secondaryActionLabel = "Done",
  onSecondaryAction,
}: InvitePeoplePickerPanelProps) {
  const {
    additionalSelectedInvitees,
    emailLookupLoading,
    emailLookupResult,
    filteredFriendResults,
    friendsLoading,
    inviteError,
    inviteSearchValue,
    selectedInvitees,
    setInviteSearchValue,
    toggleInvitee,
  } = inviteState;

  return (
    <div className="mt-4 flex w-full flex-col">
      <input
        value={inviteSearchValue}
        onChange={(event) => setInviteSearchValue(event.target.value)}
        placeholder="Search friends or enter email"
        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
      />
      {inviteError ? (
        <p className="mt-3 text-sm text-rose-300">{inviteError}</p>
      ) : null}
      <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {friendsLoading ? (
          <p className="text-sm text-slate-500">Loading friends...</p>
        ) : null}
        {!friendsLoading &&
        filteredFriendResults.length === 0 &&
        !emailLookupResult ? (
          <p className="text-sm text-slate-500">
            No matching friends yet. Try an exact app-user email.
          </p>
        ) : null}
        {additionalSelectedInvitees.map((result) => {
          const isSelected = selectedInvitees.some(
            (entry) => entry.id === result.id,
          );
          return (
            <button
              key={result.id}
              type="button"
              onClick={() => toggleInvitee(result)}
              className={`w-full rounded-2xl border px-4 py-3 text-left ${
                isSelected
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {result.displayName}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {result.email}
                  </p>
                </div>
                <span className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  {result.isFriend ? "Friend" : "App user"}
                </span>
              </div>
            </button>
          );
        })}
        {filteredFriendResults.map((result) => {
          const isSelected = selectedInvitees.some(
            (entry) => entry.id === result.id,
          );
          return (
            <button
              key={result.id}
              type="button"
              onClick={() => toggleInvitee(result)}
              className={`w-full rounded-2xl border px-4 py-3 text-left ${
                isSelected
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {result.displayName}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {result.email}
                  </p>
                </div>
                <span className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Friend
                </span>
              </div>
            </button>
          );
        })}
        {emailLookupLoading ? (
          <p className="text-sm text-slate-500">Checking app user...</p>
        ) : null}
        {emailLookupResult &&
        !filteredFriendResults.some(
          (friend) => friend.id === emailLookupResult.id,
        ) ? (
          <button
            type="button"
            onClick={() => toggleInvitee(emailLookupResult)}
            className={`w-full rounded-2xl border px-4 py-3 text-left ${
              selectedInvitees.some((entry) => entry.id === emailLookupResult.id)
                ? "border-emerald-500 bg-emerald-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {emailLookupResult.displayName}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {emailLookupResult.email}
                </p>
              </div>
              <span className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                {emailLookupResult.isFriend ? "Friend" : "App user"}
              </span>
            </div>
          </button>
        ) : null}
      </div>
      <div className="mt-4 flex gap-2">
        {primaryActionLabel && onPrimaryAction ? (
          <button
            type="button"
            onClick={onPrimaryAction}
            disabled={primaryActionDisabled}
            className="flex-1 rounded-2xl bg-[#00e5a0] px-4 py-3 text-sm font-semibold text-black disabled:opacity-60"
          >
            {primaryActionLabel}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onSecondaryAction}
          className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
        >
          {secondaryActionLabel}
        </button>
      </div>
    </div>
  );
}
