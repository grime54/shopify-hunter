require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const searchRoutes = require('./routes/search');

const app = express();
const PORT = process.env.PORT || 3000;

// Security & performance
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors());
app.use(express.json());

// Rate limiting
app.use('/api/', rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many requests, please slow down.' }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api', searchRoutes);

// SPA fallback
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🔍 Shopify Hunter X-3000 running on http://localhost:${PORT}`);
});
