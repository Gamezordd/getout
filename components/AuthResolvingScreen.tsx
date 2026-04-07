import { EntryShell } from "./entry/EntryFlow";

export default function AuthResolvingScreen() {
  return (
    <EntryShell>
      <div className="flex min-h-[100svh] flex-col justify-center px-2 text-center">
        <div className="mx-auto mb-6 flex h-[76px] w-[76px] items-center justify-center overflow-hidden rounded-[22px] border border-[#00e5a040] bg-[linear-gradient(145deg,#0f2018,#1a2e20)] shadow-[0_0_0_0_rgba(0,229,160,0.3)] [animation:getoutLoginPulse_3s_ease-in-out_1s_infinite]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_40%,rgba(0,229,160,0.15),transparent_65%)]" />
          <div className="font-display-legacy relative z-[1] text-[28px] font-extrabold tracking-[-0.08em] text-[#00e5a0]">
            GO
          </div>
        </div>
        <div className="font-display-legacy text-[34px] font-extrabold tracking-[-0.05em] text-white">
          Get<span className="text-[#00e5a0]">Out</span>
        </div>
        <p className="mx-auto mt-3 max-w-[240px] text-sm leading-6 text-[#5a5a70]">
          Checking your session and preparing the app.
        </p>
        <div className="mx-auto mt-8 h-12 w-12 animate-spin rounded-full border-2 border-white/10 border-t-[#00e5a0]" />
      </div>
    </EntryShell>
  );
}

