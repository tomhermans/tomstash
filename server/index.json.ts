// src/pages/api/links/index.json.ts
import type { APIRoute } from "astro";
import { supabase } from "@lib/services/supabase";

export const prerender = false;

// Everything except content_md, which can be huge. Add any other columns your table has.
const LIST_COLUMNS = [
  "id",
  "url",
  "title",
  "description",
  "tags",
  "category",
  "favicon_url",
  "image_url",
  "author",
  "reading_time",
  "lang",
  "content_fetched_at",
  "is_archived",
  "is_read",
  "created_at",
].join(",");

const MAX_CONTENT_CHARS = 500_000;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
  };
}

function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

function validateApiKey(request: Request): boolean {
  const apiKey = request.headers.get("X-API-Key");
  const expectedKey = process.env.API_KEY || import.meta.env.API_KEY;
  return apiKey === expectedKey;
}

// Handle CORS preflight
export const OPTIONS: APIRoute = async () => {
  return new Response(null, { status: 204, headers: corsHeaders() });
};

// GET /api/links - Fetch links with filtering and pagination
export const GET: APIRoute = async ({ request }) => {
  if (!validateApiKey(request)) return unauthorized();

  try {
    const url = new URL(request.url);
    const tag = url.searchParams.get("tag");
    const category = url.searchParams.get("category");
    const archived = url.searchParams.get("archived");
    const read = url.searchParams.get("read");
    const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || "20")));
    const search = url.searchParams.get("search");
    const sort = url.searchParams.get("sort") || "created_at";
    const order = url.searchParams.get("order") || "desc";

    // Build query
    let query = supabase.from("links").select(LIST_COLUMNS, { count: "exact" });

    if (tag) {
      query = query.contains("tags", [tag]);
    }
    if (category) {
      query = query.eq("category", category);
    }
    if (archived !== null && archived !== undefined && archived !== "") {
      query = query.eq("is_archived", archived === "true");
    }
    if (read !== null && read !== undefined && read !== "") {
      query = query.eq("is_read", read === "true");
    }
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,url.ilike.%${search}%`);
    }

    // Sorting
    const validSortFields = ["created_at", "title"];
    const sortField = validSortFields.includes(sort) ? sort : "created_at";
    const ascending = order === "asc";
    query = query.order(sortField, { ascending });

    // Pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error("Supabase error:", error);
      return new Response(JSON.stringify({ error: "Database error" }), {
        status: 500,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const total = count ?? 0;
    const totalPages = Math.ceil(total / limit);

    return new Response(
      JSON.stringify({
        data,
        pagination: { total, page, limit, totalPages },
      }),
      {
        status: 200,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("Links GET error:", e);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
};

// POST /api/links - Create a new link
export const POST: APIRoute = async ({ request }) => {
  if (!validateApiKey(request)) return unauthorized();

  try {
    const body = await request.json();
    const {
      url,
      title,
      description,
      tags,
      category,
      favicon_url,
      image_url,
      author,
      reading_time,
      content_md,
      lang,
    } = body;

    // Validate required fields
    if (!url || !title) {
      return new Response(
        JSON.stringify({ error: "url and title are required" }),
        {
          status: 400,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        },
      );
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid URL format" }), {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const content =
      typeof content_md === "string" && content_md.trim()
        ? content_md.slice(0, MAX_CONTENT_CHARS)
        : null;

    const { data, error } = await supabase
      .from("links")
      .insert({
        url,
        title,
        description: description || null,
        tags: tags || [],
        category: category || null,
        favicon_url: favicon_url || null,
        image_url: image_url || null,
        author: author || null,
        reading_time: reading_time ? Number(reading_time) : null,
        content_md: content,
        content_fetched_at: content ? new Date().toISOString() : null,
        lang: lang || null,
      })
      .select(LIST_COLUMNS)
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return new Response(JSON.stringify({ error: "Database error" }), {
        status: 500,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ data }), {
      status: 201,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Links POST error:", e);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
};
