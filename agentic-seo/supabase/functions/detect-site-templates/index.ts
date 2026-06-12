import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// detect-site-templates — Supabase Edge Function
//
// Finds all target_sites rows where site_id IS NULL, fetches each URL,
// fingerprints its CMS, and writes the correct site_template enum value back.
//
// Invoke:
//   supabase functions invoke detect-site-templates
//   OR schedule via pg_cron: SELECT cron.schedule('detect-sites', '0 * * * *',
//     $$SELECT net.http_post(url:='<function_url>', headers:='{"Authorization":"Bearer <service_key>"}')$$);
// ---------------------------------------------------------------------------

type SiteTemplate = "pligg" | "phpld" | "scuttle" | "drigg" | "unknown";

const TIMEOUT_MS = 8_000;
const BATCH_LIMIT = 50;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Fingerprint logic — checks in priority order, short-circuits on first match
// ---------------------------------------------------------------------------
function detectTemplate(html: string, headers: Headers): SiteTemplate {
  const src = html.toLowerCase();

  // --- Pligg / Kliqqi ---
  if (
    src.includes("tpl_pligg") ||
    src.includes("pligg_content") ||
    src.includes("pligg-content") ||
    src.includes("kliqqi-content") ||
    src.includes('name="pligg"') ||
    src.includes("story.php?title=") ||
    src.includes("pligg_") ||
    metaGeneratorMatches(html, ["pligg", "kliqqi"])
  ) {
    return "pligg";
  }

  // --- PHPLD (PHP Link Directory) ---
  if (
    src.includes("phpld") ||
    src.includes("php link directory") ||
    src.includes("link_id=") ||
    formActionMatches(html, "submit.php") ||
    metaGeneratorMatches(html, ["phpld", "php link directory"])
  ) {
    return "phpld";
  }

  // --- Scuttle / SemanticScuttle ---
  if (
    src.includes("semanticscuttle") ||
    src.includes("scuttle") ||
    src.includes("bookmarks.php") ||
    src.includes('href="tags.php"') ||
    src.includes('href="tag.php"') ||
    metaGeneratorMatches(html, ["scuttle"])
  ) {
    return "scuttle";
  }

  // --- Drupal Drigg ---
  if (
    src.includes("drigg") ||
    src.includes("sites/all/modules/drigg") ||
    src.includes('class="drigg-vote"') ||
    src.includes("/node/add/drigg")
  ) {
    return "drigg";
  }

  // --- HTTP header fallback (X-Powered-By, Server) ---
  const poweredBy = (headers.get("x-powered-by") || "").toLowerCase();
  const server = (headers.get("server") || "").toLowerCase();
  const combined = poweredBy + " " + server;

  if (combined.includes("pligg") || combined.includes("kliqqi"))
    return "pligg";
  if (combined.includes("phpld")) return "phpld";
  if (combined.includes("scuttle")) return "scuttle";
  if (combined.includes("drigg")) return "drigg";

  return "unknown";
}

// Extract meta[name="generator"] content and check against keywords
function metaGeneratorMatches(html: string, keywords: string[]): boolean {
  const match = html.match(
    /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i
  ) ||
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']generator["']/i
    );
  if (!match) return false;
  const content = match[1].toLowerCase();
  return keywords.some((kw) => content.includes(kw));
}

// Check if any <form> has an action matching the given path segment
function formActionMatches(html: string, pathSegment: string): boolean {
  const re = new RegExp(
    `<form[^>]+action=["'][^"']*${pathSegment}[^"']*["']`,
    "i"
  );
  return re.test(html);
}

// ---------------------------------------------------------------------------
// Fetch a URL with timeout — returns { html, headers } or null on error
// ---------------------------------------------------------------------------
async function fetchWithTimeout(
  url: string
): Promise<{ html: string; headers: Headers } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
    });
    const html = await resp.text();
    clearTimeout(timer);
    return { html, headers: resp.headers };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // 1. Fetch undetected sites (site_id IS NULL)
  const { data: sites, error: fetchErr } = await supabase
    .from("target_sites")
    .select("id, url")
    .is("site_id", null)
    .eq("is_active", true)
    .limit(BATCH_LIMIT);

  if (fetchErr) {
    return new Response(
      JSON.stringify({ error: fetchErr.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!sites || sites.length === 0) {
    return new Response(
      JSON.stringify({ message: "No undetected sites found.", processed: 0 }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  console.log(`[detect-site-templates] Processing ${sites.length} sites...`);

  const results: { id: string; url: string; site_id: SiteTemplate }[] = [];

  // 2. Process each site
  for (const site of sites) {
    console.log(`[detect-site-templates] Fetching: ${site.url}`);
    const fetched = await fetchWithTimeout(site.url);

    let detected: SiteTemplate = "unknown";

    if (fetched) {
      detected = detectTemplate(fetched.html, fetched.headers);
    } else {
      console.warn(
        `[detect-site-templates] Failed to fetch ${site.url} — marking as unknown`
      );
    }

    console.log(
      `[detect-site-templates] ${site.url} → ${detected}`
    );

    // 3. Write detected site_id back to the row
    const { error: updateErr } = await supabase
      .from("target_sites")
      .update({ site_id: detected })
      .eq("id", site.id);

    if (updateErr) {
      console.error(
        `[detect-site-templates] Failed to update ${site.id}: ${updateErr.message}`
      );
    } else {
      results.push({ id: site.id, url: site.url, site_id: detected });
    }
  }

  return new Response(
    JSON.stringify({
      message: "Detection complete.",
      processed: results.length,
      results,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
