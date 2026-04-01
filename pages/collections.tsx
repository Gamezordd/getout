import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import CollectionsList from "../components/CollectionsList";
import { EntryHeader, EntryShell } from "../components/entry/EntryFlow";
import type { CollectionListItem } from "../lib/authTypes";
import { useAuth } from "../lib/auth/AuthProvider";
import { isGoogleMapsShareUrl } from "../lib/nativeShare";
import type { PlaceResult } from "../components/PlaceSearch";

function CollectionsPage() {
  const router = useRouter();
  const { authStatus, isNative } = useAuth();
  const sharedMapsUrl =
    typeof router.query.sharedMapsUrl === "string"
      ? router.query.sharedMapsUrl
      : "";
  const [collections, setCollections] = useState<CollectionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingPlaceIds, setRemovingCollectionIds] = useState<string[]>([]);
  const [togglingPlaceIds, setTogglingCollectionIds] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [resolvedSharedUrl, setResolvedSharedUrl] = useState<string | null>(null);

  const redirectTarget = useMemo(() => {
    if (!sharedMapsUrl) return "/collections";
    return `/collections?sharedMapsUrl=${encodeURIComponent(sharedMapsUrl)}`;
  }, [sharedMapsUrl]);

  useEffect(() => {
    if (!router.isReady || !isNative || authStatus === "unknown") return;
    if (authStatus === "signed_out") {
      void router.replace({
        pathname: "/login",
        query: { redirect: redirectTarget },
      });
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/collections");
        const payload = (await response.json().catch(() => ({}))) as {
          collections?: CollectionListItem[];
          message?: string;
        };
        if (!response.ok) {
          throw new Error(payload.message || "Unable to load collections.");
        }
        setCollections(payload.collections || []);
      } catch (err: any) {
        setError(err.message || "Unable to load collections.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [authStatus, isNative, redirectTarget, router, router.isReady]);

  useEffect(() => {
    if (
      !router.isReady ||
      !isNative ||
      authStatus !== "signed_in" ||
      !sharedMapsUrl ||
      resolvedSharedUrl === sharedMapsUrl
    ) {
      return;
    }

    if (!isGoogleMapsShareUrl(sharedMapsUrl)) {
      setError("Only Google Maps links can be saved to Collections right now.");
      setResolvedSharedUrl(sharedMapsUrl);
      return;
    }

    let cancelled = false;

    const importSharedPlace = async () => {
      try {
        setIsImporting(true);
        setError(null);

        const resolveResponse = await fetch(
          `/api/resolve-shared-place?url=${encodeURIComponent(sharedMapsUrl)}`,
        );
        const resolvePayload = (await resolveResponse
          .json()
          .catch(() => ({}))) as {
          result?: PlaceResult;
          message?: string;
        };
        if (!resolveResponse.ok || !resolvePayload.result) {
          throw new Error(
            resolvePayload.message || "Unable to import Google Maps link.",
          );
        }

        const saveResponse = await fetch("/api/collections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            place: resolvePayload.result,
          }),
        });
        const savePayload = (await saveResponse.json().catch(() => ({}))) as {
          collection?: CollectionListItem;
          message?: string;
        };
        if (!saveResponse.ok || !savePayload.collection) {
          throw new Error(
            savePayload.message || "Unable to save place to Collections.",
          );
        }
        if (cancelled) return;

        setResolvedSharedUrl(sharedMapsUrl);
        void router.replace({
          pathname: "/dashboard",
          query: { tab: "collections" },
        });
      } catch (err: any) {
        if (cancelled) return;
        setError(err.message || "Unable to import shared place.");
        setResolvedSharedUrl(sharedMapsUrl);
      } finally {
        if (!cancelled) {
          setIsImporting(false);
        }
      }
    };

    void importSharedPlace();

    return () => {
      cancelled = true;
    };
  }, [
    authStatus,
    isNative,
    resolvedSharedUrl,
    router,
    router.isReady,
    sharedMapsUrl,
  ]);

  const handleRemoveCollection = async (placeId: string) => {
    try {
      setRemovingCollectionIds((current) =>
        current.includes(placeId) ? current : [...current, placeId],
      );
      const response = await fetch(`/api/collections/${encodeURIComponent(placeId)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Unable to remove collection item.");
      }
      setCollections((current) =>
        current.filter((item) => item.placeId !== placeId),
      );
    } catch (err: any) {
      setError(err.message || "Unable to remove collection item.");
    } finally {
      setRemovingCollectionIds((current) =>
        current.filter((item) => item !== placeId),
      );
    }
  };

  const handleToggleVisitedCollection = async (
    placeId: string,
    visited: boolean,
  ) => {
    try {
      setTogglingCollectionIds((current) =>
        current.includes(placeId) ? current : [...current, placeId],
      );
      const response = await fetch(`/api/collections/${encodeURIComponent(placeId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visited }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        collection?: CollectionListItem;
        message?: string;
      };
      if (!response.ok || !payload.collection) {
        throw new Error(payload.message || "Unable to update collection item.");
      }
      setCollections((current) =>
        current.map((item) =>
          item.placeId === placeId ? payload.collection || item : item,
        ),
      );
    } catch (err: any) {
      setError(err.message || "Unable to update collection item.");
    } finally {
      setTogglingCollectionIds((current) =>
        current.filter((item) => item !== placeId),
      );
    }
  };

  if (!isNative || authStatus !== "signed_in") {
    return null;
  }

  return (
    <EntryShell>
      <EntryHeader
        title="Collections"
        subtitle="Saved spots you can come back to anytime"
        onBack={() =>
          router.push({ pathname: "/dashboard", query: { tab: "collections" } })
        }
      />
      <div className="space-y-3">
        {sharedMapsUrl ? (
          <div className="rounded-[24px] border border-white/10 bg-[#141418]/90 p-4 text-sm text-[#8b8b9c]">
            <div className="font-semibold text-white">Shared Google Maps link</div>
            <div className="mt-2 break-all">{sharedMapsUrl}</div>
            {isImporting ? (
              <div className="mt-3 text-[#00e5a0]">Saving this place to Collections...</div>
            ) : null}
          </div>
        ) : null}
        <CollectionsList
          collections={collections}
          loading={loading}
          error={error}
          onRemove={handleRemoveCollection}
          onToggleVisited={handleToggleVisitedCollection}
          removingPlaceIds={removingPlaceIds}
          togglingPlaceIds={togglingPlaceIds}
          variant="entry"
        />
      </div>
    </EntryShell>
  );
}

export default observer(CollectionsPage);
