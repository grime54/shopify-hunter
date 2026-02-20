const axios = require('axios');

const SERPER_URL = 'https://google.serper.dev/search';

const BLACKLIST = new Set([
  'google.com','bing.com','duckduckgo.com','youtube.com','facebook.com',
  'twitter.com','x.com','reddit.com','instagram.com','pinterest.com',
  'amazon.com','ebay.com','wikipedia.org','linkedin.com','tiktok.com',
  'shopify.com','apps.shopify.com','themes.shopify.com','community.shopify.com',
  'help.shopify.com','shopify.dev','changelog.shopify.com',
  'medium.com','quora.com','trustpilot.com','bbb.org','crunchbase.com',
  'github.com','stackoverflow.com','wordpress.com','aliexpress.com',
  'etsy.com','walmart.com','target.com','bestbuy.com','play.google.com',
  'apps.apple.com','web.archive.org','yelp.com','make.com','zapier.com',
  'producthunt.com','techcrunch.com','forbes.com','businessinsider.com',
]);

/**
 * Generate dorks — NO QUOTES (Serper returns 400 on quoted queries)
 */
function generateDorks(keyword) {
  const kw = keyword.trim();
  const kwl = kw.toLowerCase();

  const dorks = [
    // Powered by Shopify (no quotes — Serper handles it)
    `${kw} powered by shopify`,
    `buy ${kw} powered by shopify`,
    `best ${kw} powered by shopify`,
    `${kw} shop powered by shopify`,
    `${kw} store powered by shopify`,
    `cheap ${kw} powered by shopify`,
    `${kw} online powered by shopify`,
    `${kw} free shipping powered by shopify`,
    `${kw} sale powered by shopify`,
    `${kw} reviews powered by shopify`,
    `${kw} add to cart powered by shopify`,
    `${kw} worldwide shipping powered by shopify`,
    `${kw} discount powered by shopify`,
    `${kw} premium powered by shopify`,
    `${kw} wholesale powered by shopify`,
    `${kw} subscription powered by shopify`,
    `${kw} bundle powered by shopify`,
    `${kw} collection powered by shopify`,
    `${kw} track order powered by shopify`,
    `${kw} new arrivals powered by shopify`,
    `${kw} best seller powered by shopify`,

    // myshopify domain
    `${kw} site:myshopify.com`,
    `buy ${kw} site:myshopify.com`,
    `best ${kw} site:myshopify.com`,
    `${kw} shop site:myshopify.com`,
    `${kw} store site:myshopify.com`,

    // Shopify URL patterns
    `${kw} shopify store`,
    `${kw} shopify online store`,
    `${kw} shopify store buy`,
    `${kw} shopify shop online`,
    `buy ${kw} online shopify`,
    `best ${kw} shopify store`,
    `${kw} shop shopify`,

    // CDN / checkout
    `${kw} cdn.shopify.com`,
    `${kw} checkout shopify`,
    `${kw} cart shopify store`,
    `${kw} myshopify.com`,
    
    // Product URL patterns
    `${kw} inurl:products shopify`,
    `${kw} inurl:collections shopify`,
    `${kw} /products/ shopify`,
    `${kw} /collections/ shopify`,

    // Regional
    `${kw} powered by shopify USA`,
    `${kw} powered by shopify UK`,
    `${kw} powered by shopify Europe`,
    `${kw} powered by shopify global`,
    `${kw} powered by shopify international`,
    `${kw} powered by shopify Canada`,
    `${kw} powered by shopify Australia`,

    // Category-specific
    `${kw} official store shopify`,
    `${kw} custom shopify store`,
    `${kw} luxury shopify store`,
    `${kw} organic shopify store`,
  ];

  // e-prefix
  if (!kwl.startsWith('e-') && !kwl.startsWith('e ')) {
    dorks.push(`e-${kw} powered by shopify`);
    dorks.push(`e-${kw} site:myshopify.com`);
    dorks.push(`e-${kw} shopify store`);
    dorks.push(`e${kw} powered by shopify`);
    dorks.push(`e${kw} site:myshopify.com`);
  }

  // Plural/singular
  if (!kw.endsWith('s')) {
    dorks.push(`${kw}s powered by shopify`);
    dorks.push(`${kw}s site:myshopify.com`);
    dorks.push(`${kw}s shopify store`);
  } else {
    const singular = kw.slice(0, -1);
    dorks.push(`${singular} powered by shopify`);
    dorks.push(`${singular} site:myshopify.com`);
  }

  return [...new Set(dorks)];
}

/**
 * Search via Serper.dev
 */
async function searchSerper(query, apiKey, gl = 'us') {
  try {
    const resp = await axios.post(SERPER_URL, { q: query, num: 100, gl }, {
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    return (resp.data?.organic || []).map(r => ({
      title: r.title || '', url: r.link || '', description: r.snippet || '',
    }));
  } catch (err) {
    console.error(`Serper [${err.response?.status || err.message}]: "${query.slice(0, 50)}"`);
    return [];
  }
}

/**
 * Run all dorks + multi-region, collect unique URLs
 */
async function searchAllDorks(keyword, apiKey, onProgress) {
  const dorks = generateDorks(keyword);
  const allResults = new Map();
  let completed = 0;

  // Extra regions for top queries
  const multiRegionDorks = [
    `${keyword} powered by shopify`,
    `${keyword} site:myshopify.com`,
    `${keyword} shopify store`,
    `buy ${keyword} powered by shopify`,
    `best ${keyword} shopify store`,
  ];
  const regions = ['gb', 'de', 'tr', 'au', 'ca', 'fr', 'nl', 'in'];
  const regionQueries = [];
  for (const dork of multiRegionDorks) {
    for (const gl of regions) {
      regionQueries.push({ q: dork, gl });
    }
  }

  const totalAll = dorks.length + regionQueries.length;

  // PHASE 1: Main dorks (US)
  const batchSize = 3;
  for (let i = 0; i < dorks.length; i += batchSize) {
    const batch = dorks.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(d => searchSerper(d, apiKey, 'us')));
    for (const r of results) collect(r, allResults);
    completed += batch.length;
    if (onProgress) onProgress({ phase: 'searching', completed, total: totalAll, found: allResults.size });
    if (i + batchSize < dorks.length) await sleep(100);
  }

  // PHASE 2: Multi-region for top dorks
  for (let i = 0; i < regionQueries.length; i += batchSize) {
    const batch = regionQueries.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(rq => searchSerper(rq.q, apiKey, rq.gl)));
    for (const r of results) collect(r, allResults);
    completed += batch.length;
    if (onProgress) onProgress({ phase: 'searching', completed, total: totalAll, found: allResults.size });
    if (i + batchSize < regionQueries.length) await sleep(100);
  }

  return Array.from(allResults.values());
}

function collect(results, map) {
  for (const r of results) {
    try {
      const host = new URL(r.url).hostname.replace(/^www\./, '');
      if (BLACKLIST.has(host)) return;
      if (host.includes('shopify.com') && !host.includes('myshopify.com')) return;
      if (!map.has(host)) map.set(host, r);
    } catch {}
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { generateDorks, searchAllDorks };
