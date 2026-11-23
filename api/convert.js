import crypto from "crypto";
const SHOPEE_AFFILIATE_ID = process.env.SHOPEE_AFFILIATE_ID || "17340760181";
const LAZADA_BASE_URL = (process.env.LAZADA_BASE_URL || "https://api.lazada.vn").replace(/\/+$/, "");
const LAZADA_API_PATH = process.env.LAZADA_API_PATH || "/marketing/getlink";
const LAZADA_PARTNER_ID = process.env.LAZADA_PARTNER_ID || "lazop-sdk-php-affiliate-1.0";

function jsonError(res, status, error) {
  return res.status(status).json({ success: false, error });
}

function detectPlatform(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { return null; }
  const host = u.hostname.toLowerCase();

  if (/(^|\.)shopee\.(vn|sg|com\.my|co\.th|ph|co\.id)$/.test(host) ||
      /(^|\.)shp\.ee$/.test(host)) return "shopee";

  if (/(^|\.)lazada\.(vn|sg|co\.th|com\.my|com\.ph|co\.id)$/.test(host) ||
      /(^|\.)lzd\.co$/.test(host)) return "lazada";

  return null;
}

function isAllowedPlatformHost(rawUrl, platform) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const h = u.hostname.toLowerCase();
    if (platform === "shopee") {
      return /(^|\.)shopee\.(vn|sg|com\.my|co\.th|ph|co\.id)$/.test(h) ||
             /(^|\.)shp\.ee$/.test(h);
    }
    return /(^|\.)lazada\.(vn|sg|co\.th|com\.my|com\.ph|co\.id)$/.test(h) ||
           /(^|\.)lzd\.co$/.test(h);
  } catch { return false; }
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
    if (/^https?:\/\/\S+$/i.test(value) &&
        /(lazada|lzd\.co|c\.lazada)/i.test(value)) return value;
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

async function createLazadaAffiliateLink(originalUrl, username) {
  const appKey = process.env.LAZADA_APP_KEY;
  const appSecret = process.env.LAZADA_APP_SECRET;
  const userToken = process.env.LAZADA_USER_TOKEN;

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

  const endpoint = `${LAZADA_BASE_URL}/rest${LAZADA_API_PATH}?${query.toString()}`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: { "User-Agent": LAZADA_PARTNER_ID, "Accept": "application/json" },
    signal: AbortSignal.timeout(25000)
  });

  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error("Lazada trả về dữ liệu không phải JSON: " + raw.slice(0, 250)); }

  if (!response.ok) {
    throw new Error(`Lazada HTTP ${response.status}: ${data.message || data.msg || raw.slice(0, 250)}`);
  }

  // Affiliate API thường trả code "0" khi thành công; vẫn kiểm tra lỗi rõ ràng.
  if (data.code !== undefined && String(data.code) !== "0") {
    throw new Error(`Lazada API ${data.code}: ${data.message || data.msg || "Không tạo được tracking link"}`);
  }

  const affiliateUrl = findAffiliateUrl(data);
  if (!affiliateUrl) {
    throw new Error("Lazada API phản hồi nhưng chưa tìm thấy trường link affiliate. Phản hồi: " +
      JSON.stringify(data).slice(0, 500));
  }

  return affiliateUrl;
}

async function createShopeeAffiliateLink(originalUrl, username) {
  let finalUrl = originalUrl;

  if (/shp\.ee|s\.shopee\./i.test(originalUrl)) {
    finalUrl = await expandShortUrl(originalUrl, "shopee");
  }

  // Giữ nguyên cách tạo affiliate link Shopee đang dùng.
  const cleanUrl = finalUrl.split("?")[0];
  const affiliateLink =
    `https://s.shopee.sg/an_redir?origin_link=${encodeURIComponent(cleanUrl)}` +
    `&affiliate_id=${encodeURIComponent(SHOPEE_AFFILIATE_ID)}` +
    `&sub_id=${encodeURIComponent(username)}`;

  let productTitle = "Sản phẩm Shopee";
  let productPrice = "Đang cập nhật";
  let productImg = "https://placehold.co/100x100?text=Shopee";
  let productCommission = "Theo dữ liệu affiliate";

  try {
    const match = cleanUrl.match(/i\.(\d+)\.(\d+)/);
    if (match) {
      const [, shopId, itemId] = match;
      const productResponse = await fetch(
        `https://shopee.vn/api/v4/item/get?itemid=${itemId}&shopid=${shopId}`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest"
          },
          signal: AbortSignal.timeout(10000)
        }
      );
      if (productResponse.ok) {
        const productJson = await productResponse.json();
        const item = productJson.data;
        if (item) {
          productTitle = item.name || productTitle;
          if (item.image) productImg = `https://down-vn.img.susercontent.com/file/${item.image}`;
          if (item.price) productPrice = "₫" + (item.price / 100000).toLocaleString("vi-VN");
        }
      }
    }
  } catch (err) {
    console.error("Shopee product metadata error:", err.message);
  }

  return {
    result: affiliateLink,
    title: productTitle,
    price: productPrice,
    image: productImg,
    commission: productCommission
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const { username, url } = req.body || {};
    if (!username || !url) return jsonError(res, 400, "Thiếu username hoặc url");

    let inputUrl;
    try { inputUrl = new URL(String(url).trim()).toString(); }
    catch { return jsonError(res, 400, "URL không hợp lệ"); }

    if (!["http:", "https:"].includes(new URL(inputUrl).protocol)) {
      return jsonError(res, 400, "Chỉ chấp nhận link HTTP/HTTPS");
    }

    let platform = detectPlatform(inputUrl);
    if (!platform) {
      return jsonError(res, 400, "Link không thuộc Shopee hoặc Lazada được hỗ trợ.");
    }

    if (!isAllowedPlatformHost(inputUrl, platform)) {
      // Chỉ short domain đã định danh mới được mở rộng.
      return jsonError(res, 400, "Tên miền link không được hỗ trợ.");
    }

    if ((platform === "lazada" && /s\.lazada\.vn|lzd\.co/i.test(inputUrl)) ||
        (platform === "shopee" && /shp\.ee|s\.shopee\./i.test(inputUrl))) {
      inputUrl = await expandShortUrl(inputUrl, platform);
    }

    if (platform === "lazada") {
      const result = await createLazadaAffiliateLink(inputUrl, username);
      return res.status(200).json({
        success: true,
        platform: "lazada",
        result,
        title: "Sản phẩm Lazada",
        price: "Đang cập nhật",
        image: "https://placehold.co/100x100?text=Lazada",
        commission: "Theo báo cáo Lazada"
      });
    }

    const result = await createShopeeAffiliateLink(inputUrl, String(username).trim());
    return res.status(200).json({ success: true, platform: "shopee", ...result });

  } catch (err) {
    console.error("SPO convert error:", err);
    return jsonError(res, 502, err.message || "Không thể chuyển đổi link.");
  }
}
