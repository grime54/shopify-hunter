const axios = require('axios');
const cheerio = require('cheerio');
const pLimit = require('p-limit').default;

const TIMEOUT = 12000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * Verify if a URL is a real, active Shopify store selling relevant products
 */
async function verifySite(url, keyword) {
  const result = {
    url,
    domain: '',
    name: '',
    isShopify: false,
    isActive: false,
    isRelevant: false,
    shopifyProof: [],
    products: [],
    priceRange: '',
    notes: [],
    score: 0,
    error: null,
  };

  try {
    const parsedUrl = new URL(url);
    result.domain = parsedUrl.hostname.replace('www.', '');

    // Fetch the page
    const resp = await axios.get(url, {
      timeout: TIMEOUT,
      headers: { 'User-Agent': USER_AGENT },
      maxRedirects: 5,
      validateStatus: s => s < 400,
    });

    const html = resp.data;
    if (typeof html !== 'string') {
      result.error = 'Non-HTML response';
      return result;
    }

    const $ = cheerio.load(html);

    // === SHOPIFY DETECTION ===
    const bodyHtml = html.toLowerCase();
    
    // Check footer for "Powered by Shopify"
    const footerText = $('footer').text() || '';
    if (/powered by shopify/i.test(footerText)) {
      result.shopifyProof.push('Footer: "Powered by Shopify"');
    }

    // Check for Shopify CDN
    if (bodyHtml.includes('cdn.shopify.com')) {
      result.shopifyProof.push('Shopify CDN detected (cdn.shopify.com)');
    }

    // Check for Shopify scripts
    if (bodyHtml.includes('shopify.com/s/') || bodyHtml.includes('/shopify_common/')) {
      result.shopifyProof.push('Shopify scripts detected');
    }

    // Check meta tags
    const generator = $('meta[name="generator"]').attr('content') || '';
    if (/shopify/i.test(generator)) {
      result.shopifyProof.push(`Meta generator: "${generator}"`);
    }

    // Check for myshopify.com in canonical/links
    const canonical = $('link[rel="canonical"]').attr('href') || '';
    if (canonical.includes('myshopify.com')) {
      result.shopifyProof.push(`Canonical: myshopify.com domain`);
    }

    // Check for Shopify checkout links
    if (bodyHtml.includes('/checkouts/') || bodyHtml.includes('checkout.shopify.com')) {
      result.shopifyProof.push('Shopify checkout URL detected');
    }

    // Check X-Shopify headers
    const shopifyHeader = resp.headers['x-shopify-stage'] || resp.headers['x-shopify-shop-api-call-limit'];
    if (shopifyHeader) {
      result.shopifyProof.push('Shopify HTTP headers detected');
    }

    // Minimum 2 proofs for confidence
    result.isShopify = result.shopifyProof.length >= 2;

    // === ACTIVE STORE DETECTION ===
    // Check for add to cart buttons
    const hasAddToCart = bodyHtml.includes('add to cart') || bodyHtml.includes('add-to-cart') ||
      bodyHtml.includes('addtocart') || bodyHtml.includes('buy now') || bodyHtml.includes('buy it now');
    
    // Check for prices
    const priceMatches = html.match(/\$[\d,.]+|\€[\d,.]+|£[\d,.]+|USD\s*[\d,.]+/g) || [];
    const hasPrices = priceMatches.length > 0;

    // Check it's not "coming soon" or under construction
    const isComingSoon = /coming soon|under construction|launching soon|stay tuned/i.test(bodyHtml);
    
    result.isActive = (hasAddToCart || hasPrices) && !isComingSoon;

    if (isComingSoon) result.notes.push('⚠️ Coming soon page');
    if (hasAddToCart) result.notes.push('✅ Add to cart button found');
    if (hasPrices) result.notes.push(`✅ Prices found (${priceMatches.length} price tags)`);

    // === RELEVANCE CHECK ===
    const kwLower = keyword.toLowerCase();
    const kwWords = kwLower.split(/\s+/);
    const title = $('title').text().toLowerCase();
    const metaDesc = ($('meta[name="description"]').attr('content') || '').toLowerCase();
    const h1Text = $('h1').text().toLowerCase();
    
    // Check relevance in key areas
    const inTitle = kwWords.some(w => title.includes(w));
    const inMeta = kwWords.some(w => metaDesc.includes(w));
    const inH1 = kwWords.some(w => h1Text.includes(w));
    const inBody = kwWords.some(w => bodyHtml.includes(w));
    
    const relevanceScore = (inTitle ? 3 : 0) + (inH1 ? 3 : 0) + (inMeta ? 2 : 0) + (inBody ? 1 : 0);
    result.isRelevant = relevanceScore >= 2;

    // === EXTRACT PRODUCTS ===
    const products = [];
    
    // Try structured data (JSON-LD)
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html());
        const items = data['@type'] === 'Product' ? [data] :
          (data['@graph'] || []).filter(i => i['@type'] === 'Product');
        
        for (const item of items.slice(0, 5)) {
          const price = item.offers?.price || item.offers?.lowPrice || 
            (item.offers?.offers?.[0]?.price) || '';
          const currency = item.offers?.priceCurrency || 'USD';
          products.push({
            name: item.name || 'Unknown',
            price: price ? `${currency} ${price}` : 'N/A',
            url: item.url || item['@id'] || '',
          });
        }
      } catch {}
    });

    // Fallback: scrape product cards
    if (products.length === 0) {
      $('[class*="product"]').find('a[href*="/products/"]').each((i, el) => {
        if (products.length >= 5) return false;
        const name = $(el).text().trim() || $(el).attr('title') || '';
        const href = $(el).attr('href') || '';
        if (name && name.length > 2 && name.length < 200) {
          const fullUrl = href.startsWith('http') ? href : `https://${result.domain}${href}`;
          products.push({ name, price: 'See site', url: fullUrl });
        }
      });
    }

    result.products = products.slice(0, 5);

    // Price range
    if (priceMatches.length > 0) {
      const prices = priceMatches.map(p => parseFloat(p.replace(/[^0-9.]/g, ''))).filter(p => p > 0 && p < 100000);
      if (prices.length > 0) {
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        result.priceRange = min === max ? `$${min}` : `$${min} - $${max}`;
      }
    }

    // === STORE NAME ===
    result.name = $('meta[property="og:site_name"]').attr('content') ||
      $('title').text().split(/[|\-–—]/).pop().trim() ||
      result.domain;

    // === QUALITY SCORE ===
    result.score = 0;
    if (result.isShopify) result.score += 30;
    if (result.isActive) result.score += 25;
    if (result.isRelevant) result.score += 25;
    if (result.products.length > 0) result.score += 10;
    if (result.shopifyProof.length >= 3) result.score += 5;
    if (priceMatches.length >= 3) result.score += 5;

  } catch (err) {
    result.error = err.message?.substring(0, 100) || 'Unknown error';
  }

  return result;
}

/**
 * Verify multiple sites in parallel with concurrency limit
 */
async function verifyAll(sites, keyword, concurrency = 5, onProgress) {
  const limit = pLimit(concurrency);
  let completed = 0;
  const total = sites.length;

  const results = await Promise.all(
    sites.map(site =>
      limit(async () => {
        const result = await verifySite(site.url, keyword);
        completed++;
        if (onProgress) {
          onProgress({ phase: 'verifying', completed, total, current: site.url });
        }
        return result;
      })
    )
  );

  // Filter to only valid Shopify stores, sorted by score
  return results
    .filter(r => r.isShopify && r.isActive && r.isRelevant && !r.error)
    .sort((a, b) => b.score - a.score);
}

module.exports = { verifySite, verifyAll };
