export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {

    const { username, url } = req.body;

    if (!username || !url) {
      return res.status(400).json({
        success: false,
        error: "Thiếu username hoặc url"
      });
    }

    let finalUrl = url;

// Nếu là link rút gọn Shopee
if (url.includes("s.shopee.")) {

  const expand = await fetch(
    `https://hoantien-spo.vercel.app/api/expand?url=${encodeURIComponent(url)}`
  );

  const json = await expand.json();

  finalUrl = json.expandedUrl;

}

    }

    // Bỏ toàn bộ query phía sau dấu ?
    finalUrl = finalUrl.split("?")[0];

    const affiliateId = "17340760181";

    const affiliateLink =
      `https://s.shopee.sg/an_redir?origin_link=${encodeURIComponent(finalUrl)}&affiliate_id=${affiliateId}&sub_id=${encodeURIComponent(username)}`;

    return res.status(200).json({
      success: true,
      result: affiliateLink
    });

  } catch (err) {

    return res.status(500).json({
      success: false,
      error: err.message
    });

  }

}
