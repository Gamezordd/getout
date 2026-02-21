import type { NextApiRequest, NextApiResponse } from "next";
import type { LatLng } from "../../lib/types";

type PlaceResult = {
  id: string;
  name: string;
  address?: string;
  location: LatLng;
};

type ReverseResponse = {
  result?: PlaceResult;
  message?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReverseResponse>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Method not allowed." });
  }

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ message: "Missing coordinates." });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ message: "Missing Google Maps API key." });
  }

  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?latlng=" +
    `${lat},${lng}` +
    "&key=" +
    apiKey;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Reverse geocoding failed.");
    }
    const data = await response.json();
    const result = Array.isArray(data.results) ? data.results[0] : null;
    if (!result) {
      return res.status(404).json({ message: "No address found." });
    }

    const address = result.formatted_address || "Current location";
    const name = address.split(",")[0] || "Current location";
    const place: PlaceResult = {
      id: result.place_id || `geo-${lat}-${lng}`,
      name,
      address,
      location: { lat, lng },
    };

    return res.status(200).json({ result: place });
  } catch (err: any) {
    return res
      .status(500)
      .json({ message: err.message || "Reverse geocoding failed." });
  }
}
