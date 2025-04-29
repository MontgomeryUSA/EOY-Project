const fsSync = require('fs');

module.exports = async function scrapeLowes(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const data = await page.evaluate(() => {
      const scriptTag = document.querySelector('script[type="application/ld+json"]');
      if (!scriptTag) return null;

      try {
        const json = JSON.parse(scriptTag.textContent);
        const product = Array.isArray(json)
          ? json.find(entry => entry['@type'] === 'Product')
          : (json['@type'] === 'Product' ? json : null);

        return product ? { title: product.name, price: product.offers?.price || null } : null;
      } catch {
        return null;
      }
    });

    if (data?.title) {
      fsSync.appendFileSync("results.csv", `"${data.title}","${data.price || ''}","${url}"\n`);
      console.log("✅ Lowe’s:", data.title, "| Price:", data.price || "N/A");
    } else {
      console.log("⚠️ Lowe’s: Failed to extract data for", url);
    }

  } catch (err) {
    console.error("❌ Lowe’s scrape error:", err.message);
  }
};
