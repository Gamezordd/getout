import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { EntryHeader, EntryShell } from "../components/entry/EntryFlow";
import { useAuth } from "../lib/auth/AuthProvider";
import {
  getAutoPreciseLocationEnabled,
  setAutoPreciseLocationEnabled,
} from "../lib/nativePreciseLocation";

function ProfilePage() {
  const router = useRouter();
  const { authenticatedUser, authStatus, isNative, signOut, updateDisplayName } =
    useAuth();
  const [displayName, setDisplayName] = useState(
    authenticatedUser?.displayName || "",
  );
  const [autoPreciseLocationEnabled, setAutoPreciseLocationEnabledState] =
    useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(authenticatedUser?.displayName || "");
  }, [authenticatedUser?.displayName]);

  useEffect(() => {
    setAutoPreciseLocationEnabledState(getAutoPreciseLocationEnabled());
  }, []);

  if (!isNative) {
    return null;
  }

  return (
    <EntryShell>
      <EntryHeader
        title="Profile"
        subtitle="Your mobile sign-in identity"
        onBack={() => router.back()}
      />
      <div className="space-y-4 rounded-[24px] border border-white/10 bg-[#141418]/90 p-5 backdrop-blur-sm">
        {authStatus === "signed_in" && authenticatedUser ? (
          <>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b8b9c]">
                Email
              </p>
              <p className="mt-2 text-sm text-white">{authenticatedUser.email}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b8b9c]">
                Display name
              </p>
              <input
                value={displayName}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  setError(null);
                }}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0a0a0d] px-4 py-3 text-sm text-white outline-none"
            />
          </div>
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            <button
              type="button"
              onClick={async () => {
                try {
                  setSaving(true);
                  setError(null);
                  await updateDisplayName(displayName);
                } catch (err: any) {
                  setError(err.message || "Unable to save profile.");
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
              className="w-full rounded-2xl bg-[#00e5a0] px-4 py-3 text-sm font-bold text-black disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save display name"}
            </button>
            <div className="rounded-2xl border border-white/10 bg-[#0a0a0d] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Use device location automatically
                  </p>
                  <p className="mt-1 text-sm text-[#8b8b9c]">
                    Request and refresh your location on the dashboard, then use it
                    for new groups and joins.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoPreciseLocationEnabled}
                  onClick={() => {
                    const nextValue = !autoPreciseLocationEnabled;
                    setAutoPreciseLocationEnabled(nextValue);
                    setAutoPreciseLocationEnabledState(nextValue);
                  }}
                  className={`relative mt-1 h-7 w-12 shrink-0 rounded-full border transition ${
                    autoPreciseLocationEnabled
                      ? "border-[#00e5a0] bg-[#00e5a0]"
                      : "border-white/10 bg-[#1f1f25]"
                  }`}
                >
                  <span
                    className={`absolute top-[2px] h-5 w-5 rounded-full bg-black transition ${
                      autoPreciseLocationEnabled ? "left-[25px]" : "left-[2px]"
                    }`}
                  />
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                router.replace("/login");
              }}
              className="w-full rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white"
            >
              Sign out
            </button>
            <button
              type="button"
              onClick={() => void router.push("/delete-account")}
              className="w-full rounded-2xl border border-rose-500/30 px-4 py-3 text-sm font-semibold text-rose-200"
            >
              Delete account
            </button>
          </>
        ) : (
          <p className="text-sm text-[#8b8b9c]">
            Sign in with Google from the mobile landing page to create your
            profile.
          </p>
        )}
      </div>
    </EntryShell>
  );
}

export default observer(ProfilePage);
