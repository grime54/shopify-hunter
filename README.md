# 🎯 Shopify Hunter X-3000

AI-Powered Shopify Store Discovery Engine

## Kurulum

### 1. Gereksinimler
- **Node.js** 18+ (https://nodejs.org)
- **Brave Search API Key** (ücretsiz: https://brave.com/search/api/)

### 2. Projeyi İndir
```bash
git clone <repo-url> shopify-hunter
cd shopify-hunter
```

Veya dosyaları zip olarak indir ve klasöre çıkart.

### 3. Bağımlılıkları Kur
```bash
npm install
```

### 4. API Key Ayarla
```bash
cp .env.example .env
```

`.env` dosyasını aç ve Brave API key'ini ekle:
```
PORT=3000
BRAVE_SEARCH_API_KEY=BSA_xxxxxxxxxxxxxxxxxxxxxxxx
```

**Brave API Key Alma:**
1. https://brave.com/search/api/ adresine git
2. "Get Started" tıkla → ücretsiz hesap aç
3. Dashboard'dan API key'ini kopyala

### 5. Çalıştır
```bash
npm start
```

Tarayıcıda aç: **http://localhost:3000**

### 6. Geliştirme Modu (auto-reload)
```bash
npm run dev
```

## Kullanım

1. Arama kutusuna bir kelime yaz (örn: "esim", "coffee", "sneakers")
2. "Avla" butonuna tıkla
3. Uygulama otomatik olarak:
   - 25+ farklı arama dorku üretir
   - Her birini Brave Search ile çalıştırır
   - Bulunan siteleri tek tek ziyaret eder
   - Shopify altyapısını doğrular
   - Aktif ürün/fiyat kontrolü yapar
   - Sonuçları kalite skoruna göre sıralar
4. CSV veya JSON olarak dışa aktar

## Sunucuya Deploy

### Railway / Render / Fly.io
```bash
# Environment variable olarak ekle:
BRAVE_SEARCH_API_KEY=BSA_xxxx
PORT=3000
```

### VPS (PM2 ile)
```bash
npm install -g pm2
pm2 start server.js --name shopify-hunter
pm2 save
pm2 startup
```

## Mimari

```
shopify-hunter/
├── server.js              # Express sunucu
├── routes/search.js       # SSE arama endpoint'i
├── src/
│   ├── braveSearch.js     # Brave API + dork üretici
│   └── verifier.js        # Site doğrulama motoru
├── public/
│   ├── index.html         # Ana sayfa
│   ├── css/style.css      # Premium UI
│   └── js/app.js          # Frontend mantığı
├── .env                   # Ayarlar (git'e ekleme!)
└── package.json
```
