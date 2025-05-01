const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');

const scrapeLowes = require('./scrapers/lowes.js');
const scrapeHomeDepot = require('./scrapers/homedepot.js');

const wait = ms => new Promise(r => setTimeout(r, ms));

async function start() {

  const links = (await fs.readFile("lowesLinks.txt", "utf-8"))
    .split("\n")
    .map(link => link.trim())
    .filter(Boolean);

  for (const url of links) {
    try {
      if (url.includes("homedepot")) {
        await scrapeHomeDepot(url); // now you’re calling the known-good code
      } else if (url.includes("lowes")) {
        const puppeteer = require('puppeteer-extra');
        const StealthPlugin = require('puppeteer-extra-plugin-stealth');
        puppeteer.use(StealthPlugin());

        const browser = await puppeteer.launch({
          headless: false,
          args: ['--start-maximized', '--no-sandbox'],
        });
        const page = await browser.newPage();
        await page.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
        );

        await scrapeLowes(page, url);
        await browser.close();
      } else {
        console.log("⚠️ Unknown site:", url);
      }

      await wait(1500 + Math.random() * 1000); // slows down to avoid rate limits

    } catch (err) {
      console.error("⚠️ Error scraping:", url, err.message);
    }
  }
}

start();
