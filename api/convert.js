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

    // Nếu là link rút gọn Shopee thì mở rộng
    if (url.includes("s.shopee.")) {

      const response = await fetch(url, {
        method: "HEAD",
        redirect: "follow"
      });

      finalUrl = response.url;

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
