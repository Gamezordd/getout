import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import { useEffect, useMemo } from "react";
import useInstallPrompt from "../hooks/useInstallPrompt";
import { useAuth } from "../lib/auth/AuthProvider";
import { useAppStore } from "../lib/store/AppStoreProvider";

const AVATAR_BACKGROUNDS = [
  "from-violet-500 to-indigo-500",
  "from-sky-500 to-blue-500",
  "from-pink-500 to-rose-500",
  "from-amber-500 to-orange-500",
  "from-emerald-400 to-teal-500",
];

const CONFETTI_COLORS = [
  "#00e5a0",
  "#ffbe3d",
  "#ff6b8f",
  "#6db8ff",
  "#ffffff",
  "#ff7c5c",
];

const getInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?";

const formatVotes = (count: number) => `${count} ${count === 1 ? "vote" : "votes"}`;

const formatRatingCount = (count?: number) => {
  if (!count) return null;
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(count);
};

const buildConfettiParticles = (count: number, variant: "burst" | "ambient") =>
  Array.from({ length: count }, (_, index) => {
    const shapeCycle = index % 6;
    const width =
      shapeCycle === 0
        ? 3 + (index % 3)
        : shapeCycle === 1
          ? 5 + (index % 5)
          : shapeCycle === 2
            ? 2 + (index % 2)
            : shapeCycle === 3
              ? 6 + (index % 4)
              : shapeCycle === 4
                ? 4 + (index % 4)
                : 7 + (index % 3);
    const height =
      shapeCycle === 0
        ? 10 + (index % 7)
        : shapeCycle === 1
          ? 4 + (index % 3)
          : shapeCycle === 2
            ? 12 + (index % 8)
            : shapeCycle === 3
              ? 5 + (index % 6)
              : shapeCycle === 4
                ? width
                : 8 + (index % 5);

    return {
      key: `${variant}-${index}`,
      left:
        variant === "burst"
          ? `${(index * 7 + (index % 5) * 9) % 100}%`
          : `${(index * 13 + (index % 3) * 11) % 100}%`,
      top:
        variant === "burst"
          ? `${-12 + ((index * 5) % 34)}px`
          : `${-14 + ((index * 4) % 24)}px`,
      width: `${width}px`,
      height: `${height}px`,
      borderRadius:
        shapeCycle === 0
          ? "999px"
          : shapeCycle === 1
            ? "2px"
            : shapeCycle === 2
              ? "1px"
              : shapeCycle === 3
                ? "3px"
                : shapeCycle === 4
                  ? "999px"
                  : "2px",
      backgroundColor: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      animationDelay:
        variant === "burst" ? `${index * 0.035}s` : `${0.9 + index * 0.16}s`,
      animationDuration:
        variant === "burst"
          ? `${2 + (index % 7) * 0.22}s`
          : `${3.6 + (index % 6) * 0.35}s`,
      rotateStart: `${(index % 6) * 14}deg`,
      rotateEnd: `${540 + (index % 7) * 90}deg`,
      scaleStart: `${0.82 + (index % 4) * 0.05}`,
      scaleEnd: `${1 + (index % 5) * 0.04}`,
    };
  });

function FinalPage() {
  const store = useAppStore();
  const router = useRouter();
  const { triggerInstall } = useInstallPrompt();
  const { isNative } = useAuth();

  const sessionId =
    typeof router.query.sessionId === "string" ? router.query.sessionId : "";

  useEffect(() => {
    if (!router.isReady) return;
    if (!sessionId) {
      router.replace({ pathname: "/landing" }, undefined, { shallow: true });
      return;
    }
    store.setSession(sessionId, "/");
  }, [router, router.isReady, sessionId, store]);

  useEffect(() => {
    if (!sessionId) return;
    store.loadGroup();
  }, [sessionId, store]);

  useEffect(() => {
    if (!store.sessionId || store.users.length === 0) return;
    store.fetchSuggestions();
  }, [store, store.sessionId, store.users.length]);

  useEffect(() => {
    if (!router.isReady || !store.sessionId || store.isLoadingGroup) return;
    if (store.lockedVenue) return;

    router.replace(
      { pathname: "/", query: { sessionId: store.sessionId } },
      undefined,
      { shallow: true },
    );
  }, [
    router,
    router.isReady,
    store.isLoadingGroup,
    store.lockedVenue,
    store.sessionId,
  ]);

  const lockedVenue = store.lockedVenue;
  const venueDetails = useMemo(() => {
    if (!lockedVenue) return null;
    return (
      store.venues.find((venue) => venue.id === lockedVenue.id) ||
      store.manualVenues.find((venue) => venue.id === lockedVenue.id) ||
      store.suggestedVenues.find((venue) => venue.id === lockedVenue.id) ||
      null
    );
  }, [lockedVenue, store.manualVenues, store.suggestedVenues, store.venues]);

  const totalVotes = lockedVenue ? store.votes?.[lockedVenue.id]?.length || 0 : 0;
  const uniqueVoterCount = store.uniqueVoterCount;

  const maxEta = useMemo(() => {
    const values = store.users
      .map((user) => {
        if (!lockedVenue) return null;
        return store.etaMatrix?.[user.id]?.[lockedVenue.id];
      })
      .filter((value): value is number => typeof value === "number");

    return values.length > 0 ? Math.max(...values) : 0;
  }, [lockedVenue, store.etaMatrix, store.users]);

  const mapsQuery = useMemo(() => {
    if (!lockedVenue) return "";
    return encodeURIComponent(
      `${lockedVenue.name} ${lockedVenue.address || venueDetails?.address || ""}`.trim(),
    );
  }, [lockedVenue, venueDetails?.address]);

  const heroImage = venueDetails?.photos?.[0];
  const venueTypeParts = [venueDetails?.area, store.venueCategory?.replace("_", " ")].filter(
    Boolean,
  );
  const ratingCount = formatRatingCount(venueDetails?.userRatingCount);
  const burstConfetti = useMemo(() => buildConfettiParticles(46, "burst"), []);
  const ambientConfetti = useMemo(() => buildConfettiParticles(22, "ambient"), []);

  if (!lockedVenue && store.isLoadingGroup) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0a0d] px-6 text-[#f0f0f5]">
        <div className="w-full max-w-[430px] rounded-[28px] border border-white/10 bg-[#141418] px-6 py-8 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#00e5a0]/30 border-t-[#00e5a0]" />
          <p className="mt-4 font-display text-xl font-bold tracking-[-0.03em]">
            Loading final plan
          </p>
          <p className="mt-2 text-sm text-[#8d8da2]">
            Pulling the locked venue and latest group activity.
          </p>
        </div>
      </main>
    );
  }

  if (!lockedVenue) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[#0a0a0d] text-[#f0f0f5]">
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0a0a0d]/90 px-4 py-4 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {isNative ? (
                <button
                  type="button"
                  onClick={() => void router.replace("/dashboard")}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[#f0f0f5]"
                  aria-label="Back to dashboard"
                >
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                    className="h-4 w-4"
                  >
                    <path
                      d="M10 3 5 8l5 5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              ) : null}
              <div className="font-display text-[21px] font-extrabold tracking-[-0.04em]">
                Get<span className="text-[#00e5a0]">Out</span>
              </div>
            </div>
            <div className="flex items-center">
              {store.users.slice(0, 5).map((user, index) => {
                const isCurrentUser = user.id === store.currentUserId;
                const background = isCurrentUser
                  ? "from-[#00e5a0] to-[#0fbf8b] text-black"
                  : `${AVATAR_BACKGROUNDS[index % AVATAR_BACKGROUNDS.length]} text-white`;

                return (
                  <div
                    key={user.id}
                    className={`-ml-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#0a0a0d] bg-gradient-to-br text-[10px] font-bold first:ml-0 ${background}`}
                  >
                    {getInitials(user.name || "Guest")}
                  </div>
                );
              })}
            </div>
          </div>
        </header>

        <section className="relative h-[320px] overflow-hidden bg-[#15151b]">
          {heroImage ? (
            <img
              src={heroImage}
              alt={lockedVenue.name}
              className="h-full w-full object-cover brightness-[0.72] saturate-[1.1]"
            />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(0,229,160,0.28),_transparent_35%),linear-gradient(135deg,_#16212a,_#141418_55%,_#1a1626)]" />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.18),rgba(0,0,0,0.05)_28%,rgba(0,0,0,0.58)_68%,#0a0a0d)]" />
          <div className="absolute inset-0 bg-[linear-gradient(105deg,transparent_25%,rgba(0,229,160,0.08)_50%,transparent_75%)] animate-[finalShimmer_3.5s_ease-in-out_infinite]" />

          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {burstConfetti.map((particle) => (
              <span
                key={particle.key}
                className="absolute opacity-0 animate-[finalConfettiBurst_2.4s_linear_forwards]"
                style={{
                  left: particle.left,
                  top: particle.top,
                  width: particle.width,
                  height: particle.height,
                  borderRadius: particle.borderRadius,
                  transformOrigin: "center",
                  backgroundColor: particle.backgroundColor,
                  animationDelay: particle.animationDelay,
                  animationDuration: particle.animationDuration,
                  ["--final-rotate-start" as string]: particle.rotateStart,
                  ["--final-rotate-end" as string]: particle.rotateEnd,
                  ["--final-scale-start" as string]: particle.scaleStart,
                  ["--final-scale-end" as string]: particle.scaleEnd,
                }}
              />
            ))}
            {ambientConfetti.map((particle) => (
              <span
                key={particle.key}
                className="absolute opacity-0 animate-[finalConfettiAmbient_4.2s_linear_infinite]"
                style={{
                  left: particle.left,
                  top: particle.top,
                  width: particle.width,
                  height: particle.height,
                  borderRadius: particle.borderRadius,
                  transformOrigin: "center",
                  backgroundColor: particle.backgroundColor,
                  animationDelay: particle.animationDelay,
                  animationDuration: particle.animationDuration,
                  ["--final-rotate-start" as string]: particle.rotateStart,
                  ["--final-rotate-end" as string]: particle.rotateEnd,
                  ["--final-scale-start" as string]: particle.scaleStart,
                  ["--final-scale-end" as string]: particle.scaleEnd,
                }}
              />
            ))}
          </div>

          <div className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[#00e5a0]/35 bg-black/50 px-4 py-1.5 text-[12px] font-semibold tracking-[0.02em] text-[#00e5a0] backdrop-blur-xl">
            <span className="text-sm">🔒</span>
            <span>Venue locked</span>
            <span className="h-1.5 w-1.5 rounded-full bg-[#00e5a0] animate-pulse" />
          </div>

          <div className="absolute right-4 top-4 rounded-full border border-white/10 bg-black/50 px-3 py-1 text-[11px] text-white/70 backdrop-blur-xl">
            <span className="font-bold text-[#00e5a0]">{uniqueVoterCount}</span> / {store.users.length} voted
          </div>

          <div className="absolute inset-x-0 bottom-0 px-4 pb-6">
            <p className="font-display text-[34px] font-extrabold tracking-[-0.05em] text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.8)]">
              {lockedVenue.name}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/70">
              {venueTypeParts.length > 0 && <span>{venueTypeParts.join(" · ")}</span>}
              {venueTypeParts.length > 0 && venueDetails?.rating && (
                <span className="h-1 w-1 rounded-full bg-white/30" />
              )}
              {venueDetails?.rating && (
                <span className="font-semibold text-[#ffbe3d]">
                  ★ {venueDetails.rating.toFixed(1)}
                  {ratingCount ? (
                    <span className="ml-1 text-xs font-normal text-white/45">({ratingCount})</span>
                  ) : null}
                </span>
              )}
            </div>
          </div>
        </section>

        <div className="flex-1 px-4 pb-10">
          <section className="pt-5">
            <p className="font-display text-[24px] font-extrabold tracking-[-0.04em]">
              <span className="text-[#00e5a0]">GetOut</span> confirmed 🎉
            </p>
            <p className="mt-2 text-sm leading-6 text-[#8d8da2]">
              Voting ended · {lockedVenue.name} won with {formatVotes(totalVotes)}.
              See you there.
            </p>
          </section>

          <section className="mt-4 rounded-[20px] border border-white/10 bg-[#141418] px-4 py-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#64647a]">
              The group
            </p>
            <div className="mt-3 space-y-3">
              {store.users.map((user, index) => {
                const eta = store.etaMatrix?.[user.id]?.[lockedVenue.id];
                const hasEta = typeof eta === "number";
                const votedForLockedVenue = Boolean(
                  store.votes?.[lockedVenue.id]?.includes(user.id),
                );
                const width =
                  hasEta && maxEta > 0
                    ? `${Math.max(14, (Math.round(eta) / maxEta) * 100)}%`
                    : "22%";
                const accent =
                  !hasEta
                    ? "#64647a"
                    : eta <= maxEta / 3
                      ? "#00e5a0"
                      : eta <= (2 * maxEta) / 3
                        ? "#ffbe3d"
                        : "#ff7c5c";
                const subLabel = votedForLockedVenue ? "" : "Didn't vote";

                return (
                  <div key={user.id} className="flex items-center gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold ${
                        user.id === store.currentUserId
                          ? "from-[#00e5a0] to-[#0fbf8b] text-black"
                          : AVATAR_BACKGROUNDS[index % AVATAR_BACKGROUNDS.length]
                      }`}
                    >
                      {getInitials(user.name || "Guest")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-[#f0f0f5]">
                          {user.name}
                        </p>
                        {subLabel ? (
                          <span className="text-[11px] text-[#64647a]">{subLabel}</span>
                        ) : null}
                      </div>
                      {hasEta && (
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#22222a]">
                            <div
                              className="h-full rounded-full transition-[width] duration-700"
                              style={{ width, backgroundColor: accent }}
                            />
                          </div>
                          <span
                            className="min-w-10 text-right font-display text-[11px] font-bold tracking-[-0.02em]"
                            style={{ color: accent }}
                          >
                            {`${Math.round(eta)}m`}
                          </span>
                        </div>
                      )}
                    </div>
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                        votedForLockedVenue ? "bg-[#00e5a0]/12 text-[#00e5a0]" : "bg-[#22222a] text-[#64647a]"
                      }`}
                    >
                      {votedForLockedVenue ? "✓" : "×"}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="mt-3 overflow-hidden rounded-[20px] border border-white/10 bg-[#141418]">
            <div className="px-4 py-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#64647a]">
                Address
              </p>
              <p className="mt-2 text-sm leading-6 text-[#d0d0db]">
                {lockedVenue.address || venueDetails?.address || "Address unavailable"}
              </p>
            </div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 bg-[#00e5a0] px-4 py-4 font-display text-sm font-bold text-black"
            >
              <span aria-hidden="true">📍</span>
              <span>Open in Google Maps</span>
            </a>
          </section>

          <section className="mt-3 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                void store.socialShare();
              }}
              className="rounded-[18px] border border-white/10 bg-[#141418] px-4 py-4 text-center"
            >
              <p className="text-2xl leading-none">📲</p>
              <p className="mt-2 text-sm font-semibold text-[#f0f0f5]">Share to group</p>
              <p className="mt-1 text-xs text-[#64647a]">WhatsApp · Telegram</p>
            </button>
            <button
              type="button"
              onClick={() => {
                void triggerInstall();
              }}
              className="rounded-[18px] border border-white/10 bg-[#141418] px-4 py-4 text-center"
            >
              <p className="text-2xl leading-none">📌</p>
              <p className="mt-2 text-sm font-semibold text-[#f0f0f5]">Add to homescreen</p>
              <p className="mt-1 text-xs text-[#64647a]">Quick access</p>
            </button>
            <button
              type="button"
              onClick={() => {
                void store.copyShareLink("Link copied!");
              }}
              className="rounded-[18px] border border-white/10 bg-[#141418] px-4 py-4 text-center"
            >
              <p className="text-2xl leading-none">🔗</p>
              <p className="mt-2 text-sm font-semibold text-[#f0f0f5]">Copy link</p>
              <p className="mt-1 text-xs text-[#64647a]">Share this GetOut</p>
            </button>
            <a
              href="/create"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-[18px] border border-white/10 bg-[#141418] px-4 py-4 text-center"
            >
              <p className="text-2xl leading-none">✨</p>
              <p className="mt-2 text-sm font-semibold text-[#f0f0f5]">Create new group</p>
              <p className="mt-1 text-xs text-[#64647a]">Start again</p>
            </a>
          </section>

          <hr className="mt-4 border-[#64647a]" />

          <section className="mt-5 text-center">
            <p className="text-xs text-[#64647a]">Hope you have a wonderful time ❤️</p>
          </section>
        </div>
      </div>

      <style jsx global>{`
        @keyframes finalShimmer {
          0% {
            transform: translateX(-45%);
          }

          100% {
            transform: translateX(45%);
          }
        }

        @keyframes finalConfettiBurst {
          0% {
            opacity: 0;
            transform:
              translate3d(0, -28px, 0)
              rotate(var(--final-rotate-start))
              scale(var(--final-scale-start));
          }

          8% {
            opacity: 1;
          }

          78% {
            opacity: 0.9;
          }

          100% {
            opacity: 0;
            transform:
              translate3d(0, 340px, 0)
              rotate(var(--final-rotate-end))
              scale(var(--final-scale-end));
          }
        }

        @keyframes finalConfettiAmbient {
          0% {
            opacity: 0;
            transform:
              translate3d(0, -20px, 0)
              rotate(var(--final-rotate-start))
              scale(var(--final-scale-start));
          }

          10% {
            opacity: 0.8;
          }

          78% {
            opacity: 0.55;
          }

          100% {
            opacity: 0;
            transform:
              translate3d(0, 324px, 0)
              rotate(var(--final-rotate-end))
              scale(var(--final-scale-end));
          }
        }
      `}</style>
    </main>
  );
}

export default observer(FinalPage);
