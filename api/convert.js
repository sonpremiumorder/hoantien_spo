import crypto from "crypto";

const SHOPEE_AFFILIATE_ID = process.env.SHOPEE_AFFILIATE_ID || "17340760181";
const LAZADA_BASE_URL = (process.env.LAZADA_BASE_URL || "https://api.lazada.vn").replace(/\/+$/, "");
const LAZADA_API_PATH = process.env.LAZADA_API_PATH || "/marketing/getlink";
const LAZADA_PARTNER_ID = process.env.LAZADA_PARTNER_ID || "lazop-sdk-php-affiliate-1.0";

const SHP_TODAY_API_URL = process.env.SHP_TODAY_API_URL || "https://shp.today/create-link.php";
const SHP_TODAY_API_KEY = process.env.SHP_TODAY_API_KEY || "";

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

  if (/(^|\.)tiktok\.com$/.test(host) ||
      /^(vm|vt|m|shop)\.tiktok\.com$/.test(host)) return "tiktok";

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
    if (platform === "lazada") {
      return /(^|\.)lazada\.(vn|sg|co\.th|com\.my|com\.ph|co\.id)$/.test(h) ||
             /(^|\.)lzd\.co$/.test(h);
    }
    if (platform === "tiktok") {
      return /(^|\.)tiktok\.com$/.test(h) ||
             /^(vm|vt|m|shop)\.tiktok\.com$/.test(h);
    }
    return false;
  } catch { return false; }
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

function formatVnd(val) {
  if (val == null || val === "") return "";
  if (typeof val === "string" && /[đ₫]/i.test(val)) return val.trim();
  const num = Number(String(val).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(num) || num <= 0) return String(val);
  return Math.round(num).toLocaleString("vi-VN") + "đ";
}

function formatPercent(val) {
  if (val == null || val === "") return "";
  const str = String(val).trim();
  if (str.endsWith("%")) return str;
  const num = Number(str.replace(",", "."));
  if (!Number.isFinite(num) || num <= 0) return "";
  return num.toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + "%";
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

async function createViaShpTodayApi(targetUrl, username, platform) {
  if (!SHP_TODAY_API_KEY) {
    throw new Error("Chưa cấu hình SHP_TODAY_API_KEY trên Vercel.");
  }

  const params = new URLSearchParams({
    api: "1",
    format: "json",
    sub1: String(username).slice(0, 100),
    url: targetUrl
  });

  const response = await fetch(`${SHP_TODAY_API_URL}?${params.toString()}`, {
    method: "GET",
    headers: {
      "X-API-Key": SHP_TODAY_API_KEY,
      "Accept": "application/json, text/plain, */*"
    },
    signal: AbortSignal.timeout(20000)
  });

  const raw = (await response.text()).trim();

  if (!response.ok) {
    throw new Error(`API shp.today HTTP ${response.status}: ${raw.slice(0, 250)}`);
  }

  // Trường hợp API trả về 1 dòng text là link rút gọn
  if (/^https?:\/\/\S+$/i.test(raw)) {
    return {
      result: raw,
      title: "",
      price: "",
      image: "",
      commission: "",
      commission_pct: ""
    };
  }

  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error(`API shp.today trả về lỗi (${platform}): ` + raw.slice(0, 250)); }

  const info = data.data && typeof data.data === "object" ? data.data : data;
  const link = info.link || info.url || info.short_url || info.result || data.link;

  if (!link || data.ok === false || data.success === false) {
    throw new Error(data.error || data.message || `API shp.today không tạo được link ${platform}.`);
  }

  const rawPrice = info.price || info.product_price || info.sale_price || "";
  const rawCommission = info.user_commission || info.cashback || info.commission || info.estimated_commission || "";
  let rawPct = info.user_commission_pct || info.commission_pct || info.commission_rate || info.rate || info.percent || "";

  // Tự tính % nếu có tiền hoàn & giá nhưng chưa có trường %
  if (!rawPct && rawPrice && rawCommission) {
    const p = Number(String(rawPrice).replace(/[^\d.]/g, ""));
    const c = Number(String(rawCommission).replace(/[^\d.]/g, ""));
    if (p > 0 && c > 0) {
      rawPct = ((c / p) * 100).toFixed(1);
    }
  }

  return {
    result: link,
    title: info.title || info.product_name || info.name || "",
    price: formatVnd(rawPrice),
    image: info.image || info.cover || info.thumbnail || info.product_image || "",
    commission: formatVnd(rawCommission),
    commission_pct: formatPercent(rawPct)
  };
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

async function fetchShopeeMetadata(cleanUrl) {
  let productTitle = "Sản phẩm Shopee";
  let productPrice = "Đang cập nhật";
  let productImg = "https://placehold.co/100x100?text=Shopee";
  let productCommission = "";
  let productCommissionPct = "";

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
          if (item.price) productPrice = Math.round(item.price / 100000).toLocaleString("vi-VN") + "đ";
        }
      }
    }
  } catch (err) {
    console.error("Shopee product metadata error:", err.message);
  }

  return { productTitle, productPrice, productImg, productCommission, productCommissionPct };
}

async function createShopeeAffiliateLink(originalUrl, username) {
  let finalUrl = originalUrl;

  if (isShortUrl(originalUrl, "shopee")) {
    finalUrl = await expandShortUrl(originalUrl, "shopee");
  }

  const cleanUrl = finalUrl.split("?")[0];
  const affiliateLink =
    `https://s.shopee.sg/an_redir?origin_link=${encodeURIComponent(cleanUrl)}` +
    `&affiliate_id=${encodeURIComponent(SHOPEE_AFFILIATE_ID)}` +
    `&sub_id=${encodeURIComponent(username)}`;

  const meta = await fetchShopeeMetadata(cleanUrl);

  return {
    result: affiliateLink,
    title: meta.productTitle,
    price: meta.productPrice,
    image: meta.productImg,
    commission: meta.productCommission,
    commission_pct: meta.productCommissionPct
  };
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
    try { inputUrl = new URL(String(url).trim()).toString(); }
    catch { return jsonError(res, 400, "URL không hợp lệ"); }

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

    const defaultLabels = {
      shopee: { title: "Sản phẩm Shopee", image: "https://placehold.co/100x100?text=Shopee" },
      lazada: { title: "Sản phẩm Lazada", image: "https://placehold.co/100x100?text=Lazada" },
      tiktok: { title: "Sản phẩm TikTok Shop", image: "https://placehold.co/100x100?text=TikTok" }
    };

    if (SHP_TODAY_API_KEY) {
      try {
        const apiData = await createViaShpTodayApi(inputUrl, cleanUsername, platform);
        let title = apiData.title || defaultLabels[platform].title;
        let price = apiData.price || "Đang cập nhật";
        let image = apiData.image || defaultLabels[platform].image;

        if (platform === "shopee" && (!apiData.title || !apiData.image)) {
          const meta = await fetchShopeeMetadata(inputUrl.split("?")[0]);
          if (!apiData.title) title = meta.productTitle;
          if (!apiData.price) price = meta.productPrice;
          if (!apiData.image) image = meta.productImg;
        }

        return res.status(200).json({
          success: true,
          platform,
          result: apiData.result,
          title,
          price,
          image,
          commission: apiData.commission || "",
          commission_pct: apiData.commission_pct || ""
        });
      } catch (apiErr) {
        console.warn(`SHP_TODAY API failed for ${platform}, fallback if supported:`, apiErr.message);
        if (platform === "tiktok") throw apiErr;
      }
    }

    if (platform === "lazada") {
      const result = await createLazadaAffiliateLink(inputUrl, cleanUsername);
      return res.status(200).json({
        success: true,
        platform: "lazada",
        result,
        title: "Sản phẩm Lazada",
        price: "Đang cập nhật",
        image: "https://placehold.co/100x100?text=Lazada",
        commission: "",
        commission_pct: ""
      });
    }

    if (platform === "tiktok") {
      throw new Error("Chưa cấu hình SHP_TODAY_API_KEY hoặc API TikTok chưa tạo được link.");
    }

    const result = await createShopeeAffiliateLink(inputUrl, cleanUsername);
    return res.status(200).json({ success: true, platform: "shopee", ...result });

  } catch (err) {
    console.error("SPO convert error:", err);
    return jsonError(res, 502, err.message || "Không thể chuyển đổi link.");
  }
}
