const express = require('express');
const router = express.Router();
const { searchAllDorks } = require('../src/braveSearch');
const { verifyAll } = require('../src/verifier');

// SSE endpoint for real-time search progress
router.get('/search', async (req, res) => {
  const keyword = (req.query.q || '').trim();
  if (!keyword || keyword.length > 100) {
    return res.status(400).json({ error: 'Invalid keyword' });
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    send('status', { message: `🔍 Generating search dorks for "${keyword}"...`, phase: 'init' });

    // Phase 1: Search
    send('status', { message: '🌐 Searching across multiple engines...', phase: 'searching' });
    
    const candidates = await searchAllDorks(keyword, (progress) => {
      send('progress', progress);
    });

    send('status', { 
      message: `📋 Found ${candidates.length} candidates. Starting verification...`, 
      phase: 'verifying',
      candidateCount: candidates.length 
    });

    if (candidates.length === 0) {
      send('complete', { stores: [], message: 'No candidates found. Try a different keyword.' });
      return res.end();
    }

    // Phase 2: Verify
    const verified = await verifyAll(candidates, keyword, 5, (progress) => {
      send('progress', progress);
    });

    send('status', { 
      message: `✅ Verification complete! ${verified.length} confirmed Shopify stores.`, 
      phase: 'done' 
    });

    send('complete', { 
      stores: verified,
      stats: {
        keyword,
        totalCandidates: candidates.length,
        verified: verified.length,
        timestamp: new Date().toISOString(),
      }
    });

  } catch (err) {
    send('error', { message: err.message });
  } finally {
    res.end();
  }
});

// Quick health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

module.exports = router;
