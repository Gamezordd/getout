import { createHash } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import type { DashboardCuratedSuggestionsResponse } from "../../lib/authTypes";
import {
  DASHBOARD_CURATED_PLACE_LIMIT,
  getDashboardCuratedWindow,
} from "../../lib/dashboardCuratedConfig";
import { resolveDashboardCuratedPhotoUrls } from "../../lib/dashboardCuratedPhotos";
import {
  listDashboardCuratedPlaces,
  normalizeCityLabel,
} from "../../lib/dashboardCuratedStore";
import { requireAuthenticatedUser } from "../../lib/serverAuth";
import { hydrateDashboardCuratedPlaceVibes } from "./dashboard-curated-vibe-shared";
import { resolveApproximateLocation } from "./location-utils";

type ResponseBody = DashboardCuratedSuggestionsResponse & {
  message?: string;
};

const getStableSeedValue = (seed: string, placeId: string) =>
  createHash("sha1").update(`${seed}:${placeId}`).digest("hex");

const resolveCityLabel = async (req: NextApiRequest) => {
  const queryLabel =
    typeof req.query.locationLabel === "string" ? req.query.locationLabel : null;
  const normalizedQueryLabel = normalizeCityLabel(queryLabel);
  if (normalizedQueryLabel) {
    return {
      cityKey: normalizedQueryLabel,
      cityLabel: queryLabel?.trim() || normalizedQueryLabel,
    };
  }

  const approximate = await resolveApproximateLocation(req);
  const normalizedApproximate = normalizeCityLabel(approximate.locationLabel);
  return {
    cityKey: normalizedApproximate,
    cityLabel: approximate.locationLabel || normalizedApproximate,
  };
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      title: "",
      contextLabel: "",
      category: "bar",
      places: [],
      message: "Method not allowed.",
    });
  }

  try {
    await requireAuthenticatedUser(req);
    const hour =
      typeof req.query.hour === "string" ? Number(req.query.hour) : Number.NaN;
    const seed =
      typeof req.query.seed === "string" && req.query.seed.trim()
        ? req.query.seed.trim()
        : "dashboard";
    const windowConfig = getDashboardCuratedWindow(hour);
    const { cityKey, cityLabel } = await resolveCityLabel(req);

    if (!cityKey) {
      return res.status(200).json({
        title: windowConfig.title,
        contextLabel: windowConfig.contextLabel,
        category: windowConfig.category,
        cityKey: null,
        cityLabel: null,
        places: [],
      });
    }

    const places = await listDashboardCuratedPlaces({
      cityKey,
      category: windowConfig.category,
    });
    const orderedPlaces = [...places]
      .sort((left, right) => {
        const leftSeed = getStableSeedValue(seed, left.id);
        const rightSeed = getStableSeedValue(seed, right.id);
        return leftSeed.localeCompare(rightSeed);
      })
      .slice(0, DASHBOARD_CURATED_PLACE_LIMIT);

    const hydratedPlaces = await hydrateDashboardCuratedPlaceVibes(orderedPlaces);
    const placesWithResolvedPhotos = await Promise.all(
      hydratedPlaces.map(async (place) => ({
        ...place,
        photos: await resolveDashboardCuratedPhotoUrls(place.photos || []),
      })),
    );
    return res.status(200).json({
      title: windowConfig.title,
      contextLabel: windowConfig.contextLabel,
      category: windowConfig.category,
      cityKey,
      cityLabel,
      places: placesWithResolvedPhotos,
    });
  } catch (error: any) {
    const message = error?.message || "Unable to load dashboard suggestions.";
    const status = message === "Authentication required." ? 401 : 500;
    return res.status(status).json({
      title: "",
      contextLabel: "",
      category: "bar",
      places: [],
      message,
    });
  }
}
