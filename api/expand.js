export default async function handler(req, res) {

  const { url } = req.query;

  if (!url || !url.startsWith("http")) {
    return res.status(400).json({
      error: "Invalid or missing URL"
    });
  }

  try {

    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0 Safari/537.36"
      }
    });

    return res.status(200).json({
      expandedUrl: response.url
    });

  } catch (err) {

    return res.status(500).json({
      error: err.message
    });

  }

}
