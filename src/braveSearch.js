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
  'nytimes.com','bbc.com','cnn.com',
]);

/**
 * STEP 1: Discover related keywords via Serper autocomplete + related searches
 */
async function discoverRelatedTerms(keyword, apiKey) {
  const related = new Set();
  related.add(keyword);

  try {
    // Serper autocomplete
    const autoResp = await axios.post('https://google.serper.dev/autocomplete', 
      { q: keyword }, {
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      timeout: 8000,
    });
    for (const s of (autoResp.data?.suggestions || [])) {
      const val = (s.value || s).toLowerCase();
      if (val.includes('shopif') || val.includes('buy') || val.includes('shop') || 
          val.includes('store') || val.includes('card') || val.includes('gift') ||
          val.includes('code') || val.includes('cheap') || val.includes('online')) {
        related.add(val);
      }
    }
  } catch {}

  try {
    // Get related searches from a basic query
    const resp = await axios.post(SERPER_URL, { q: `${keyword} buy online`, num: 10 }, {
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    for (const r of (resp.data?.relatedSearches || [])) {
      const q = (r.query || '').toLowerCase();
      if (q && q.length < 60) related.add(q);
    }
  } catch {}

  // Auto-generate common variations
  const kw = keyword.toLowerCase();
  const autoVariations = [
    `${kw} gift card`,
    `${kw} code`,
    `${kw} card`,
    `buy ${kw}`,
    `cheap ${kw}`,
    `${kw} online`,
    `${kw} digital`,
    `${kw} instant`,
    `${kw} top up`,
  ];
  for (const v of autoVariations) related.add(v);

  // e-prefix
  if (!kw.startsWith('e-')) related.add(`e-${kw}`);
  // plural
  if (!kw.endsWith('s')) related.add(`${kw}s`);

  return [...related].slice(0, 15); // Max 15 variations
}

/**
 * STEP 2: Generate dorks for ALL keyword variations
 */
function generateDorks(keywords) {
  const dorks = [];
  const templates = [
    (kw) => `${kw} powered by shopify`,
    (kw) => `buy ${kw} powered by shopify`,
    (kw) => `best ${kw} powered by shopify`,
    (kw) => `${kw} shop powered by shopify`,
    (kw) => `${kw} store powered by shopify`,
    (kw) => `${kw} shopify store`,
    (kw) => `${kw} shopify online store`,
    (kw) => `${kw} cdn.shopify.com`,
    (kw) => `${kw} myshopify.com`,
    (kw) => `${kw} checkout shopify`,
    (kw) => `${kw} free shipping powered by shopify`,
    (kw) => `${kw} sale powered by shopify`,
    (kw) => `${kw} add to cart powered by shopify`,
    (kw) => `cheap ${kw} powered by shopify`,
    (kw) => `${kw} discount powered by shopify`,
    (kw) => `${kw} /products/ shopify`,
    (kw) => `${kw} /collections/ shopify`,
    (kw) => `${kw} official store shopify`,
  ];

  // Primary keyword gets ALL templates
  const primary = keywords[0];
  for (const t of templates) {
    dorks.push(t(primary));
  }

  // Regional variants for primary
  const regions = ['USA', 'UK', 'Europe', 'global', 'Canada', 'Australia', 'international'];
  for (const r of regions) {
    dorks.push(`${primary} powered by shopify ${r}`);
  }

  // Secondary keywords get top 6 templates
  const topTemplates = templates.slice(0, 6);
  for (const kw of keywords.slice(1)) {
    for (const t of topTemplates) {
      dorks.push(t(kw));
    }
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
    // Silent on 400s (expected for some queries)
    if (err.response?.status !== 400) {
      console.error(`Serper [${err.response?.status || err.message}]: "${query.slice(0, 50)}"`);
    }
    return [];
  }
}

/**
 * Main search pipeline
 */
async function searchAllDorks(keyword, apiKey, onProgress) {
  const allResults = new Map();
  let completed = 0;

  // PHASE 0: Discover related terms
  if (onProgress) onProgress({ phase: 'searching', completed: 0, total: 100, found: 0, msg: '🧠 İlgili terimler keşfediliyor...' });
  const keywords = await discoverRelatedTerms(keyword, apiKey);
  console.log(`Keywords discovered: ${keywords.join(', ')}`);

  // PHASE 1: Generate and run dorks
  const dorks = generateDorks(keywords);
  console.log(`Generated ${dorks.length} dorks`);

  // Multi-region for top 5 dorks
  const multiRegionDorks = dorks.slice(0, 5);
  const extraRegions = ['gb', 'de', 'tr', 'au', 'ca', 'fr', 'nl', 'in'];
  const regionQueries = [];
  for (const d of multiRegionDorks) {
    for (const gl of extraRegions) {
      regionQueries.push({ q: d, gl });
    }
  }

  const totalAll = dorks.length + regionQueries.length;
  const batchSize = 3;

  // Run main dorks
  for (let i = 0; i < dorks.length; i += batchSize) {
    const batch = dorks.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(d => searchSerper(d, apiKey, 'us')));
    for (const r of results) collect(r, allResults);
    completed += batch.length;
    if (onProgress) onProgress({ phase: 'searching', completed, total: totalAll, found: allResults.size });
    if (i + batchSize < dorks.length) await sleep(100);
  }

  // Run multi-region
  for (let i = 0; i < regionQueries.length; i += batchSize) {
    const batch = regionQueries.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(rq => searchSerper(rq.q, apiKey, rq.gl)));
    for (const r of results) collect(r, allResults);
    completed += batch.length;
    if (onProgress) onProgress({ phase: 'searching', completed, total: totalAll, found: allResults.size });
    if (i + batchSize < regionQueries.length) await sleep(100);
  }

  console.log(`Total unique candidates: ${allResults.size}`);
  return Array.from(allResults.values());
}

function collect(results, map) {
  for (const r of results) {
    try {
      const host = new URL(r.url).hostname.replace(/^www\./, '');
      if (BLACKLIST.has(host)) continue;
      if (host.includes('shopify.com') && !host.includes('myshopify.com')) continue;
      if (!map.has(host)) map.set(host, r);
    } catch {}
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { generateDorks, searchAllDorks, discoverRelatedTerms };
