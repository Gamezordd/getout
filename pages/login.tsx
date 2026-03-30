import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import AuthResolvingScreen from "../components/AuthResolvingScreen";
import { EntryShell } from "../components/entry/EntryFlow";
import { useAuth } from "../lib/auth/AuthProvider";

const collageImages = [
  "https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=600&q=70",
  "https://images.unsplash.com/photo-1587899897387-091ebd01a6b2?w=600&q=70",
  "https://images.unsplash.com/photo-1559329007-40df8a9345d8?w=600&q=70",
  "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=600&q=70",
  "https://images.unsplash.com/photo-1574096079513-d8259312b785?w=600&q=70",
  "https://images.unsplash.com/photo-1551632436-cbf8dd35adfa?w=600&q=70",
];

const proofBadges = [
  { label: "R", color: "#7c5cbf" },
  { label: "P", color: "#e05c8a" },
  { label: "S", color: "#3d8ef5" },
  { label: "A", color: "#e07f2b" },
  { label: "+8", color: "#333333" },
];

const loginMessages = [
  {
    title: "One tap, you're in",
    body: "No passwords or magic links. Google handles the sign-in, fast.",
    icon: "01",
  },
  {
    title: "Your crew is already there",
    body: "Using Google keeps invites and contributor identity consistent across groups.",
    icon: "02",
  },
  {
    title: "We never get your password",
    body: "GetOut only stores your basic profile so your friends recognize you.",
    icon: "03",
  },
];

const GoogleMark = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M21.8 12.23c0-.68-.06-1.33-.18-1.96H12v3.71h5.5a4.7 4.7 0 0 1-2.04 3.08v2.56h3.3c1.93-1.78 3.04-4.4 3.04-7.39Z"
    />
    <path
      fill="#34A853"
      d="M12 22c2.76 0 5.07-.91 6.76-2.47l-3.3-2.56c-.91.61-2.08.97-3.46.97-2.66 0-4.91-1.79-5.71-4.2H2.88v2.64A10 10 0 0 0 12 22Z"
    />
    <path
      fill="#FBBC05"
      d="M6.29 13.74A5.98 5.98 0 0 1 6 12c0-.61.1-1.21.29-1.74V7.62H2.88A10 10 0 0 0 2 12c0 1.61.39 3.14 1.08 4.38l3.21-2.64Z"
    />
    <path
      fill="#EA4335"
      d="M12 6.06c1.5 0 2.84.52 3.9 1.55l2.92-2.92C17.07 3.07 14.76 2 12 2A10 10 0 0 0 2.88 7.62l3.41 2.64c.8-2.41 3.05-4.2 5.71-4.2Z"
    />
  </svg>
);

export default function LoginPage() {
  const router = useRouter();
  const { authStatus, authenticatedUser, isNative, signIn, startupResolved } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [showWhySheet, setShowWhySheet] = useState(false);

  const redirectTarget = useMemo(() => {
    if (typeof router.query.redirect !== "string") return "/dashboard";
    return router.query.redirect.startsWith("/") ? router.query.redirect : "/dashboard";
  }, [router.query.redirect]);

  const navigateToResolvedTarget = useMemo(
    () => (target: string) => {
      if (typeof window !== "undefined" && isNative) {
        window.location.replace(target);
        return;
      }
      void router.replace(target);
    },
    [isNative, router],
  );

  useEffect(() => {
    if (!router.isReady || !startupResolved || authStatus === "unknown") return;

    if (!isNative) {
      void router.replace("/landing");
      return;
    }

    if (authStatus === "signed_in" && authenticatedUser) {
      navigateToResolvedTarget(redirectTarget);
    }
  }, [
    authStatus,
    authenticatedUser,
    isNative,
    navigateToResolvedTarget,
    redirectTarget,
    router,
    startupResolved,
  ]);

  if (!router.isReady || !startupResolved || authStatus === "unknown") {
    return <AuthResolvingScreen />;
  }

  return (
    <EntryShell>
      <div className="absolute inset-0 z-0 grid grid-cols-2 grid-rows-3 gap-[2px] opacity-90">
        {collageImages.map((imageUrl, index) => (
          <div key={imageUrl} className="overflow-hidden">
            <div
              className="h-full w-full bg-cover bg-center brightness-[0.22] saturate-[0.7]"
              style={{
                backgroundImage: `url(${imageUrl})`,
                animation: `getoutCollageFloat ${9 + index}s ease-in-out ${index * -0.6}s infinite alternate`,
              }}
            />
          </div>
        ))}
      </div>
      <div className="absolute inset-0 z-[1] bg-[radial-gradient(ellipse_80%_55%_at_50%_100%,rgba(0,229,160,0.14),transparent_65%),radial-gradient(ellipse_60%_40%_at_20%_20%,rgba(61,142,245,0.08),transparent_60%),linear-gradient(to_bottom,rgba(10,10,13,0.56)_0%,rgba(10,10,13,0.18)_40%,rgba(10,10,13,0.85)_72%,#0a0a0d_100%)]" />
      <div className="absolute inset-0 z-[1] bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:linear-gradient(to_bottom,transparent_0%,rgba(0,0,0,0.5)_30%,rgba(0,0,0,0.5)_70%,transparent_100%)]" />
      <div
        className="absolute left-0 right-0 z-[2] h-px bg-gradient-to-r from-transparent via-[#00e5a0] to-transparent opacity-40"
        style={{ animation: "getoutLoginScan 5s ease-in-out 1.2s infinite" }}
      />

      <div className="relative z-[3] flex min-h-[100svh] flex-col">
        <div className="flex h-11 items-center justify-between px-1">
          <div className="font-display text-[15px] font-bold tracking-[-0.02em] text-white">
            9:41
          </div>
          <div className="flex items-center gap-2 opacity-70">
            <div className="h-2 w-4 rounded-sm border border-white/40" />
            <div className="h-2 w-2 rounded-full bg-white/70" />
          </div>
        </div>

        <div className="flex flex-1 flex-col px-3">
          <section className="flex flex-1 flex-col items-center justify-center pt-2 text-center">
            <div className="relative mb-5 flex h-[76px] w-[76px] items-center justify-center overflow-hidden rounded-[22px] border border-[#00e5a040] bg-[linear-gradient(145deg,#0f2018,#1a2e20)] shadow-[0_0_0_0_rgba(0,229,160,0.3)] [animation:getoutLoginPulse_3s_ease-in-out_1s_infinite]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_40%,rgba(0,229,160,0.15),transparent_65%)]" />
              <div className="font-display relative z-[1] text-[28px] font-extrabold tracking-[-0.08em] text-[#00e5a0]">
                GO
              </div>
            </div>
            <div className="font-display text-[34px] font-extrabold tracking-[-0.05em] text-white">
              Get<span className="text-[#00e5a0]">Out</span>
            </div>
            <p className="mt-2 max-w-[220px] text-sm leading-6 text-[#5a5a70]">
              Pick a spot together, fast. No more group chat chaos.
            </p>

            <div className="mt-6 flex items-center gap-3">
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
              <div className="text-xs text-[#5a5a70]">
                <span className="font-medium text-white/70">2,400+</span> groups this week
              </div>
            </div>
          </section>

          <section className="pb-10">
            <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5a5a70]">
              Sign in to continue
            </p>

            <button
              type="button"
              onClick={async () => {
                try {
                  setError(null);
                  await signIn();
                } catch (err: any) {
                  setError(err.message || "Unable to sign in with Google.");
                }
              }}
              disabled={authStatus === "signing_in"}
              className="relative block w-full overflow-hidden rounded-2xl bg-white shadow-[0_2px_20px_rgba(0,0,0,0.4)] transition active:scale-[0.97] disabled:opacity-70"
            >
              <div className="relative flex h-14 items-center gap-4 px-5">
                <GoogleMark />
                <span className="flex-1 text-center text-base font-semibold tracking-[-0.01em] text-[#1f1f1f]">
                  {authStatus === "signing_in"
                    ? "Signing in..."
                    : "Continue with Google"}
                </span>
                <span className="w-[22px]" />
                <div className="pointer-events-none absolute inset-y-0 left-[-60%] w-[60%] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent)] [animation:getoutButtonShimmer_3.5s_ease-in-out_2s_infinite]" />
              </div>
            </button>

            {error ? (
              <p className="mt-3 text-center text-sm text-rose-300">{error}</p>
            ) : null}

            <p className="mt-4 text-center text-[11.5px] leading-6 text-[#5a5a70]">
              By continuing, you agree to our Terms of Service and Privacy Policy.
            </p>

            <button
              type="button"
              onClick={() => setShowWhySheet(true)}
              className="mx-auto mt-4 flex items-center justify-center gap-2 text-xs text-[#5a5a70] active:opacity-70"
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full border border-white/10 bg-[#1c1c22] text-[9px] font-bold">
                ?
              </span>
              Why only Google?
            </button>
          </section>
        </div>
      </div>

      <div
        className={`absolute inset-0 z-[80] bg-black/0 transition ${showWhySheet ? "pointer-events-auto bg-black/70" : "pointer-events-none"}`}
        onClick={() => setShowWhySheet(false)}
      />
      <div
        className={`absolute inset-x-0 bottom-0 z-[90] rounded-t-[24px] border border-white/10 bg-[#141418] px-6 pb-10 pt-3 transition duration-300 ${showWhySheet ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="mx-auto mb-5 h-1 w-9 rounded-full bg-[#1c1c22]" />
        <h2 className="font-display text-[20px] font-extrabold tracking-[-0.03em] text-white">
          Why only Google?
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#5a5a70]">
          We kept mobile sign-in simple so invites, identity, and notifications stay reliable.
        </p>

        <div className="mt-6 space-y-4">
          {loginMessages.map((item) => (
            <div key={item.title} className="flex items-start gap-4">
              <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#1c1c22] text-[11px] font-bold text-[#00e5a0]">
                {item.icon}
              </div>
              <div>
                <div className="text-sm font-semibold text-white">{item.title}</div>
                <div className="mt-1 text-xs leading-5 text-[#5a5a70]">{item.body}</div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowWhySheet(false)}
          className="mt-6 w-full rounded-[14px] border border-white/10 bg-[#1c1c22] px-4 py-3 text-sm font-medium text-[#8b8b9c]"
        >
          Got it
        </button>
      </div>
    </EntryShell>
  );
}
