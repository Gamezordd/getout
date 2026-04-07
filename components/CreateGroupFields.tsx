import Dialog from "./Dialog";
import type { CreateGroupFlowState } from "../hooks/useCreateGroupFlow";
import { CATEGORY_OPTIONS } from "../lib/entryFlow";

type CreateGroupFieldsProps = {
  flow: CreateGroupFlowState;
  className?: string;
  variant?: "default" | "sheet";
};

export default function CreateGroupFields({
  flow,
  className = "",
  variant = "default",
}: CreateGroupFieldsProps) {
  const {
    authStatus,
    category,
    emailLookupLoading,
    emailLookupResult,
    error,
    filteredFriendResults,
    friendsLoading,
    inviteDialogOpen,
    inviteSearchValue,
    isNative,
    selectedInvitees,
    setCategory,
    setInviteDialogOpen,
    setInviteSearchValue,
    setSelectedInvitees,
  } = flow;
  const isSheetVariant = variant === "sheet";

  return (
    <>
      <div className={className}>
        <div className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-[#5e5e74]">
          Looking for
        </div>
        <div
          className="mt-2 grid grid-cols-3 gap-[7px]"
        >
          {CATEGORY_OPTIONS.map((option) => {
            const isSelected = option.value === category;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setCategory(option.value)}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] px-2 py-3 text-center transition active:scale-[0.95] ${
                  isSelected
                    ? "border-[#00e5a0] bg-[rgba(0,229,160,0.11)]"
                    : isSheetVariant
                      ? "border-white/10 bg-[#1c1c22]"
                      : "border-white/10 bg-[#141418]"
                }`}
              >
                <span className="text-[21px] leading-none">{option.emoji}</span>
                <span
                  className={`text-[12.5px] font-semibold ${
                    isSelected ? "text-[#00e5a0]" : "text-[#5e5e74]"
                  }`}
                >
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>

        {isNative && authStatus === "signed_in" ? (
          <div className={isSheetVariant ? "mb-5 mt-5" : "mb-5 mt-8"}>
            <button
              type="button"
              onClick={() => setInviteDialogOpen(true)}
              className={
                isSheetVariant
                  ? "flex w-full items-center justify-between rounded-[14px] border-[1.5px] border-white/10 bg-[#1c1c22] px-4 py-[13px] text-left transition active:scale-[0.99]"
                  : "flex w-full items-center justify-between rounded-2xl border border-white/10 bg-[#141418] px-4 py-3 text-left transition active:scale-[0.99]"
              }
            >
              <div className="min-w-0">
                <div className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-[#5e5e74]">
                  Invite people
                </div>
                <div className="mt-1 truncate text-[14px] font-semibold text-white">
                  {friendsLoading
                    ? "Loading contacts..."
                    : selectedInvitees.length > 0
                      ? `${selectedInvitees.length} selected`
                      : "Open invite picker"}
                </div>
              </div>
              {isSheetVariant ? (
                <svg
                  width="16"
                  height="16"
                  fill="none"
                  viewBox="0 0 16 16"
                  className="ml-3 shrink-0 text-[#5e5e74]"
                  aria-hidden="true"
                >
                  <path
                    d="M6 3l5 5-5 5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <div className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-semibold text-[#00e5a0]">
                  Open
                </div>
              )}
            </button>
            {!isSheetVariant ? (
              <p className="mt-2 text-[12px] leading-5 text-[#5e5e74]">
                Pick friends before creating the group. Invites are sent right after
                creation.
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 text-[13px] leading-5 text-rose-300">{error}</p>
        ) : null}
        {!isSheetVariant ? (
          <p className="mt-3 text-[12px] leading-5 text-[#5e5e74]">
            {isNative
              ? "Your Google profile name is used automatically for mobile-created groups."
              : "We'll start with an approximate location, then ask for precise access inside the group."}
          </p>
        ) : null}
      </div>

      <Dialog
        isOpen={inviteDialogOpen}
        onClose={() => setInviteDialogOpen(false)}
        title="Invite people"
        description="Search saved friends by name or email, or type an app user's exact email."
        className="max-h-[75svh]"
      >
        <div className="mt-4 flex w-full flex-col">
          <input
            value={inviteSearchValue}
            onChange={(event) => setInviteSearchValue(event.target.value)}
            placeholder="Search friends or enter email"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
          />
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
            {filteredFriendResults.map((result) => {
              const isSelected = selectedInvitees.some(
                (entry) => entry.id === result.id,
              );
              return (
                <button
                  key={result.id}
                  type="button"
                  onClick={() =>
                    setSelectedInvitees((current) =>
                      isSelected
                        ? current.filter((entry) => entry.id !== result.id)
                        : [...current, result],
                    )
                  }
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
                onClick={() =>
                  setSelectedInvitees((current) => {
                    const alreadySelected = current.some(
                      (entry) => entry.id === emailLookupResult.id,
                    );
                    if (alreadySelected) {
                      return current.filter(
                        (entry) => entry.id !== emailLookupResult.id,
                      );
                    }
                    return [...current, emailLookupResult];
                  })
                }
                className={`w-full rounded-2xl border px-4 py-3 text-left ${
                  selectedInvitees.some(
                    (entry) => entry.id === emailLookupResult.id,
                  )
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
            <button
              type="button"
              onClick={() => setInviteDialogOpen(false)}
              className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
            >
              Done
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
