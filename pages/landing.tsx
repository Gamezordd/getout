import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import AuthResolvingScreen from "../components/AuthResolvingScreen";
import CreateGroupFields from "../components/CreateGroupFields";
import LandingScreen from "../components/landing/LandingScreen";
import { useCreateGroupFlow } from "../hooks/useCreateGroupFlow";
import { useAuth } from "../lib/auth/AuthProvider";
import type { VenueCategory } from "../lib/types";

function LandingPage() {
  const { authStatus, isNative, startupResolved } = useAuth();
  const router = useRouter();
  const [routeCategory, setRouteCategory] = useState<VenueCategory>("bar");
  const createFlow = useCreateGroupFlow({ initialCategory: routeCategory });

  useEffect(() => {
    if (
      !router.isReady ||
      !startupResolved ||
      !isNative ||
      authStatus !== "signed_out"
    ) {
      return;
    }
    void router.replace({
      pathname: "/login",
      query: { redirect: "/dashboard" },
    });
  }, [authStatus, isNative, router, router.isReady, startupResolved]);

  useEffect(() => {
    if (!router.isReady) return;
    const nextCategory =
      typeof router.query.category === "string" ? router.query.category : null;
    if (
      nextCategory === "bar" ||
      nextCategory === "restaurant" ||
      nextCategory === "cafe" ||
      nextCategory === "night_club" ||
      nextCategory === "brewery"
    ) {
      setRouteCategory(nextCategory);
    }
  }, [router.isReady, router.query.category]);

  if (!startupResolved) {
    return <AuthResolvingScreen />;
  }

  if (isNative && authStatus === "signed_out") {
    return null;
  }

  return (
    <LandingScreen
      onCreate={createFlow.handleCreate}
      showBackButton={isNative}
      onBack={() => {
        void router.replace("/dashboard");
      }}
      createButtonLabel={
        isNative && authStatus !== "signed_in"
          ? "Sign in to create"
          : createFlow.submitting
            ? "Creating group..."
            : "Create group"
      }
    >
      <CreateGroupFields flow={createFlow} className="mt-4" />
    </LandingScreen>
  );
}

export default observer(LandingPage);
