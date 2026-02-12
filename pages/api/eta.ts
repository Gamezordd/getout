import type { NextApiRequest, NextApiResponse } from "next";
import type { User, Venue } from "../../lib/types";

type Payload = {
  users: User[];
  venues: Venue[];
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const { users, venues } = req.body as Payload;

    if (!users?.length || !venues?.length) {
      return res.status(400).json({ message: "Users and venues are required." });
    }

    const token = process.env.MAPBOX_SECRET_TOKEN || process.env.MAPBOX_TOKEN;
    if (!token) {
      return res.status(500).json({ message: "Missing Mapbox server token." });
    }

    const coords = [...users, ...venues]
      .map((item) => `${item.location.lng},${item.location.lat}`)
      .join(";");
    const sources = users.map((_, index) => index).join(";");
    const destinations = venues
      .map((_, index) => index + users.length)
      .join(";");

    const profile = process.env.MAPBOX_MATRIX_PROFILE || "driving";
    const url =
      `https://api.mapbox.com/directions-matrix/v1/mapbox/${profile}/` +
      coords +
      `?sources=${sources}&destinations=${destinations}&access_token=` +
      token;

    const response = await fetch(url);
    if (!response.ok) {
      return res.status(502).json({ message: "ETA service failed." });
    }

    const data = await response.json();
    const durations: number[][] = data.durations || [];

    const etaMatrix: Record<string, Record<string, number>> = {};
    venues.forEach((venue, venueIndex) => {
      etaMatrix[venue.id] = {};
      users.forEach((user, userIndex) => {
        const seconds = durations?.[userIndex]?.[venueIndex];
        if (typeof seconds === "number") {
          etaMatrix[venue.id][user.id] = Math.round(seconds / 60);
        }
      });
    });

    return res.status(200).json({ etaMatrix });
  } catch (error) {
    return res.status(500).json({ message: "Server error calculating ETAs." });
  }
}
