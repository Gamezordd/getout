import { Fragment } from "react";
import type { ReactNode } from "react";
import PlaceSearch, { PlaceResult } from "../PlaceSearch";
import TranslucentSelect from "../TranslucentSelect";
import { CATEGORY_OPTIONS, CLOSE_VOTING_OPTIONS, getVenueCategoryLabel } from "../../lib/entryFlow";
import type { VenueCategory } from "../../lib/types";

const collageImages = [
  "https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=600&q=70",
  "https://images.unsplash.com/photo-1559329007-40df8a9345d8?w=600&q=70",
  "https://images.unsplash.com/photo-1587899897387-091ebd01a6b2?w=600&q=70",
  "https://images.unsplash.com/photo-1574096079513-d8259312b785?w=600&q=70",
  "https://images.unsplash.com/photo-1551632436-cbf8dd35adfa?w=600&q=70",
  "https://images.unsplash.com/photo-1525268323446-0505b6fe7778?w=600&q=70",
  "https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=600&q=70",
  "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=600&q=70",
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&q=70",
];

const tickerItems = [
  "🍸 Ravi's crew picked Pangeo · 3m ago",
  "🎉 5 friends heading to Church St Social",
  "📍 Sana just joined a group in Bengaluru",
  "⚡ Decided in 4 minutes · no WhatsApp drama",
];

type EntryShellProps = {
  children: ReactNode;
};

export function EntryShell({ children }: EntryShellProps) {
  return (
    <main className="relative min-h-[100svh] overflow-hidden bg-[#0a0a0d] text-[#f0f0f5]">
      <div className="absolute inset-0">
        <div className="grid h-full grid-cols-3 grid-rows-3 gap-[3px] opacity-90">
          {collageImages.map((imageUrl, index) => (
            <div key={imageUrl} className="overflow-hidden bg-[#18181e]">
              <div
                className="h-full w-full bg-cover bg-center brightness-[0.34] saturate-75"
                style={{
                  backgroundImage: `url(${imageUrl})`,
                  animation: `getoutCollageFloat ${10 + index * 1.4}s ease-in-out ${index * -0.8}s infinite alternate`,
                }}
              />
            </div>
          ))}
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(0,229,160,0.18),transparent_70%),linear-gradient(to_bottom,rgba(10,10,13,0.28),rgba(10,10,13,0.68)_48%,rgba(10,10,13,0.95)_74%,#0a0a0d_100%)]" />
        <div
          className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#00e5a0] to-transparent opacity-50"
          style={{ animation: "getoutScanLine 3.5s ease-in-out infinite" }}
        />
      </div>

      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-[430px] flex-col px-[18px] pb-8 pt-6">
        {children}
      </div>
    </main>
  );
}

type HeaderProps = {
  title: string;
  subtitle: string;
  onBack?: () => void;
};

export function EntryHeader({ title, subtitle, onBack }: HeaderProps) {
  return (
    <div className="sticky top-0 z-10 -mx-[18px] mb-6 flex items-center gap-3 border-b border-white/10 bg-[#0a0a0df2] px-[18px] py-4 backdrop-blur-xl">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[#64647a] transition hover:text-white"
          aria-label="Go back"
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-4 w-4">
            <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="font-display text-lg font-extrabold tracking-[-0.02em] text-[#f0f0f5]">{title}</div>
        <div className="text-xs text-[#64647a]">{subtitle}</div>
      </div>
      <div className="font-display text-base font-extrabold tracking-[-0.02em] text-white">
        Get<span className="text-[#00e5a0]">Out</span>
      </div>
    </div>
  );
}

export function LandingHero({
  onCreate,
  controls,
  createButtonLabel = "Create a group",
  showBackButton = false,
  onBack,
}: {
  onCreate: () => void;
  controls?: ReactNode;
  createButtonLabel?: string;
  showBackButton?: boolean;
  onBack?: () => void;
}) {
  return (
    <div className="flex min-h-[calc(100svh-4rem)] flex-col">
      <div className="flex items-center justify-between pt-8">
        <div className="flex items-center gap-3">
          {showBackButton ? (
            <button
              type="button"
              onClick={onBack}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[#f0f0f5]"
              aria-label="Back to dashboard"
            >
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-4 w-4">
                <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : null}
          <div className="font-display text-[22px] font-extrabold tracking-[-0.03em] text-white">
            Get<span className="text-[#00e5a0]">Out</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-[#ff3b5c40] bg-[#ff3b5c1f] px-3 py-1 text-[11px] font-semibold tracking-[0.2em] text-[#ff3b5c]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#ff3b5c]" />
          LIVE
        </div>
      </div>

      <div className="mt-6 overflow-hidden">
        <div
          className="flex w-max gap-2"
          style={{ animation: "getoutTicker 18s linear infinite" }}
        >
          {[...tickerItems, ...tickerItems].map((item, index) => (
            <div
              key={`${item}-${index}`}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-[#a5a5b4]"
            >
              {item}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto pb-6 pt-16">
        <div className="font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-[#00e5a0]">
          For going out
        </div>
        <h1 className="mt-4 font-display text-[42px] font-extrabold leading-[0.98] tracking-[-0.04em] text-white">
          Pick a spot
          <br />
          <span className="text-[#00e5a0]">together</span>
          <span className="text-white/35">,</span>
          <br />
          fast.
        </h1>
        <p className="mt-4 max-w-[300px] text-[15px] leading-7 text-white/55">
          Stop the group-chat spiral. GetOut finds venues that actually work for everyone&apos;s location, then you vote and go.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {[
            "📍 Live travel times",
            "🗳 Group voting",
            "🔒 One tap to decide",
          ].map((pill) => (
            <div key={pill} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-[#a5a5b4]">
              {pill}
            </div>
          ))}
        </div>

        <div className="mt-7 flex items-center gap-3">
          <div className="flex">
            {[
              ["R", "#7c5cbf"],
              ["P", "#e05c8a"],
              ["S", "#3d8ef5"],
              ["A", "#e07f2b"],
              ["+12", "#555"],
            ].map(([label, bg], index) => (
              <div
                key={label}
                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#0a0a0d] text-[10px] font-bold text-white ${index === 0 ? "ml-0" : "-ml-2"}`}
                style={{ backgroundColor: bg }}
              >
                {label}
              </div>
            ))}
          </div>
          <div className="text-xs text-[#64647a]">
            <span className="font-semibold text-white">2,400+</span> groups decided this week
          </div>
        </div>

        <div className="mt-7 space-y-3">
          {controls}
          <button
            type="button"
            onClick={onCreate}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#00e5a0] px-4 py-4 font-display text-base font-bold text-black transition active:scale-[0.98]"
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-4 w-4">
              <path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {createButtonLabel}
          </button>
          <div className="text-center text-[13px] text-[#64647a]">
            Have a link? <span className="font-medium text-[#00e5a0]">Open it to join →</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ items }: { items: Array<{ label: string; state: "done" | "active" | "pending" }> }) {
  return (
    <div className="mb-7 flex items-center">
      {items.map((item, index) => (
        <Fragment key={item.label}>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div
              className={[
                "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-display font-bold",
                item.state === "done"
                  ? "border-[#00e5a0] bg-[#00e5a0] text-black"
                  : item.state === "active"
                    ? "border-[#00e5a0] bg-[#00e5a01f] text-[#00e5a0]"
                    : "border-white/10 bg-white/5 text-[#64647a]",
              ].join(" ")}
            >
              {item.state === "done" ? (
                <svg viewBox="0 0 11 11" fill="none" aria-hidden="true" className="h-2.5 w-2.5">
                  <path d="M2 6l2.5 2.5L9 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                index + 1
              )}
            </div>
            <span className={`truncate text-[11px] font-medium ${item.state === "pending" ? "text-[#64647a]" : "text-white"}`}>{item.label}</span>
          </div>
          {index < items.length - 1 ? (
            <div className={`mx-1 h-px flex-1 ${item.state === "done" ? "bg-[#00e5a066]" : "bg-white/10"}`} />
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}

function FieldLabel({ label, action }: { label: string; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.06em] text-[#64647a]">
      <span>{label}</span>
      {action ? <span className="normal-case tracking-normal text-[#00e5a0]">{action}</span> : null}
    </div>
  );
}

function NameField({
  value,
  onChange,
  isValid,
  nameTooShort,
  nameTaken,
}: {
  value: string;
  onChange: (value: string) => void;
  isValid: boolean;
  nameTooShort: boolean;
  nameTaken: boolean;
}) {
  return (
    <div>
      <FieldLabel label="Your name" />
      <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 ${isValid ? "border-[#00e5a033] bg-[#00e5a008]" : "border-white/10 bg-[#141418]"}`}>
        <svg className="h-4 w-4 shrink-0 text-[#64647a]" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.3" />
          <path d="M2 14c0-3.31 2.69-4 6-4s6 .69 6 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="What do your friends call you?"
          className="w-full bg-transparent text-[15px] text-white outline-none placeholder:text-[#64647a]"
        />
        {isValid ? (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#00e5a01f] text-[#00e5a0]">
            <svg viewBox="0 0 11 11" fill="none" aria-hidden="true" className="h-2.5 w-2.5">
              <path d="M2 6l2.5 2.5L9 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        ) : null}
      </div>
      {nameTooShort ? <p className="mt-2 text-xs text-rose-300">Name must be at least 3 characters.</p> : null}
      {nameTaken ? <p className="mt-2 text-xs text-rose-300">That name is already taken in this group.</p> : null}
    </div>
  );
}

function SaveToggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 py-1">
      <span className={`relative h-[22px] w-[38px] rounded-full border transition ${checked ? "border-[#00e5a0] bg-[#00e5a0]" : "border-white/10 bg-[#22222a]"}`}>
        <span className={`absolute top-[2px] h-4 w-4 rounded-full transition ${checked ? "left-[18px] bg-black" : "left-[2px] bg-[#64647a]"}`} />
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="sr-only"
        />
      </span>
      <span className="text-sm text-[#64647a]"><strong className="font-medium text-white">Remember me</strong> · skip this next time</span>
    </label>
  );
}

type CreateGroupFormProps = {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  name: string;
  setName: (value: string) => void;
  location: PlaceResult | null;
  setLocation: (place: PlaceResult) => void;
  category: VenueCategory;
  setCategory: (category: VenueCategory) => void;
  closeVotingInHours: number;
  setCloseVotingInHours: (hours: number) => void;
  saveDetails: boolean;
  setSaveDetails: (checked: boolean) => void;
  error: string | null;
  locationError: string | null;
  submitting: boolean;
  locating: boolean;
  nameTooShort: boolean;
  nameTaken: boolean;
  isNameValid: boolean;
  onDetectLocation: () => void;
  onSubmit: () => void;
};

export function CreateGroupForm({
  title = "New group",
  subtitle = "Takes 30 seconds · share link after",
  onBack,
  name,
  setName,
  location,
  setLocation,
  category,
  setCategory,
  closeVotingInHours,
  setCloseVotingInHours,
  saveDetails,
  setSaveDetails,
  error,
  locationError,
  submitting,
  locating,
  nameTooShort,
  nameTaken,
  isNameValid,
  onDetectLocation,
  onSubmit,
}: CreateGroupFormProps) {
  return (
    <>
      <EntryHeader title={title} subtitle={subtitle} onBack={onBack} />
      <div className="flex-1">
        <StepIndicator
          items={[
            { label: "You", state: "done" },
            { label: "Pick", state: "active" },
            { label: "Invite", state: "pending" },
          ]}
        />

        <div className="space-y-5">
          <NameField
            value={name}
            onChange={setName}
            isValid={isNameValid}
            nameTooShort={nameTooShort}
            nameTaken={nameTaken}
          />

          <div>
            <FieldLabel
              label="Your location"
              action={
                <button type="button" onClick={onDetectLocation} className="inline-flex items-center gap-1 text-xs font-medium text-[#00e5a0]">
                  <svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className="h-3 w-3">
                    <circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.3" />
                    <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.1" strokeDasharray="2 2" />
                  </svg>
                  {locating ? "Detecting..." : "Detect location"}
                </button>
              }
            />
            <PlaceSearch
              label=""
              placeholder="Your starting point"
              variant="dark"
              selectedPlace={location}
              onSelect={setLocation}
            />
          </div>

          <div>
            <FieldLabel label="Looking for" />
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((option) => {
                const selected = option.value === category;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setCategory(option.value)}
                    className={`rounded-full border px-3.5 py-2 text-sm transition ${selected ? "border-[#00e5a0] bg-[#00e5a01f] font-semibold text-[#00e5a0]" : "border-white/10 bg-[#141418] text-[#64647a]"}`}
                  >
                    {option.emoji} {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <TranslucentSelect
            label="Close voting in?"
            value={closeVotingInHours}
            onChange={(event) => setCloseVotingInHours(Number(event.target.value))}
            options={CLOSE_VOTING_OPTIONS}
            variant="dark"
            className="rounded-2xl border-white/10 bg-[#141418]"
          />

          {locationError ? <p className="text-sm text-rose-300">{locationError}</p> : null}
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}

          <div className="border-t border-white/10 pt-2">
            <SaveToggle checked={saveDetails} onChange={setSaveDetails} />
          </div>

          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#00e5a0] px-4 py-4 font-display text-base font-bold text-black transition disabled:opacity-50 active:scale-[0.98]"
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-4 w-4">
              <path d="M3 8l4 4 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {submitting ? "Creating group..." : "Start Picking"}
          </button>

          <div className="pb-4 text-center text-xs leading-5 text-[#64647a]">
            A shareable link is created instantly.<br />
            <span className="text-[#00e5a0]">Friends join with one tap</span> — no app needed.
          </div>
        </div>
      </div>
    </>
  );
}

type JoinGroupFormProps = {
  onBack: () => void;
  name: string;
  setName: (value: string) => void;
  location: PlaceResult | null;
  setLocation: (place: PlaceResult) => void;
  saveDetails: boolean;
  setSaveDetails: (checked: boolean) => void;
  error: string | null;
  locationError: string | null;
  submitting: boolean;
  locating: boolean;
  nameTooShort: boolean;
  nameTaken: boolean;
  isNameValid: boolean;
  onDetectLocation: () => void;
  onSubmit: () => void;
  peopleWaiting: number;
  organizerName?: string | null;
  organizerLocationBias?: { lat: number; lng: number; radiusKm?: number };
  resultFilter?: (place: PlaceResult) => boolean;
  category?: VenueCategory | null;
};

export function JoinGroupForm({
  onBack,
  name,
  setName,
  location,
  setLocation,
  saveDetails,
  setSaveDetails,
  error,
  locationError,
  submitting,
  locating,
  nameTooShort,
  nameTaken,
  isNameValid,
  onDetectLocation,
  onSubmit,
  peopleWaiting,
  organizerName,
  organizerLocationBias,
  resultFilter,
  category,
}: JoinGroupFormProps) {
  return (
    <>
      <EntryHeader title="You&apos;re invited" subtitle={`${peopleWaiting} ${peopleWaiting === 1 ? "person is" : "people are"} waiting on you`} onBack={onBack} />
      <div className="flex-1">
        <StepIndicator
          items={[
            { label: "You", state: "done" },
            { label: "Join", state: "active" },
            { label: "Vote", state: "pending" },
          ]}
        />

        <div className="mb-5 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64647a]">Group context</div>
          <div className="mt-2 text-sm text-white">
            {organizerName ? <span className="font-medium">{organizerName}</span> : <span className="font-medium">The organizer</span>} is coordinating this plan.
          </div>
          <div className="mt-1 text-sm text-[#64647a]">You're invited to help pick a venue.</div>
          <div className="mt-3 flex items-center justify-between rounded-2xl border border-white/10 bg-[#141418] px-4 py-3 text-sm text-[#64647a]">
            <span>Picking</span>
            <span className="font-medium text-white">{getVenueCategoryLabel(category)}</span>
          </div>
        </div>

        <div className="space-y-5">
          <NameField value={name} onChange={setName} isValid={isNameValid} nameTooShort={nameTooShort} nameTaken={nameTaken} />

          <div>
            <FieldLabel
              label="Your location"
              action={
                <button type="button" onClick={onDetectLocation} className="inline-flex items-center gap-1 text-xs font-medium text-[#00e5a0]">
                  <svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className="h-3 w-3">
                    <circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.3" />
                    <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.1" strokeDasharray="2 2" />
                  </svg>
                  {locating ? "Detecting..." : "Detect location"}
                </button>
              }
            />
            <PlaceSearch
              label=""
              placeholder="Choose a spot near the organizer"
              variant="dark"
              locationBias={organizerLocationBias}
              resultFilter={resultFilter}
              selectedPlace={location}
              onSelect={setLocation}
            />
            <p className="mt-2 text-xs text-[#64647a]">You need to be in the same city as the organizer to join this group.</p>
          </div>

          {locationError ? <p className="text-sm text-rose-300">{locationError}</p> : null}
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}

          <div className="border-t border-white/10 pt-2">
            <SaveToggle checked={saveDetails} onChange={setSaveDetails} />
          </div>

          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#00e5a0] px-4 py-4 font-display text-base font-bold text-black transition disabled:opacity-50 active:scale-[0.98]"
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-4 w-4">
              <path d="M3 8l4 4 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {submitting ? "Joining group..." : "Join & Pick"}
          </button>
        </div>
      </div>
    </>
  );
}
