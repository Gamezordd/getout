import { useState } from "react";
import { useAuth } from "../lib/auth/AuthProvider";

type Props = {
  title?: string;
  subtitle?: string;
  className?: string;
};

export default function MobileAuthCard({
  title = "Continue with Google",
  subtitle = "Sign in once on mobile and we'll use your saved profile name when you create or join groups.",
  className = "",
}: Props) {
  const { authStatus, authenticatedUser, signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);

  if (authStatus === "signed_in" && authenticatedUser) {
    return (
      <div className={`rounded-[24px] border border-[#00e5a0]/20 bg-[#0f1714]/90 p-4 ${className}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#00e5a0]">
          Signed in
        </p>
        <p className="mt-2 font-display text-lg font-bold tracking-[-0.03em] text-white">
          {authenticatedUser.displayName}
        </p>
        <p className="mt-1 text-sm text-[#8b8b9c]">{authenticatedUser.email}</p>
      </div>
    );
  }

  return (
    <div className={`rounded-[24px] border border-white/10 bg-[#141418]/90 p-4 backdrop-blur-sm ${className}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b8b9c]">
        Mobile sign-in
      </p>
      <p className="mt-2 font-display text-lg font-bold tracking-[-0.03em] text-white">
        {title}
      </p>
      <p className="mt-2 text-sm text-[#8b8b9c]">{subtitle}</p>
      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
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
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-bold text-black disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
          <path
            fill="currentColor"
            d="M21.8 12.23c0-.68-.06-1.33-.18-1.96H12v3.71h5.5a4.7 4.7 0 0 1-2.04 3.08v2.56h3.3c1.93-1.78 3.04-4.4 3.04-7.39Z"
          />
          <path
            fill="currentColor"
            d="M12 22c2.76 0 5.07-.91 6.76-2.47l-3.3-2.56c-.91.61-2.08.97-3.46.97-2.66 0-4.91-1.79-5.71-4.2H2.88v2.64A10 10 0 0 0 12 22Z"
          />
          <path
            fill="currentColor"
            d="M6.29 13.74A5.98 5.98 0 0 1 6 12c0-.61.1-1.21.29-1.74V7.62H2.88A10 10 0 0 0 2 12c0 1.61.39 3.14 1.08 4.38l3.21-2.64Z"
          />
          <path
            fill="currentColor"
            d="M12 6.06c1.5 0 2.84.52 3.9 1.55l2.92-2.92C17.07 3.07 14.76 2 12 2A10 10 0 0 0 2.88 7.62l3.41 2.64c.8-2.41 3.05-4.2 5.71-4.2Z"
          />
        </svg>
        {authStatus === "signing_in" ? "Signing in..." : "Continue with Google"}
      </button>
    </div>
  );
}
