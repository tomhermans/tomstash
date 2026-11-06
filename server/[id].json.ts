// src/pages/api/links/[id].json.ts
import type { APIRoute } from "astro";
import { supabase } from "@lib/services/supabase";

export const prerender = false;

const MAX_CONTENT_CHARS = 500_000;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PATCH, DELETE, OPTIONS",
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
  return apiKey === import.meta.env.API_KEY;
}

// Handle CORS preflight
export const OPTIONS: APIRoute = async () => {
  return new Response(null, { status: 204, headers: corsHeaders() });
};

// GET /api/links/:id - Fetch single link (includes content_md; null for older links)
export const GET: APIRoute = async ({ params, request }) => {
  if (!validateApiKey(request)) return unauthorized();

  try {
    const { id } = params;

    const { data, error } = await supabase
      .from("links")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return new Response(JSON.stringify({ error: "Link not found" }), {
        status: 404,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Link GET error:", e);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
};

// PATCH /api/links/:id - Update a link
export const PATCH: APIRoute = async ({ params, request }) => {
  if (!validateApiKey(request)) return unauthorized();

  try {
    const { id } = params;
    const body = await request.json();

    // Only allow updating these fields (content_fetched_at is set server-side)
    const allowedFields = ["title", "description", "tags", "category", "is_read", "is_archived", "image_url", "author", "reading_time", "lang"];
    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if ("content_md" in body) {
      const content =
        typeof body.content_md === "string" && body.content_md.trim()
          ? body.content_md.slice(0, MAX_CONTENT_CHARS)
          : null;
      updates.content_md = content;
      updates.content_fetched_at = content ? new Date().toISOString() : null;
    }

    if (Object.keys(updates).length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid fields to update" }),
        {
          status: 400,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        },
      );
    }

    const { data, error } = await supabase
      .from("links")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Supabase update error:", error);
      return new Response(JSON.stringify({ error: "Database error" }), {
        status: 500,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    if (!data) {
      return new Response(JSON.stringify({ error: "Link not found" }), {
        status: 404,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Link PATCH error:", e);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
};

// DELETE /api/links/:id - Delete a link
export const DELETE: APIRoute = async ({ params, request }) => {
  if (!validateApiKey(request)) return unauthorized();

  try {
    const { id } = params;

    const { error } = await supabase.from("links").delete().eq("id", id);

    if (error) {
      console.error("Supabase delete error:", error);
      return new Response(JSON.stringify({ error: "Database error" }), {
        status: 500,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Link DELETE error:", e);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
};
