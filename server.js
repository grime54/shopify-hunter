const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// Load .env manually (no dotenv dependency needed)
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
} catch {}

const searchRoutes = require('./routes/search');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors());
app.use(express.json());

app.use('/api/', rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests, please slow down.' }
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', searchRoutes);

app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  const hasKey = !!process.env.SERPER_API_KEY;
  console.log(`🎯 Shopify Hunter X-3000 running on http://localhost:${PORT}`);
  console.log(`🔑 Serper API Key: ${hasKey ? '✅ Loaded' : '❌ Missing — set in .env or enter in UI'}`);
});
