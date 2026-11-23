async function createViaShpTodayApi(targetUrl, username) {
  if (!SHP_TODAY_API_KEY) {
    throw new Error("Thiếu SHP_TODAY_API_KEY.");
  }

  const sub1 = sanitizeSubId(username);
  const params = new URLSearchParams({
    api: "1",
    api_key: SHP_TODAY_API_KEY,
    url: targetUrl
  });
  if (sub1) params.set("sub1", sub1);

  const response = await fetch(`${SHP_TODAY_API_URL}?${params.toString()}`, {
    method: "GET",
    headers: {
      "X-API-Key": SHP_TODAY_API_KEY,
      "Accept": "text/plain, application/json, */*"
    },
    signal: AbortSignal.timeout(20000)
  });

  const raw = (await response.text()).trim();
  if (!response.ok || /^error\b/i.test(raw)) {
    throw new Error(raw || `shp.today HTTP ${response.status}`);
  }

  const firstLine = raw.split(/\r?\n/)[0].trim();
  if (/^https?:\/\/\S+$/i.test(firstLine)) {
    return firstLine;
  }

  const data = JSON.parse(raw);
  const link = data.link || data.url || data.short_url || data.result;
  if (!link) throw new Error("shp.today không trả về link.");
  return String(link).trim();
}
