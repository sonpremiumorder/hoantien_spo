export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawUrl = String(req.query?.url || "");
  let parsed;
  try { parsed = new URL(rawUrl); }
  catch { return res.status(400).json({ error: "Invalid or missing URL" }); }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return res.status(400).json({ error: "Only HTTP/HTTPS URLs are allowed" });
  }

  const host = parsed.hostname.toLowerCase();
  const allowed =
    /(^|\.)shopee\.(vn|sg|com\.my|co\.th|ph|co\.id)$/.test(host) ||
    /(^|\.)shp\.ee$/.test(host) ||
    /(^|\.)lazada\.(vn|sg|co\.th|com\.my|com\.ph|co\.id)$/.test(host) ||
    /(^|\.)lzd\.co$/.test(host);

  if (!allowed) {
    return res.status(400).json({ error: "Unsupported link domain" });
  }

  try {
    const response = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0 Safari/537.36"
      },
      signal: AbortSignal.timeout(15000)
    });

    const expanded = new URL(response.url || parsed.toString());
    const finalHost = expanded.hostname.toLowerCase();
    const finalAllowed =
      /(^|\.)shopee\.(vn|sg|com\.my|co\.th|ph|co\.id)$/.test(finalHost) ||
      /(^|\.)lazada\.(vn|sg|co\.th|com\.my|com\.ph|co\.id)$/.test(finalHost);

    if (!finalAllowed) {
      return res.status(400).json({ error: "Redirect target is not a supported marketplace" });
    }

    return res.status(200).json({ expandedUrl: expanded.toString() });
  } catch (err) {
    return res.status(502).json({ error: err.message || "Unable to expand URL" });
  }
}
