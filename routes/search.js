const express = require('express');
const router = express.Router();
const { searchAllDorks } = require('../src/braveSearch');
const { verifyAll } = require('../src/verifier');

// SSE search endpoint
router.get('/search', async (req, res) => {
  const keyword = (req.query.q || '').trim();
  const apiKey = req.query.key || process.env.SERPER_API_KEY || '';

  if (!keyword || keyword.length > 100) {
    return res.status(400).json({ error: 'Invalid keyword' });
  }

  if (!apiKey) {
    return res.status(400).json({ error: 'API key required. Enter your Serper.dev API key.' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const send = (event, data) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {}
  };

  try {
    send('status', { message: `🔍 "${keyword}" için arama başlıyor...`, phase: 'init' });
    send('status', { message: '🌐 Google üzerinden aranıyor...', phase: 'searching' });

    // Phase 1: Search
    const candidates = await searchAllDorks(keyword, apiKey, (p) => send('progress', p));

    send('status', {
      message: `📋 ${candidates.length} aday bulundu. Doğrulama başlıyor...`,
      phase: 'verifying',
      candidateCount: candidates.length,
    });

    if (candidates.length === 0) {
      send('complete', { stores: [], stats: { keyword, totalCandidates: 0, verified: 0 } });
      return res.end();
    }

    // Phase 2: Verify
    const verified = await verifyAll(candidates, keyword, 6, (p) => send('progress', p));

    send('status', {
      message: `✅ Tamamlandı! ${verified.length} onaylı Shopify mağazası bulundu.`,
      phase: 'done',
    });

    send('complete', {
      stores: verified,
      stats: {
        keyword,
        totalCandidates: candidates.length,
        verified: verified.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    send('error', { message: err.message });
  } finally {
    res.end();
  }
});

// Config check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: !!process.env.SERPER_API_KEY,
    timestamp: Date.now(),
  });
});

module.exports = router;
