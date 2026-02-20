const axios = require('axios');

const SERPER_API_KEY = process.env.SERPER_API_KEY;
const SERPER_URL = 'https://google.serper.dev/search';

/**
 * Generate diverse search dorks for a keyword
 */
function generateDorks(keyword) {
  const kw = keyword.toLowerCase().trim();

  const dorks = [
    `${kw} "powered by shopify"`,
    `${kw} site:myshopify.com`,
    `${kw} "add to cart" "powered by shopify"`,
    `buy ${kw} "powered by shopify"`,
    `${kw} shopify store`,
    `${kw} /collections/ "powered by shopify"`,
    `${kw} /products/ "powered by shopify"`,
    `${kw} "powered by shopify" 2025`,
    `${kw} shop "powered by shopify"`,
    `${kw} "free shipping" "powered by shopify"`,
    `best ${kw} "powered by shopify"`,
    `${kw} "reviews" "powered by shopify"`,
    `${kw} "sale" "powered by shopify"`,
    `${kw} "worldwide shipping" "powered by shopify"`,
    `${kw} online store shopify`,
    `shop ${kw} "powered by shopify"`,
    `${kw} premium "powered by shopify"`,
    `${kw} wholesale "powered by shopify"`,
    `${kw} bundle OR kit "powered by shopify"`,
    `${kw} subscription "powered by shopify"`,
    `${kw} "track order" "powered by shopify"`,
    `${kw} "our products" "powered by shopify"`,
    `${kw} buy online shopify`,
    `${kw} store "powered by shopify" usa OR uk`,
    `${kw} "powered by shopify" global`,
    `${kw} "cart" "powered by shopify"`,
    `cheap ${kw} "powered by shopify"`,
    `${kw} store online shopify`,
    `${kw} "shopify" "$"`,
    `${kw} official store shopify`,
  ];

  // e-prefix variant
  if (!kw.startsWith('e-')) {
    dorks.push(`e-${kw} "powered by shopify"`);
    dorks.push(`e-${kw} site:myshopify.com`);
    dorks.push(`e-${kw} shopify store`);
  }

  return [...new Set(dorks)];
}

/**
 * Search via Serper.dev (Google results)
 */
async function searchSerper(query, num = 30) {
  try {
    const resp = await axios.post(SERPER_URL, {
      q: query,
      num,
    }, {
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    const organic = resp.data?.organic || [];
    return organic.map(r => ({
      title: r.title || '',
      url: r.link || '',
      description: r.snippet || '',
    }));
  } catch (err) {
    console.error(`Serper error for "${query}":`, err.message);
    return [];
  }
}

/**
 * Run all dorks and collect unique URLs
 */
async function searchAllDorks(keyword, onProgress) {
  const dorks = generateDorks(keyword);
  const allResults = new Map();
  let completed = 0;

  // Blacklisted domains (not stores)
  const blacklist = new Set([
    'google.com','bing.com','duckduckgo.com','youtube.com','facebook.com',
    'twitter.com','x.com','reddit.com','instagram.com','pinterest.com',
    'amazon.com','ebay.com','wikipedia.org','linkedin.com','tiktok.com',
    'shopify.com','apps.shopify.com','themes.shopify.com','community.shopify.com',
    'medium.com','quora.com','trustpilot.com','bbb.org','crunchbase.com',
    'github.com','stackoverflow.com','wordpress.com',
  ]);

  const batchSize = 3;
  for (let i = 0; i < dorks.length; i += batchSize) {
    const batch = dorks.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(d => searchSerper(d)));

    for (const results of batchResults) {
      for (const r of results) {
        try {
          const host = new URL(r.url).hostname.replace('www.', '');
          if (blacklist.has(host)) continue;
          if (!allResults.has(host)) {
            allResults.set(host, r);
          }
        } catch {}
      }
    }

    completed += batch.length;
    if (onProgress) {
      onProgress({ phase: 'searching', completed, total: dorks.length, found: allResults.size });
    }

    // Small delay between batches
    if (i + batchSize < dorks.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return Array.from(allResults.values());
}

module.exports = { generateDorks, searchAllDorks };
