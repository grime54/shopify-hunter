const axios = require('axios');
const cheerio = require('cheerio');
const pLimit = require('p-limit').default;

const TIMEOUT = 15000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * Try Shopify's hidden JSON endpoints to confirm it's Shopify
 */
async function checkShopifyJson(domain) {
  const proofs = [];
  
  // /products.json — only works on Shopify stores
  try {
    const resp = await axios.get(`https://${domain}/products.json?limit=5`, {
      timeout: 8000,
      headers: { 'User-Agent': UA },
      validateStatus: s => s < 500,
    });
    if (resp.status === 200 && resp.data?.products) {
      proofs.push('Shopify /products.json API aktif');
      return { isShopify: true, proofs, products: resp.data.products.slice(0, 5) };
    }
  } catch {}

  // /meta.json
  try {
    const resp = await axios.get(`https://${domain}/meta.json`, {
      timeout: 6000,
      headers: { 'User-Agent': UA },
      validateStatus: s => s < 500,
    });
    if (resp.status === 200 && resp.data?.name) {
      proofs.push('Shopify /meta.json API aktif');
      return { isShopify: true, proofs, products: [] };
    }
  } catch {}

  return { isShopify: false, proofs, products: [] };
}

/**
 * Verify if a URL is a real, active Shopify store
 */
async function verifySite(url, keyword) {
  const result = {
    url, domain: '', name: '', isShopify: false, isActive: false, isRelevant: false,
    shopifyProof: [], products: [], priceRange: '', notes: [], score: 0, error: null,
  };

  try {
    const parsed = new URL(url);
    result.domain = parsed.hostname.replace(/^www\./, '');

    if (/\.(pdf|zip|xml|json|txt)$/i.test(parsed.pathname)) {
      result.error = 'Not a webpage';
      return result;
    }

    // PARALLEL: Fetch page + check Shopify JSON API
    const [pageResp, jsonCheck] = await Promise.all([
      axios.get(url, {
        timeout: TIMEOUT,
        headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
        maxRedirects: 5,
        validateStatus: s => s < 400,
      }).catch(err => ({ error: err })),
      checkShopifyJson(result.domain),
    ]);

    // JSON API proofs
    if (jsonCheck.isShopify) {
      result.shopifyProof.push(...jsonCheck.proofs);
      result.isShopify = true;
    }

    // Extract products from JSON API
    const jsonProducts = jsonCheck.products.map(p => ({
      name: (p.title || 'Product').slice(0, 80),
      price: p.variants?.[0]?.price ? `$${p.variants[0].price}` : 'N/A',
      url: `https://${result.domain}/products/${p.handle || ''}`,
    }));

    if (pageResp.error) {
      // Page failed but JSON confirmed Shopify
      if (result.isShopify) {
        result.isActive = jsonProducts.length > 0;
        result.isRelevant = true; // Trust search engine relevance
        result.products = jsonProducts;
        result.name = result.domain;
        result.score = 60;
        return result;
      }
      result.error = (pageResp.error.message || 'Fetch failed').slice(0, 100);
      return result;
    }

    const html = pageResp.data;
    if (typeof html !== 'string' || html.length < 300) {
      if (result.isShopify) {
        result.isActive = jsonProducts.length > 0;
        result.isRelevant = true;
        result.products = jsonProducts;
        result.name = result.domain;
        result.score = 55;
        return result;
      }
      result.error = 'Invalid response';
      return result;
    }

    const $ = cheerio.load(html);
    const bodyLower = html.toLowerCase();

    // ===== SHOPIFY DETECTION =====
    let shopifyScore = result.isShopify ? 5 : 0; // Bonus from JSON check

    if (/powered by shopify/i.test($('footer').text() || '')) {
      result.shopifyProof.push('Footer: "Powered by Shopify"');
      shopifyScore += 3;
    }
    if (bodyLower.includes('cdn.shopify.com')) {
      result.shopifyProof.push('Shopify CDN (cdn.shopify.com)');
      shopifyScore += 3;
    }
    const canonical = $('link[rel="canonical"]').attr('href') || '';
    if (canonical.includes('myshopify.com')) {
      result.shopifyProof.push('Canonical: myshopify.com');
      shopifyScore += 3;
    }
    if (result.domain.includes('myshopify.com')) {
      result.shopifyProof.push('Domain: myshopify.com');
      shopifyScore += 3;
    }
    if (bodyLower.includes('shopify.com/s/') || bodyLower.includes('/shopify_common/')) {
      result.shopifyProof.push('Shopify scripts');
      shopifyScore += 2;
    }
    if (bodyLower.includes('/checkouts/') || bodyLower.includes('checkout.shopify.com')) {
      result.shopifyProof.push('Shopify checkout URL');
      shopifyScore += 2;
    }
    if (/shopify/i.test($('meta[name="generator"]').attr('content') || '')) {
      result.shopifyProof.push('Meta generator: Shopify');
      shopifyScore += 2;
    }
    // Shopify Liquid / theme indicators
    if (bodyLower.includes('shopify.theme') || bodyLower.includes('shopify.routes') || bodyLower.includes('shopify.locale')) {
      result.shopifyProof.push('Shopify Liquid/Theme JS');
      shopifyScore += 2;
    }
    // Response headers
    const headers = pageResp.headers || {};
    if (headers['x-shopify-stage'] || headers['x-shopid'] || headers['x-shardid'] ||
        headers['x-sorting-hat-shopid'] || headers['x-storefront-renderer-rendered']) {
      result.shopifyProof.push('Shopify HTTP headers');
      shopifyScore += 3;
    }
    // Shopify Pay / Shop Pay
    if (bodyLower.includes('shop-pay') || bodyLower.includes('shopify-payment') || bodyLower.includes('shopifypay')) {
      result.shopifyProof.push('Shop Pay detected');
      shopifyScore += 2;
    }

    result.isShopify = shopifyScore >= 3;

    // ===== ACTIVE STORE =====
    const hasAddToCart = /add.to.cart|addtocart|buy.now|buy.it.now|add-to-cart|AddToCart/i.test(bodyLower);
    const priceMatches = html.match(/[\$€£]\s?[\d,.]+|[\d,.]+\s?(?:USD|EUR|GBP|CAD|AUD)/g) || [];
    const hasPrices = priceMatches.length > 0;
    const isComingSoon = /coming soon|under construction|launching soon|stay tuned|maintenance mode/i.test(bodyLower);

    result.isActive = (hasAddToCart || hasPrices || jsonProducts.length > 0) && !isComingSoon;

    if (isComingSoon) result.notes.push('⚠️ Coming soon');
    if (hasAddToCart) result.notes.push('✅ Sepete ekle');
    if (hasPrices) result.notes.push(`✅ ${priceMatches.length} fiyat`);

    // ===== RELEVANCE =====
    const kwLower = keyword.toLowerCase();
    const kwWords = kwLower.split(/\s+/).filter(w => w.length > 1);
    const title = ($('title').text() || '').toLowerCase();
    const metaDesc = ($('meta[name="description"]').attr('content') || '').toLowerCase();
    const h1 = $('h1').text().toLowerCase();
    const ogTitle = ($('meta[property="og:title"]').attr('content') || '').toLowerCase();
    const ogDesc = ($('meta[property="og:description"]').attr('content') || '').toLowerCase();
    const allMeta = `${title} ${metaDesc} ${h1} ${ogTitle} ${ogDesc}`;
    const bodySlice = bodyLower.slice(0, 80000);

    const inMeta = kwWords.some(w => allMeta.includes(w));
    const inBody = kwWords.some(w => bodySlice.includes(w));
    
    // Also check JSON products for relevance
    const jsonRelevant = jsonProducts.some(p => 
      kwWords.some(w => p.name.toLowerCase().includes(w))
    );

    result.isRelevant = inMeta || inBody || jsonRelevant;

    // ===== PRODUCTS =====
    let products = [...jsonProducts];

    if (products.length === 0) {
      // Try JSON-LD
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const data = JSON.parse($(el).html());
          const items = data['@type'] === 'Product' ? [data] :
            (data['@graph'] || []).filter(i => i['@type'] === 'Product');
          for (const item of items.slice(0, 5)) {
            const price = item.offers?.price || item.offers?.lowPrice || (item.offers?.offers?.[0]?.price) || '';
            const currency = item.offers?.priceCurrency || 'USD';
            products.push({
              name: (item.name || 'Product').slice(0, 80),
              price: price ? `${currency} ${price}` : 'N/A',
              url: item.url || '',
            });
          }
        } catch {}
      });
    }

    if (products.length === 0) {
      const seen = new Set();
      $('a[href*="/products/"]').each((_, el) => {
        if (products.length >= 5) return false;
        const href = $(el).attr('href') || '';
        const name = $(el).text().replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        if (name && name.length > 3 && name.length < 120 && !seen.has(name)) {
          seen.add(name);
          const fullUrl = href.startsWith('http') ? href : `https://${result.domain}${href}`;
          products.push({ name: name.slice(0, 80), price: 'Siteye bak', url: fullUrl });
        }
      });
    }

    result.products = products.slice(0, 5);

    // Price range
    if (priceMatches.length > 0) {
      const prices = priceMatches.map(p => parseFloat(p.replace(/[^0-9.]/g, ''))).filter(p => p > 0 && p < 50000);
      if (prices.length > 0) {
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        result.priceRange = min === max ? `$${min}` : `$${min} – $${max}`;
      }
    }

    // Store name
    result.name = $('meta[property="og:site_name"]').attr('content') ||
      $('title').text().split(/[|\-–—]/)[0].trim() || result.domain;
    result.name = result.name.slice(0, 60);

    // ===== SCORE =====
    result.score = 0;
    if (result.isShopify) result.score += 35;
    if (result.isActive) result.score += 25;
    if (result.isRelevant) result.score += 20;
    if (result.products.length > 0) result.score += 10;
    if (result.shopifyProof.length >= 3) result.score += 5;
    if (hasPrices && priceMatches.length >= 3) result.score += 5;

  } catch (err) {
    result.error = (err.message || 'Unknown').slice(0, 100);
  }

  return result;
}

/**
 * Verify all with concurrency
 */
async function verifyAll(sites, keyword, concurrency = 8, onProgress) {
  const limit = pLimit(concurrency);
  let completed = 0;

  const results = await Promise.all(
    sites.map(site =>
      limit(async () => {
        const r = await verifySite(site.url, keyword);
        completed++;
        if (onProgress) onProgress({ phase: 'verifying', completed, total: sites.length, current: site.url });
        return r;
      })
    )
  );

  // Must be Shopify + relevant. Active OR has products (relaxed for digital goods stores)
  return results
    .filter(r => r.isShopify && r.isRelevant && !r.error)
    .sort((a, b) => b.score - a.score);
}

module.exports = { verifySite, verifyAll };
