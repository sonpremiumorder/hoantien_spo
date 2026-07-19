import { chromium } from "playwright-core";
import chromiumBinary from "@sparticuz/chromium";

export default async function handler(req, res) {

  const { url } = req.query;

  if (!url || !url.startsWith("http")) {
    return res.status(400).json({
      error: "Invalid or missing URL"
    });
  }

  let browser;

  try {

    browser = await chromium.launch({
      args: chromiumBinary.args,
      executablePath: await chromiumBinary.executablePath(),
      headless: true
    });

    const page = await browser.newPage({

      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0 Safari/537.36"

    });

    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30000
    });

    // Đợi nếu còn redirect
    await page.waitForTimeout(5000);

    const finalUrl = page.url();

    await browser.close();

    return res.status(200).json({
      expandedUrl: finalUrl
    });

  } catch (err) {

    if (browser) {
      await browser.close();
    }

    return res.status(500).json({
      error: err.message
    });

  }

}
