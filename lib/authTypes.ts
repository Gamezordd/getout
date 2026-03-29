export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  provider: "google";
};

export type AuthStatus = "unknown" | "signed_out" | "signing_in" | "signed_in";
