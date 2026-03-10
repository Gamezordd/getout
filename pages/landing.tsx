import Link from "next/link";
import { useEffect } from "react";

export default function LandingPage() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("getout-seen-landing", "1");
    }
  }, []);

  return (
    <div className="relative min-h-screen bg-slate-900 text-white">
      <div
        className="absolute inset-0 bg-cover bg-center  brightness-75"
        style={{ backgroundImage: "url(/bg_img.jpg)" }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/75 via-slate-900/30 to-slate-900/60" />
      <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-5 py-12 text-left sm:px-8 sm:py-16">
        <div className="w-full rounded-3xl border border-white/10 bg-slate-950/50 px-5 py-7 shadow-2xl backdrop-blur sm:px-8 sm:py-10">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-emerald-200/80">
            GetOut
          </p>
          <h1 className="mt-4 text-3xl font-semibold text-white sm:text-5xl">
            Pick a spot together, fast.
          </h1>
          <p className="mt-3 text-sm text-white/80 sm:text-base">
            Stop arguing in the group chat. GetOut finds venues that work for
            everyone's location.
          </p>
          <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Link
              href="/create"
              className="rounded-full bg-emerald-400 px-6 py-2.5 text-sm text-center font-semibold text-emerald-950 shadow-lg shadow-emerald-900/30"
            >
              Create a group
            </Link>
            <p className="text-xs text-white/70 text-center">
              Have a link? Open it to join.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
