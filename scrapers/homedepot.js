const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fsSync = require("fs");

puppeteer.use(StealthPlugin());

module.exports = async function scrapeHomeDepot(url) {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--start-maximized',
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled'
    ],
    defaultViewport: null,
  });

  const page = await browser.newPage();

  // Set user agent and spoof screen
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
  );

  await page.setViewport({
    width: 1280 + Math.floor(Math.random() * 60),
    height: 800 + Math.floor(Math.random() * 60),
  });

  try {
    console.log("Visiting:", url);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });

    // Simulate mouse move to help bypass fingerprinting
    await page.mouse.move(100, 100);
    await new Promise(resolve => setTimeout(resolve, 500));
    await page.mouse.move(200, 150);

    const selector = '#sticky-nav > div > div.sui-flex.sui-flex-row.sui-gap-4.sui-pe-16.sui-relative > div.sui-flex.sui-flex-row.sui-justify-between.sui-gap-4.sui-w-full > div:nth-child(2)';

    await page.waitForSelector(selector, { timeout: 20000 });

    const data = await page.evaluate((sel) => {
      const titleEl = document.querySelector("h1");
      const priceEl = document.querySelector(sel);

      const title = titleEl ? titleEl.textContent.trim() : "No title found";
      const price = priceEl ? priceEl.textContent.replace(/\s+/g, '').trim() : "";

      return { title, price };
    }, selector);

    fsSync.appendFileSync("results.csv", `"${data.title}","${data.price}","${url}"\n`);
    console.log("✅ Scraped:", data.title, "| Price:", data.price);
  } catch (err) {
    console.error("❌ Home Depot scraping failed:", err.message);
  } finally {
    await browser.close();
  }
};
