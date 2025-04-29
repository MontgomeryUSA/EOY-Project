const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require("fs/promises");
const fsSync = require("fs");

puppeteer.use(StealthPlugin());

async function start() {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--start-maximized', '--no-sandbox'],
    defaultViewport: null
  });

  const links = (await fs.readFile("links.txt", "utf-8"))
    .split("\n")
    .map(link => link.trim())
    .filter(link => link.length > 0);

  fsSync.writeFileSync("results.csv", "Title,Price,URL\n");

  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  for (const url of links) {
    console.log("Visiting:", url);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

      // Wait for the new sticky price selector
      await page.waitForSelector(
        '#sticky-nav > div > div.sui-flex.sui-flex-row.sui-gap-4.sui-pe-16.sui-relative > div.sui-flex.sui-flex-row.sui-justify-between.sui-gap-4.sui-w-full > div:nth-child(2)',
        { timeout: 20000 }
      );

      const data = await page.evaluate(() => {
        const titleEl = document.querySelector("h1");
        const priceEl = document.querySelector(
          '#sticky-nav > div > div.sui-flex.sui-flex-row.sui-gap-4.sui-pe-16.sui-relative > div.sui-flex.sui-flex-row.sui-justify-between.sui-gap-4.sui-w-full > div:nth-child(2)'
        );

        const title = titleEl ? titleEl.textContent.trim() : "No title found";
        const price = priceEl ? priceEl.textContent.replace(/\s+/g, '').trim() : "";

        return { title, price };
      });

      console.log("Scraped:", data.title, "| Price:", data.price);

      fsSync.appendFileSync("results.csv", `"${data.title}","${data.price}","${url}"\n`);
    } catch (err) {
      console.error("Error scraping", url, err.message);
    }
  }

  await browser.close();
}

start();
