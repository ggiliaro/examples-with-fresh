import { define } from "../utils.ts";

interface SerpApiResult {
  local_results?: Array<{
    place_id?: string;
    title?: string;
    type?: string;
    address?: string;
    phone?: string;
    website?: string;
    rating?: number;
    reviews?: number;
    thumbnail?: string;
    gps_coordinates?: {
      latitude?: number;
      longitude?: number;
    };
  }>;

  error?: string;
}

export const handler = define.handlers({
  async GET(req) {
    const url = new URL(req.url);

    const city = url.searchParams.get("city")?.trim();
    const state = url.searchParams.get("state")?.trim() ?? "";
    const query =
      url.searchParams.get("q")?.trim() || "HVAC contractors";

    if (!city) {
      return Response.json(
        {
          error: "Missing city",
          example: "/search?city=Houston&state=TX",
        },
        { status: 400 },
      );
    }

    const apiKey = Deno.env.get("SERPAPI_KEY");

    if (!apiKey) {
      return Response.json(
        {
          error: "SERPAPI_KEY is not configured",
        },
        { status: 500 },
      );
    }

    const serpUrl = new URL("https://serpapi.com/search.json");

    serpUrl.searchParams.set("engine", "google_maps");
    serpUrl.searchParams.set("q", query);
    serpUrl.searchParams.set(
      "location",
      `${city}${state ? `, ${state}` : ""}`,
    );
    serpUrl.searchParams.set("api_key", apiKey);

    const response = await fetch(serpUrl);

    if (!response.ok) {
      return Response.json(
        {
          error: "SerpApi request failed",
          status: response.status,
        },
        { status: 502 },
      );
    }

    const data = (await response.json()) as SerpApiResult;

    if (data.error) {
      return Response.json(
        {
          error: data.error,
        },
        { status: 502 },
      );
    }

    const leads = (data.local_results ?? [])
      .filter((result) => result.place_id)
      .map((result) => ({
        placeId: result.place_id,
        name: result.title ?? null,
        type: result.type ?? null,
        website: result.website ?? null,
        phone: result.phone ?? null,
        address: result.address ?? null,
        city,
        state: state || null,
        rating: result.rating ?? null,
        reviews: result.reviews ?? null,
        thumbnail: result.thumbnail ?? null,
        coordinates: result.gps_coordinates ?? null,
        source: "google_maps",
      }));

    return Response.json({
      success: true,
      city,
      state: state || null,
      query,
      found: leads.length,
      leads,
    });
  },
});
