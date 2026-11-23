import crypto from "crypto";

const SHOPEE_AFFILIATE_ID = process.env.SHOPEE_AFFILIATE_ID || "17340760181";
const LAZADA_BASE_URL = (process.env.LAZADA_BASE_URL || "https://api.lazada.vn").replace(/\/+$/, "");
const LAZADA_API_PATH = process.env.LAZADA_API_PATH || "/marketing/getlink";
const LAZADA_PARTNER_ID = process.env.LAZADA_PARTNER_ID || "lazop-sdk-php-affiliate-1.0";

const LAZADA_APP_KEY = process.env.LAZADA_APP_KEY || "105827";
const LAZADA_APP_SECRET = process.env.LAZADA_APP_SECRET || "r8ZMKhPxu1JZUCwTUBVMJiJnZKjhWeQF";
const LAZADA_USER_TOKEN = process.env.LAZADA_USER_TOKEN || "e53cf9601b55425690e98af306976594";

const TIKTOK_CONVERT_URL = process.env.TIKTOK_CONVERT_URL || "";
const TIKTOK_API_KEY = process.env.TIKTOK_API_KEY || "";

const SHP_TODAY_API_URL = process.env.SHP_TODAY_API_URL || "https://shp.today/create-link.php";
const SHP_TODAY_API_KEY = process.env.SHP_TODAY_API_KEY || "";

function jsonError(res, status, error, extra = {}) {
  return res.status(status).json({ success: false, error, ...extra });
}

function sanitizeSubId(raw) {
  return String(raw || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 50);
}

function detectPlatform(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();

  if (/(^|\.)shopee\.(vn|sg|com\.my|co\.th|ph|co\.id)$/.test(host) || /(^|\.)shp\.ee$/.test(host)) {
    return "shopee";
  }

  if (/(^|\.)lazada\.(vn|sg|co\.th|com\.my|com\.ph|co\.id)$/.test(host) || /(^|\.)lzd\.co$/.test(host)) {
    return "lazada";
  }

  if (/(^|\.)tiktok\.com$/.test(host) || /^(vm|vt|m|shop)\.tiktok\.com$/.test(host)) {
    return "tiktok";
  }

  return null;
}

function isAllowedPlatformHost(rawUrl, platform) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const h = u.hostname.toLowerCase();

    if (platform === "shopee") {
      return /(^|\.)shopee\.(vn|sg|com\.my|co\.th|ph|co\.id)$/.test(h) || /(^|\.)shp\.ee$/.test(h);
    }
    if (platform === "lazada") {
      return /(^|\.)lazada\.(vn|sg|co\.th|com\.my|com\.ph|co\.id)$/.test(h) || /(^|\.)lzd\.co$/.test(h);
    }
    if (platform === "tiktok") {
      return /(^|\.)tiktok\.com$/.test(h) || /^(vm|vt|m|shop)\.tiktok\.com$/.test(h);
    }
    return false;
  } catch {
    return false;
  }
}

function isShortUrl(rawUrl, platform) {
  if (platform === "shopee") return /shp\.ee|s\.shopee\./i.test(rawUrl);
  if (platform === "lazada") return /s\.lazada\.vn|lzd\.co/i.test(rawUrl);
  if (platform === "tiktok") return /(?:^|\.)(?:vm|vt)\.tiktok\.com\//i.test(rawUrl);
  return false;
}

async function expandShortUrl(url, platform) {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SPO-Link-Converter/1.0)" },
    signal: AbortSignal.timeout(15000)
  });
  const finalUrl = response.url || url;
  if (!isAllowedPlatformHost(finalUrl, platform)) {
    throw new Error("Link sau khi mở rộng không thuộc đúng nền tảng.");
  }
  return finalUrl;
}

async function createViaShpTodayApi(targetUrl, username) {
  if (!SHP_TODAY_API_KEY) {
    throw new Error("Chưa cấu hình SHP_TODAY_API_KEY trên Vercel.");
  }

  const sub1 = sanitizeSubId(username);
  const params = new URLSearchParams({ api: "1", url: targetUrl });
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
    throw new Error(raw || `API shp.today HTTP ${response.status}`);
  }

  const firstLine = raw.split(/\r?\n/)[0].trim();
  if (/^https?:\/\/\S+$/i.test(firstLine)) {
    return firstLine;
  }

  const data = JSON.parse(raw);
  const link = data.link || data.url || data.short_url || data.result;
  if (!link) throw new Error("API shp.today không trả về link.");
  return String(link).trim();
}

function cleanLazadaUrl(rawUrl) {
  const u = new URL(rawUrl);
  const remove = new Set([
    "trafficFrom", "laz_trackid", "mkttid", "exlaz", "spm", "scm", "from",
    "clickTrackInfo", "search", "mp", "c", "abbucket", "aff_trace_key",
    "aff_platform", "aff_request_id", "sk", "utparam"
  ]);
  for (const key of [...u.searchParams.keys()]) {
    if (remove.has(key)) u.searchParams.delete(key);
  }
  return u.toString();
}

function lazadaSignature(apiPath, allParams, secret) {
  const canonical = Object.keys(allParams).sort()
    .map((key) => `${key}${allParams[key]}`)
    .join("");
  return crypto.createHmac("sha256", secret)
    .update(apiPath + canonical, "utf8")
    .digest("hex")
    .toUpperCase();
}

function findAffiliateUrl(value, depth = 0) {
  if (depth > 8 || value == null) return "";
  if (typeof value === "string") {
    if (/^https?:\/\/\S+$/i.test(value) && /(lazada|lzd\.co|c\.lazada)/i.test(value)) return value;
    return "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAffiliateUrl(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value === "object") {
    const preferred = [
      "trackingUrl", "tracking_url", "shortLink", "shortUrl",
      "promotionUrl", "clickUrl", "affiliateUrl", "url", "link"
    ];
    for (const key of preferred) {
      if (value[key]) {
        const found = findAffiliateUrl(value[key], depth + 1);
        if (found) return found;
      }
    }
    for (const [key, item] of Object.entries(value)) {
      if (!preferred.includes(key)) {
        const found = findAffiliateUrl(item, depth + 1);
        if (found) return found;
      }
    }
  }
  return "";
}

function buildLazadaRestUrl(baseUrl, apiPath, query) {
  const cleanBase = String(baseUrl || "").replace(/\/+$/, "");
  const cleanPath = "/" + String(apiPath || "").replace(/^\/+/, "");
  const prefix = /\/rest$/i.test(cleanBase) ? "" : "/rest";
  return `${cleanBase}${prefix}${cleanPath}?${query.toString()}`;
}

async function createLazadaAffiliateLink(originalUrl, username) {
  const appKey = LAZADA_APP_KEY;
  const appSecret = LAZADA_APP_SECRET;
  const userToken = LAZADA_USER_TOKEN;

  if (!appKey || !appSecret || !userToken) {
    throw new Error("Chưa cấu hình LAZADA_APP_KEY, LAZADA_APP_SECRET và LAZADA_USER_TOKEN trên Vercel.");
  }

  const cleanedUrl = cleanLazadaUrl(originalUrl);
  const apiParams = {
    userToken,
    inputType: "url",
    inputValue: cleanedUrl,
    subId1: String(username).slice(0, 100)
  };

  const sysParams = {
    app_key: appKey,
    sign_method: "sha256",
    timestamp: String(Date.now()),
    partner_id: LAZADA_PARTNER_ID
  };

  const allParams = { ...apiParams, ...sysParams };
  const sign = lazadaSignature(LAZADA_API_PATH, allParams, appSecret);
  const query = new URLSearchParams({ ...sysParams, sign, ...apiParams });

  const endpoint = buildLazadaRestUrl(LAZADA_BASE_URL, LAZADA_API_PATH, query);
  const response = await fetch(endpoint, {
    method: "GET",
    headers: { "User-Agent": LAZADA_PARTNER_ID, "Accept": "application/json" },
    signal: AbortSignal.timeout(25000)
  });

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Lazada trả về dữ liệu không phải JSON (HTTP ${response.status}): ${raw.slice(0, 200)}`);
  }

  if (!response.ok || (data.code !== undefined && String(data.code) !== "0")) {
    throw new Error(data.message || data.msg || `Lazada HTTP ${response.status}`);
  }

  const affiliateUrl = findAffiliateUrl(data);
  if (!affiliateUrl) throw new Error("Lazada API không trả về link affiliate.");
  return affiliateUrl;
}

async function createShopeeAffiliateLink(originalUrl, username) {
  const cleanUrl = originalUrl.split("?")[0];
  return (
    `https://s.shopee.sg/an_redir?origin_link=${encodeURIComponent(cleanUrl)}` +
    `&affiliate_id=${encodeURIComponent(SHOPEE_AFFILIATE_ID)}` +
    `&sub_id=${encodeURIComponent(username)}`
  );
}

async function createTiktokAffiliateLink(originalUrl, username) {
  if (!TIKTOK_CONVERT_URL) {
    throw new Error("Chưa cấu hình TIKTOK_CONVERT_URL.");
  }

  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/plain, */*"
  };
  if (TIKTOK_API_KEY) {
    headers["Authorization"] = `Bearer ${TIKTOK_API_KEY.replace(/^Bearer\s+/i, "").trim()}`;
  }

  const response = await fetch(TIKTOK_CONVERT_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ url: originalUrl, username }),
    signal: AbortSignal.timeout(20000)
  });

  const raw = await response.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`TikTok API trả về dữ liệu không hợp lệ (HTTP ${response.status})`);
  }

  const link =
    json.result ||
    json.url ||
    json.link ||
    json.affiliate_url ||
    (json.data && (json.data.result || json.data.url || json.data.link || json.data.affiliate_url));

  if (!response.ok || !link) {
    throw new Error(json.error || json.message || "TikTok API không trả về link.");
  }

  return String(link).trim();
}

async function createDirectPlatformLink(platform, inputUrl, cleanUsername) {
  if (platform === "shopee") {
    return await createShopeeAffiliateLink(inputUrl, cleanUsername);
  }
  if (platform === "lazada") {
    return await createLazadaAffiliateLink(inputUrl, cleanUsername);
  }
  if (platform === "tiktok") {
    return await createTiktokAffiliateLink(inputUrl, cleanUsername);
  }
  throw new Error("Nền tảng không được hỗ trợ.");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const { username, url } = req.body || {};
    if (!username || !url) return jsonError(res, 400, "Thiếu username hoặc url");

    const cleanUsername = String(username).trim();

    let inputUrl;
    try {
      inputUrl = new URL(String(url).trim()).toString();
    } catch {
      return jsonError(res, 400, "URL không hợp lệ");
    }

    if (!["http:", "https:"].includes(new URL(inputUrl).protocol)) {
      return jsonError(res, 400, "Chỉ chấp nhận link HTTP/HTTPS");
    }

    const platform = detectPlatform(inputUrl);
    if (!platform) {
      return jsonError(res, 400, "Link không thuộc Shopee, Lazada hoặc TikTok được hỗ trợ.");
    }

    if (!isAllowedPlatformHost(inputUrl, platform)) {
      return jsonError(res, 400, "Tên miền link không được hỗ trợ.");
    }

    if (isShortUrl(inputUrl, platform)) {
      inputUrl = await expandShortUrl(inputUrl, platform);
    }

    let resultLink = "";

    if (platform === "lazada") {
      resultLink = await createLazadaAffiliateLink(inputUrl, cleanUsername);
    } else {
      if (SHP_TODAY_API_KEY) {
        try {
          resultLink = await createViaShpTodayApi(inputUrl, cleanUsername);
        } catch (shpErr) {
          console.warn("shp.today failed, falling back to direct platform:", shpErr.message);
        }
      }

      if (!resultLink) {
        resultLink = await createDirectPlatformLink(platform, inputUrl, cleanUsername);
      }
    }

    return res.status(200).json({
      success: true,
      platform,
      result: resultLink
    });
  } catch (err) {
    console.error("SPO convert error:", err);
    return jsonError(res, 502, err.message || "Không thể chuyển đổi link.");
  }
}
