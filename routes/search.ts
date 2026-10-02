import { Handlers } from "$fresh/server.ts";

interface SerpApiResult {
  local_results?: Array<{
    position?: number;
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
  search_metadata?: {
    id?: string;
    status?: string;
  };
  error?: string;
}

const kv = await Deno.openKv();

export const handler: Handlers = {
  async GET(req) {
    const url = new URL(req.url);

    const city = url.searchParams.get("city")?.trim();
    const state = url.searchParams.get("state")?.trim() ?? "";
    const query = url.searchParams.get("q")?.trim() || "HVAC contractors";

    if (!city) {
      return Response.json(
        {
          error: "Missing city",
          example: "/search?city=Houston&state=TX",
        },
        { status: 400 },
      );
    }

    const serpUrl = new URL("https://serpapi.com/search.json");

    serpUrl.searchParams.set("engine", "google_maps");
    serpUrl.searchParams.set("q", query);
    serpUrl.searchParams.set("location", `${city}${state ? `, ${state}` : ""}`);

    const apiKey = Deno.env.get("SERPAPI_KEY");

    if (!apiKey) {
      return Response.json(
        { error: "SERPAPI_KEY is not configured" },
        { status: 500 },
      );
    }

    serpUrl.searchParams.set("api_key", apiKey);

    try {
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
          { error: data.error },
          { status: 502 },
        );
      }

      const results = data.local_results ?? [];
      const leads = [];

      for (const result of results) {
        const placeId = result.place_id;

        if (!placeId) {
          continue;
        }

        const lead = {
          placeId,
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
          query,
          createdAt: new Date().toISOString(),
        };

        const key = ["lead", placeId];

        const existing = await kv.get(key);

        if (existing.value) {
          continue;
        }

        await kv.set(key, lead);

        leads.push(lead);
      }

      return Response.json({
        success: true,
        city,
        state: state || null,
        query,
        found: results.length,
        newLeads: leads.length,
        leads,
      });
    } catch (error) {
      console.error(error);

      return Response.json(
        {
          error: "Unexpected error while searching",
        },
        { status: 500 },
      );
    }
  },
};
