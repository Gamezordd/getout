import type { NextApiRequest, NextApiResponse } from "next";
import type { VenueCategory } from "../../../lib/types";
import type { CollectionListItem } from "../../../lib/authTypes";
import type {
  GooglePhotoAuthorAttribution,
  PlaceAttribution,
} from "../../../lib/types";
import {
  listCollectionsForUser,
  saveCollectionPlaceForUser,
} from "../../../lib/collectionStore";
import { requireAuthenticatedUser } from "../../../lib/serverAuth";

type RequestBody = {
  place?: {
    id?: string;
    name?: string;
    address?: string;
    area?: string;
    priceLabel?: string;
    closingTimeLabel?: string;
    photos?: string[];
    googleMapsAttributionRequired?: boolean;
    placeAttributions?: PlaceAttribution[];
    photoAttributions?: GooglePhotoAuthorAttribution[][];
    rating?: number;
    userRatingCount?: number;
    venueCategory?: VenueCategory;
    location?: {
      lat?: number;
      lng?: number;
    };
  };
};

type ResponseBody = {
  collections?: CollectionListItem[];
  collection?: CollectionListItem;
  message?: string;
};

const isValidLocation = (value: RequestBody["place"]) =>
  typeof value?.location?.lat === "number" &&
  Number.isFinite(value.location.lat) &&
  typeof value?.location?.lng === "number" &&
  Number.isFinite(value.location.lng);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>,
) {
  if (req.method === "GET") {
    try {
      const user = await requireAuthenticatedUser(req);
      const collections = await listCollectionsForUser(user.id);
      return res.status(200).json({ collections });
    } catch (error: any) {
      const message = error?.message || "Unable to load collections.";
      const status = message === "Authentication required." ? 401 : 400;
      return res.status(status).json({ message });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ message: "Method not allowed." });
  }

  const place = (req.body as RequestBody)?.place;
  if (
    !place?.id?.trim() ||
    !place?.name?.trim() ||
    !isValidLocation(place) ||
    !place.venueCategory
  ) {
    return res.status(400).json({ message: "Missing collection place details." });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    const collection = await saveCollectionPlaceForUser({
      userId: user.id,
      place: {
        id: place.id.trim(),
        name: place.name.trim(),
        address: place.address?.trim(),
        area: place.area?.trim(),
        priceLabel: place.priceLabel?.trim(),
        closingTimeLabel: place.closingTimeLabel?.trim(),
        photos: Array.isArray(place.photos)
          ? place.photos.filter((photo): photo is string => typeof photo === "string")
          : [],
        googleMapsAttributionRequired: Boolean(
          place.googleMapsAttributionRequired,
        ),
        placeAttributions: Array.isArray(place.placeAttributions)
          ? place.placeAttributions.filter(
              (attribution): attribution is PlaceAttribution =>
                typeof attribution?.provider === "string" &&
                attribution.provider.trim().length > 0,
            )
          : [],
        photoAttributions: Array.isArray(place.photoAttributions)
          ? place.photoAttributions.map((entries) =>
              Array.isArray(entries)
                ? entries.filter(
                    (
                      attribution,
                    ): attribution is GooglePhotoAuthorAttribution =>
                      typeof attribution?.displayName === "string" &&
                      attribution.displayName.trim().length > 0,
                  )
                : [],
            )
          : [],
        rating: typeof place.rating === "number" ? place.rating : undefined,
        userRatingCount:
          typeof place.userRatingCount === "number"
            ? place.userRatingCount
            : undefined,
        venueCategory: place.venueCategory,
        location: {
          lat: place.location!.lat!,
          lng: place.location!.lng!,
        },
      },
    });
    return res.status(200).json({ collection });
  } catch (error: any) {
    const message = error?.message || "Unable to save collection.";
    const status = message === "Authentication required." ? 401 : 400;
    return res.status(status).json({ message });
  }
}
