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
  'fiverr.com','upwork.com',
]);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Single Serper search — returns up to 10 results on free plan
 */
async function searchSerper(query, apiKey, gl = 'us') {
  try {
    const resp = await axios.post(SERPER_URL, { q: query, gl, num: 10 }, {
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    return (resp.data?.organic || []).map(r => ({
      title: r.title || '', url: r.link || '', description: r.snippet || '',
    }));
  } catch (err) {
    console.error(`Serper [${err.response?.status}]: ${query.slice(0, 60)}`);
    return [];
  }
}

function collect(results, map) {
  let added = 0;
  for (const r of results) {
    try {
      const host = new URL(r.url).hostname.replace(/^www\./, '');
      if (BLACKLIST.has(host)) continue;
      if (host.includes('shopify.com') && !host.includes('myshopify.com')) continue;
      if (!map.has(host)) { map.set(host, r); added++; }
    } catch {}
  }
  return added;
}

/**
 * Main search — runs dorks SEQUENTIALLY to avoid rate limits
 * Each query = 1 API call = up to 10 results
 * Strategy: lots of diverse dorks to maximize unique domains
 */
async function searchAllDorks(keyword, apiKey, onProgress) {
  const kw = keyword.trim();
  const kwl = kw.toLowerCase();
  const allResults = new Map();

  // Generate ALL dorks upfront — variety is key since we only get 10 per query
  const allDorks = [];

  // ---- TIER 1: High-value dorks (US) ----
  const tier1 = [
    `${kw} "powered by shopify"`,
    `${kw} site:myshopify.com`,
    `buy ${kw} "powered by shopify"`,
    `best ${kw} "powered by shopify"`,
    `${kw} shop "powered by shopify"`,
    `${kw} store "powered by shopify"`,
    `shop ${kw} "powered by shopify"`,
    `${kw} "add to cart" "powered by shopify"`,
    `${kw} "free shipping" "powered by shopify"`,
    `cheap ${kw} "powered by shopify"`,
    `${kw} online "powered by shopify"`,
    `premium ${kw} "powered by shopify"`,
    `${kw} "sale" "powered by shopify"`,
    `${kw} collection "powered by shopify"`,
    `${kw} "reviews" "powered by shopify"`,
    `${kw} "worldwide shipping" "powered by shopify"`,
    `${kw} wholesale "powered by shopify"`,
    `${kw} bundle "powered by shopify"`,
    `${kw} subscription "powered by shopify"`,
    `${kw} discount "powered by shopify"`,
    `${kw} "cart" "powered by shopify"`,
    `${kw} official "powered by shopify"`,
    `${kw} custom "powered by shopify"`,
    `${kw} "new arrivals" "powered by shopify"`,
    `${kw} "best seller" "powered by shopify"`,
    `${kw} "track order" "powered by shopify"`,
    `${kw} kit "powered by shopify"`,
    `${kw} accessories "powered by shopify"`,
    `${kw} supplies "powered by shopify"`,
    `${kw} products "powered by shopify"`,
  ];
  tier1.forEach(d => allDorks.push({ q: d, gl: 'us' }));

  // ---- TIER 2: URL pattern dorks ----
  const tier2 = [
    `${kw} "cdn.shopify.com"`,
    `${kw} ".myshopify.com"`,
    `${kw} "checkout.shopify.com"`,
    `${kw} inurl:/products/ shopify`,
    `${kw} inurl:/collections/ shopify`,
    `${kw} shopify store online`,
    `${kw} "shopify" "add to cart"`,
    `${kw} "Refund policy" "powered by shopify"`,
    `${kw} "Privacy policy" "powered by shopify"`,
    `${kw} "Terms of service" "powered by shopify"`,
    `${kw} "About us" "powered by shopify"`,
    `${kw} "Contact us" "powered by shopify"`,
  ];
  tier2.forEach(d => allDorks.push({ q: d, gl: 'us' }));

  // ---- TIER 3: Multi-region (same top queries, different countries) ----
  const countries = ['gb', 'de', 'fr', 'tr', 'au', 'ca', 'nl', 'in', 'jp', 'br'];
  const topQueries = [
    `${kw} "powered by shopify"`,
    `${kw} site:myshopify.com`,
    `buy ${kw} shopify`,
  ];
  for (const gl of countries) {
    for (const q of topQueries) {
      allDorks.push({ q, gl });
    }
  }

  // ---- TIER 4: Variants ----
  if (!kwl.endsWith('s')) {
    allDorks.push({ q: `${kw}s "powered by shopify"`, gl: 'us' });
    allDorks.push({ q: `${kw}s site:myshopify.com`, gl: 'us' });
  } else {
    allDorks.push({ q: `${kwl.slice(0,-1)} "powered by shopify"`, gl: 'us' });
  }
  if (!kwl.startsWith('e-') && !kwl.startsWith('e ')) {
    allDorks.push({ q: `e-${kw} "powered by shopify"`, gl: 'us' });
    allDorks.push({ q: `e-${kw} site:myshopify.com`, gl: 'us' });
    allDorks.push({ q: `e${kw} shopify`, gl: 'us' });
  }

  // ---- TIER 5: Year-based, desperation ----
  const tier5 = [
    `${kw} "© 2025" "powered by shopify"`,
    `${kw} "© 2024" "powered by shopify"`,
    `${kw} "© 2026" "powered by shopify"`,
    `${kw} "fast shipping" "powered by shopify"`,
    `${kw} "limited edition" "powered by shopify"`,
    `${kw} organic "powered by shopify"`,
    `${kw} eco "powered by shopify"`,
    `${kw} luxury "powered by shopify"`,
    `${kw} handmade "powered by shopify"`,
    `${kw} natural "powered by shopify"`,
    `${kw} "powered by shopify" USA`,
    `${kw} "powered by shopify" UK`,
    `${kw} "powered by shopify" Europe`,
    `${kw} "powered by shopify" global`,
    `${kw} "powered by shopify" international`,
  ];
  tier5.forEach(d => allDorks.push({ q: d, gl: 'us' }));

  // Deduplicate dorks
  const seen = new Set();
  const uniqueDorks = allDorks.filter(d => {
    const key = `${d.q}|${d.gl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const total = uniqueDorks.length;
  console.log(`🔍 Total dorks to run: ${total}`);

  // Run SEQUENTIALLY with small delay to avoid rate limits
  for (let i = 0; i < uniqueDorks.length; i++) {
    const { q, gl } = uniqueDorks[i];
    const results = await searchSerper(q, apiKey, gl);
    collect(results, allResults);

    if (onProgress) {
      onProgress({ phase: 'searching', completed: i + 1, total, found: allResults.size });
    }

    // 250ms delay between requests — safe for rate limits
    await sleep(250);

    // Early exit if we have plenty of candidates
    if (allResults.size >= 60 && i > total * 0.5) {
      console.log(`✅ Early exit: ${allResults.size} candidates found at dork ${i+1}/${total}`);
      break;
    }
  }

  console.log(`📋 Final: ${allResults.size} unique candidates from ${total} dorks`);
  return Array.from(allResults.values());
}

module.exports = { searchAllDorks };
