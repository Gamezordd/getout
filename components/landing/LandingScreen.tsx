import type { ReactNode } from "react";

const collageImages = [
  "https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=250&q=65",
  "https://images.unsplash.com/photo-1559329007-40df8a9345d8?w=250&q=65",
  "https://images.unsplash.com/photo-1587899897387-091ebd01a6b2?w=250&q=65",
  "https://images.unsplash.com/photo-1551632436-cbf8dd35adfa?w=250&q=65",
  "https://images.unsplash.com/photo-1574096079513-d8259312b785?w=250&q=65",
  "https://images.unsplash.com/photo-1525268323446-0505b6fe7778?w=250&q=65",
];

const proofBadges = [
  { label: "R", color: "#7c5cbf" },
  { label: "P", color: "#e05c8a" },
  { label: "S", color: "#3d8ef5" },
  { label: "A", color: "#e07f2b" },
  { label: "+8", color: "#333333" },
];

const tickerItems = [
  {
    icon: "\u{1F378}",
    lead: "Ravi's crew",
    tail: "picked Pangeo \u00b7 3m ago",
  },
  {
    icon: "\u{1F389}",
    lead: "5 friends",
    tail: "heading to Church St Social",
  },
  {
    icon: "\u26a1",
    lead: "4 minutes",
    tail: "to decide \u00b7 no drama",
  },
  {
    icon: "\u{1F4CD}",
    lead: "Sana",
    tail: "just joined in Bengaluru",
  },
];

type LandingScreenProps = {
  children: ReactNode;
  createButtonLabel: string;
  onCreate: () => void;
  onBack?: () => void;
  showBackButton?: boolean;
};

export default function LandingScreen({
  children,
  createButtonLabel,
  onCreate,
  onBack,
  showBackButton = false,
}: LandingScreenProps) {
  return (
    <main className="min-h-full bg-[#050507] text-[#f0f0f5] sm:flex sm:min-h-screen sm:items-center sm:justify-center sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(circle_at_top,rgba(0,229,160,0.12),transparent_24%),linear-gradient(180deg,#09090c_0%,#040405_100%)] sm:block" />
      <section className="relative mx-auto flex h-[100svh] w-full max-w-[430px] flex-col overflow-hidden bg-[#0a0a0d] text-[#f0f0f5] sm:h-[900px] sm:max-h-[calc(100svh-3rem)] sm:rounded-[32px] sm:border sm:border-white/10 sm:shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-white/10 sm:hidden" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-px bg-white/10 sm:hidden" />

        <section className="relative min-h-0 flex flex-col">
          <div className="absolute inset-0 grid grid-cols-3 grid-rows-2 gap-[2px]">
            {collageImages.map((imageUrl, index) => (
              <div key={imageUrl} className="overflow-hidden bg-[#111114]">
                <div
                  className="h-full w-full bg-cover bg-center brightness-[0.32] saturate-75"
                  style={{
                    backgroundImage: `url(${imageUrl})`,
                    animation: `getoutCollageFloat ${14 + index}s ease-in-out ${index * -2}s infinite alternate`,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_50%_0%,rgba(0,229,160,0.15),transparent_65%),linear-gradient(to_bottom,rgba(10,10,13,0.25)_0%,rgba(10,10,13,0.1)_30%,rgba(10,10,13,0.6)_65%,rgba(10,10,13,1)_100%)]" />
          <div
            className="absolute left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#00e5a0] to-transparent opacity-0"
            style={{ animation: "getoutScanLine 4s ease-in-out 1s infinite" }}
          />

          <div className="relative z-[1] flex flex-col px-5 pb-5 pt-[15px] min-h-0">
            <div className="animate-[fadeUp_0.45s_ease_0.05s_both] flex items-center justify-between">
              <div className="flex items-center gap-3">
                {showBackButton ? (
                  <button
                    type="button"
                    onClick={onBack}
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
                <div className="font-display text-[22px] font-extrabold tracking-[-0.03em] text-white">
                  Get<span className="text-[#00e5a0]">Out</span>
                </div>
              </div>
              <div className="flex items-center gap-[5px] rounded-full border border-[#ff3b5c40] bg-[#ff3b5c1f] px-[10px] py-1 font-display text-[11px] font-bold tracking-[0.04em] text-[#ff3b5c]">
                <span className="h-[6px] w-[6px] rounded-full bg-[#ff3b5c] [animation:getoutLiveBlink_1.4s_infinite]" />
                LIVE
              </div>
            </div>

            <div className="mt-[14px] shrink-0 overflow-hidden animate-[fadeUp_0.45s_ease_0.15s_both]">
              <div
                className="flex w-max gap-2"
                style={{ animation: "getoutTicker 16s linear infinite" }}
              >
                {[...tickerItems, ...tickerItems].map((item, index) => (
                  <div
                    key={`${item.lead}-${index}`}
                    className="flex whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-[11px] py-[4px] text-[11px] text-[#5e5e74]"
                  >
                    <span className="mr-[5px]">{item.icon}</span>
                    <strong className="font-medium text-white/70">
                      {item.lead}
                    </strong>
                    <span className="ml-[5px]">{item.tail}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="overflow-auto min-h-0 mt-8">
            <div className="animate-[fadeUp_0.45s_ease_0.25s_both] pb-1">
              <div className="mb-[10px] font-display text-[10px] font-bold uppercase tracking-[0.2em] text-[#00e5a0]">
                For going out
              </div>
              <h1 className="font-display text-[36px] font-extrabold leading-[1] tracking-[-0.06em] text-white">
                Pick a spot
                <br />
                <span className="text-[#00e5a0]">together</span>
                <span className="text-white/30">,</span>
                <br />
                fast.
              </h1>
              <p className="mt-[10px] max-w-[280px] text-[13px] leading-[1.5] text-white/50">
                Stop the group-chat spiral. GetOut finds venues that work for
                everyone&apos;s location.
              </p>
            </div>
            <div className="flex items-center gap-[9px]">
              <div className="flex">
                {proofBadges.map((badge, index) => (
                  <div
                    key={badge.label}
                    className={`flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-[#0a0a0d] text-[10px] font-bold text-white ${index === 0 ? "" : "-ml-[7px]"}`}
                    style={{ backgroundColor: badge.color }}
                  >
                    {badge.label}
                  </div>
                ))}
              </div>
              <div className="text-[12px] text-[#5e5e74]">
                <span className="font-medium text-white/70">2,400+</span> groups
                decided this week
              </div>
            </div>
            </div>

          </div>
        </section>

        <section className="flex flex-1 flex-col bg-[#0a0a0d] px-5 pb-7 pt-[18px] animate-[fadeUp_0.45s_ease_0.35s_both]">
          <div className="flex-1">{children}</div>

          <button
            type="button"
            onClick={onCreate}
            className="mt-4 flex w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#00e5a0] px-4 py-[15px] font-display text-base font-bold tracking-[0.01em] text-black transition active:scale-[0.98]"
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              className="h-4 w-4"
            >
              <path
                d="M8 1v14M1 8h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            {createButtonLabel}
          </button>
          <div className="mt-[10px] shrink-0 text-center text-[12.5px] text-[#5e5e74]">
            Have a link?{" "}
            <span className="font-medium text-[#00e5a0]">
              Open it to join -&gt;
            </span>
          </div>
        </section>
      </section>
    </main>
  );
}
