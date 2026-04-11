import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import type { AuthenticatedUser } from "../lib/authTypes";
import { EntryHeader, EntryShell } from "../components/entry/EntryFlow";
import { registerNativeBackInterceptor } from "../lib/nativeBackNavigation";

type SessionResponse = {
  user?: AuthenticatedUser | null;
  message?: string;
};

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "";

export default function DeleteAccountPage() {
  const router = useRouter();
  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionUser, setSessionUser] = useState<AuthenticatedUser | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [confirmationText, setConfirmationText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    void router.push("/profile");
  };

  useEffect(() => {
    const unregisterNativeBackInterceptor = registerNativeBackInterceptor(() => {
      handleBack();
      return true;
    });

    return () => {
      unregisterNativeBackInterceptor();
    };
  }, [router]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoadingSession(true);
        const response = await fetch("/api/auth/session");
        const payload = (await response.json().catch(() => ({}))) as SessionResponse;
        if (!response.ok) {
          throw new Error(payload.message || "Unable to load session.");
        }
        setSessionUser(payload.user || null);
      } catch (error: any) {
        setSessionError(error.message || "Unable to load session.");
      } finally {
        setLoadingSession(false);
      }
    };

    void load();
  }, []);

  const canDelete = confirmationText.trim().toUpperCase() === "DELETE";
  const supportLabel = useMemo(() => {
    if (supportEmail) return supportEmail;
    return "the support contact listed on the Play Store page";
  }, []);

  const handleDelete = async () => {
    if (!canDelete) return;

    try {
      setSubmitting(true);
      setDeleteError(null);
      const response = await fetch("/api/auth/delete-account", {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.message || "Unable to delete account.");
      }
      setDeleted(true);
      setSessionUser(null);
    } catch (error: any) {
      setDeleteError(error.message || "Unable to delete account.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <EntryShell>
      <EntryHeader
        title="Delete account"
        subtitle="Permanent account and data deletion"
        onBack={handleBack}
      />
      <div className="flex-1 overflow-y-auto pb-6">
        <div className="space-y-4 rounded-[24px] border border-white/10 bg-[#141418]/90 p-5 backdrop-blur-sm">
          <p className="text-sm leading-6 text-[#8b8b9c]">
            This page lets you request permanent deletion of your GetOut account
            and associated data.
          </p>

          <div className="rounded-[20px] border border-white/10 bg-[#0f0f14] p-4">
            <p className="text-sm font-semibold text-white">What gets deleted</p>
            <ul className="mt-3 space-y-2 text-sm text-[#8b8b9c]">
              <li>Your signed-in profile and active sessions.</li>
              <li>
                Your saved collections, friends, invites, notification endpoints,
                and recent-group memberships.
              </li>
              <li>
                Your membership records inside active GetOut groups, including
                votes and organizer ownership where applicable.
              </li>
            </ul>
          </div>

          {loadingSession ? (
            <div className="rounded-[20px] border border-white/10 bg-[#0f0f14] p-4 text-sm text-[#8b8b9c]">
              Checking whether you are signed in.
            </div>
          ) : null}

          {sessionError ? (
            <div className="rounded-[20px] border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
              {sessionError}
            </div>
          ) : null}

          {!loadingSession && !deleted && sessionUser ? (
            <div className="rounded-[20px] border border-white/10 bg-[#0f0f14] p-4">
              <p className="text-sm text-[#8b8b9c]">Signed in as</p>
              <p className="mt-1 text-sm font-semibold text-white">
                {sessionUser.displayName} · {sessionUser.email}
              </p>
              <p className="mt-4 text-sm leading-6 text-[#8b8b9c]">
                Type <span className="font-semibold text-white">DELETE</span> to
                confirm permanent account deletion.
              </p>
              <input
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                placeholder="Type DELETE"
                className="mt-4 w-full rounded-2xl border border-white/10 bg-[#141418] px-4 py-3 text-sm text-white outline-none"
              />
              {deleteError ? (
                <p className="mt-3 text-sm text-rose-300">{deleteError}</p>
              ) : null}
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={!canDelete || submitting}
                className="mt-4 w-full rounded-2xl bg-rose-500 px-4 py-3 text-sm font-bold text-white transition disabled:opacity-50"
              >
                {submitting ? "Deleting account..." : "Delete account permanently"}
              </button>
            </div>
          ) : null}

          {deleted ? (
            <div className="rounded-[20px] border border-[#00e5a0]/20 bg-[#00e5a0]/10 p-4 text-sm text-[#bafbe4]">
              Your GetOut account deletion request has been completed on this
              device.
            </div>
          ) : null}

          {!loadingSession && !deleted && !sessionUser ? (
            <div className="rounded-[20px] border border-white/10 bg-[#0f0f14] p-4">
              <p className="text-sm font-semibold text-white">
                Not signed in on this browser
              </p>
              <p className="mt-2 text-sm leading-6 text-[#8b8b9c]">
                If you are already signed in inside the GetOut mobile app, open
                this page on the same device from the{" "}
                <span className="font-semibold text-white">
                  Profile screen → Delete account
                </span>{" "}
                and you can delete the account directly here. If you cannot access
                the app anymore, contact{" "}
                {supportEmail ? (
                  <a
                    href={`mailto:${supportEmail}`}
                    className="text-[#00e5a0] underline underline-offset-2"
                  >
                    {supportEmail}
                  </a>
                ) : (
                  <span className="text-white">{supportLabel}</span>
                )}{" "}
                and request account deletion using the Google account email linked
                to GetOut.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </EntryShell>
  );
}
