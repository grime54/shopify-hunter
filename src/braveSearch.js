const axios = require('axios');
const cheerio = require('cheerio');

const SERPER_URL = 'https://google.serper.dev/search';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// Blacklisted domains
const BLACKLIST = new Set([
  'google.com','bing.com','duckduckgo.com','youtube.com','facebook.com',
  'twitter.com','x.com','reddit.com','instagram.com','pinterest.com',
  'amazon.com','ebay.com','wikipedia.org','linkedin.com','tiktok.com',
  'shopify.com','apps.shopify.com','themes.shopify.com','community.shopify.com',
  'medium.com','quora.com','trustpilot.com','bbb.org','crunchbase.com',
  'github.com','stackoverflow.com','wordpress.com','aliexpress.com',
  'etsy.com','walmart.com','target.com','bestbuy.com',
]);

/**
 * Generate search queries for a keyword
 */
function generateDorks(keyword) {
  const kw = keyword.trim();
  const kwl = kw.toLowerCase();

  const dorks = [
    `${kw} "powered by shopify"`,
    `${kw} site:myshopify.com`,
    `${kw} "add to cart" "powered by shopify"`,
    `buy ${kw} "powered by shopify"`,
    `${kw} shopify store`,
    `${kw} shop "powered by shopify"`,
    `best ${kw} "powered by shopify"`,
    `${kw} "free shipping" "powered by shopify"`,
    `${kw} "sale" "powered by shopify"`,
    `${kw} "reviews" "powered by shopify"`,
    `${kw} online store shopify`,
    `${kw} "worldwide shipping" "powered by shopify"`,
    `shop ${kw} "powered by shopify"`,
    `${kw} premium "powered by shopify"`,
    `${kw} wholesale "powered by shopify"`,
    `${kw} "cart" "powered by shopify"`,
    `${kw} official store shopify`,
    `${kw} "track order" "powered by shopify"`,
    `${kw} bundle "powered by shopify"`,
    `${kw} subscription "powered by shopify"`,
    `cheap ${kw} "powered by shopify"`,
    `${kw} store USA "powered by shopify"`,
    `${kw} store UK "powered by shopify"`,
    `${kw} global "powered by shopify"`,
    `${kw} "powered by shopify" collection`,
  ];

  if (!kwl.startsWith('e-') && !kwl.startsWith('e ')) {
    dorks.push(`e-${kw} "powered by shopify"`);
    dorks.push(`e-${kw} site:myshopify.com`);
  }

  return [...new Set(dorks)];
}

// ===== SERPER.DEV (Google results via API) =====
async function searchSerper(query, apiKey) {
  try {
    const resp = await axios.post(SERPER_URL, { q: query, num: 30 }, {
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      timeout: 12000,
    });
    return (resp.data?.organic || []).map(r => ({
      title: r.title || '', url: r.link || '', description: r.snippet || '',
    }));
  } catch (err) {
    console.error(`Serper error [${err.response?.status || err.message}]: "${query.slice(0, 50)}"`);
    return [];
  }
}

// ===== DUCKDUCKGO HTML (free fallback) =====
async function searchDDG(query) {
  try {
    const resp = await axios.post('https://html.duckduckgo.com/html/',
      `q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 12000,
    });
    const $ = cheerio.load(resp.data);
    const results = [];
    $('.result__body').each((i, el) => {
      const a = $(el).find('.result__a');
      let href = a.attr('href') || '';
      try { if (href.includes('uddg=')) href = decodeURIComponent(href.split('uddg=')[1]?.split('&')[0] || href); } catch {}
      if (href.startsWith('http')) {
        results.push({ title: a.text().trim(), url: href, description: $(el).find('.result__snippet').text().trim() });
      }
    });
    return results;
  } catch (err) {
    console.error(`DDG error: ${err.message}`);
    return [];
  }
}

/**
 * Search using best available method
 */
async function search(query, apiKey) {
  if (apiKey) {
    const results = await searchSerper(query, apiKey);
    if (results.length > 0) return results;
  }
  // Fallback to DuckDuckGo
  return searchDDG(query);
}

/**
 * Run all dorks, collect unique store URLs
 */
async function searchAllDorks(keyword, apiKey, onProgress) {
  const dorks = generateDorks(keyword);
  const allResults = new Map();
  let completed = 0;

  const batchSize = apiKey ? 3 : 2;
  const delay = apiKey ? 200 : 1000;

  for (let i = 0; i < dorks.length; i += batchSize) {
    const batch = dorks.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(d => search(d, apiKey)));

    for (const results of batchResults) {
      for (const r of results) {
        try {
          const host = new URL(r.url).hostname.replace(/^www\./, '');
          if (BLACKLIST.has(host)) continue;
          if (!allResults.has(host)) allResults.set(host, r);
        } catch {}
      }
    }

    completed += batch.length;
    if (onProgress) {
      onProgress({ phase: 'searching', completed, total: dorks.length, found: allResults.size });
    }

    if (i + batchSize < dorks.length) await new Promise(r => setTimeout(r, delay));
  }

  return Array.from(allResults.values());
}

module.exports = { generateDorks, searchAllDorks };
