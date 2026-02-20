class ShopifyHunter {
  constructor() {
    this.stores = [];
    this.keyword = '';
    this.apiKey = localStorage.getItem('serper_key') || '';
    this.init();
  }

  init() {
    this.searchForm = document.getElementById('searchForm');
    this.searchInput = document.getElementById('searchInput');
    this.searchBtn = document.getElementById('searchBtn');
    this.progressSection = document.getElementById('progressSection');
    this.resultsSection = document.getElementById('resultsSection');
    this.progressBar = document.getElementById('progressBar');
    this.progressTitle = document.getElementById('progressTitle');
    this.progressMessage = document.getElementById('progressMessage');
    this.progressLog = document.getElementById('progressLog');
    this.resultsGrid = document.getElementById('resultsGrid');
    this.resultsSummary = document.getElementById('resultsSummary');
    this.statSearched = document.getElementById('statSearched');
    this.statFound = document.getElementById('statFound');
    this.statVerified = document.getElementById('statVerified');
    this.apiKeyInput = document.getElementById('apiKeyInput');
    this.apiStatus = document.getElementById('apiStatus');

    // Load saved key
    if (this.apiKey) {
      this.apiKeyInput.value = this.apiKey;
      this.apiStatus.textContent = '✅ Kayıtlı';
      this.apiStatus.style.color = '#00b894';
    }

    // Events
    this.searchForm.addEventListener('submit', (e) => { e.preventDefault(); this.startSearch(); });
    
    document.querySelectorAll('.tag').forEach(tag => {
      tag.addEventListener('click', () => { this.searchInput.value = tag.dataset.keyword; this.startSearch(); });
    });

    document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
    document.getElementById('saveKeyBtn').addEventListener('click', () => this.saveKey());
    document.getElementById('exportCsvBtn').addEventListener('click', () => this.exportCSV());
    document.getElementById('exportJsonBtn').addEventListener('click', () => this.exportJSON());
    document.getElementById('newSearchBtn').addEventListener('click', () => this.resetSearch());

    // Enter key on API input
    this.apiKeyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.saveKey(); });

    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    this.updateThemeIcon(savedTheme);
  }

  saveKey() {
    const key = this.apiKeyInput.value.trim();
    if (!key) {
      this.apiStatus.textContent = '❌ Boş key!';
      this.apiStatus.style.color = '#e17055';
      return;
    }
    this.apiKey = key;
    localStorage.setItem('serper_key', key);
    this.apiStatus.textContent = '✅ Kaydedildi!';
    this.apiStatus.style.color = '#00b894';
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    this.updateThemeIcon(next);
  }

  updateThemeIcon(theme) {
    document.querySelector('.theme-icon').textContent = theme === 'dark' ? '🌙' : '☀️';
  }

  async startSearch() {
    const keyword = this.searchInput.value.trim();
    if (!keyword) return;

    // Check API key
    const key = this.apiKey || this.apiKeyInput.value.trim();
    if (!key) {
      this.apiStatus.textContent = '❌ Önce API key gir!';
      this.apiStatus.style.color = '#e17055';
      this.apiKeyInput.focus();
      this.apiKeyInput.classList.add('shake');
      setTimeout(() => this.apiKeyInput.classList.remove('shake'), 500);
      return;
    }
    this.apiKey = key;
    localStorage.setItem('serper_key', key);

    this.keyword = keyword;
    this.stores = [];

    // UI
    this.searchBtn.classList.add('loading');
    this.progressSection.classList.remove('hidden');
    this.resultsSection.classList.add('hidden');
    this.progressLog.innerHTML = '';
    this.progressBar.style.width = '0%';
    this.statSearched.textContent = '0';
    this.statFound.textContent = '0';
    this.statVerified.textContent = '0';

    this.progressSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.addLog(`🚀 "${keyword}" için arama başlatılıyor...`);

    try {
      const url = `/api/search?q=${encodeURIComponent(keyword)}&key=${encodeURIComponent(this.apiKey)}`;
      const eventSource = new EventSource(url);

      eventSource.addEventListener('status', (e) => {
        const data = JSON.parse(e.data);
        this.progressTitle.textContent =
          data.phase === 'searching' ? '🌐 Aranıyor...' :
          data.phase === 'verifying' ? '🔍 Doğrulanıyor...' :
          data.phase === 'done' ? '✅ Tamamlandı!' : '⏳ Hazırlanıyor...';
        this.progressMessage.textContent = data.message;
        this.addLog(data.message);
      });

      eventSource.addEventListener('progress', (e) => {
        const data = JSON.parse(e.data);
        if (data.phase === 'searching') {
          this.progressBar.style.width = Math.round((data.completed / data.total) * 50) + '%';
          this.statSearched.textContent = data.completed;
          this.statFound.textContent = data.found;
        } else if (data.phase === 'verifying') {
          this.progressBar.style.width = (50 + Math.round((data.completed / data.total) * 50)) + '%';
          this.statVerified.textContent = data.completed;
          if (data.current) this.addLog(`🔎 ${this.trunc(data.current, 55)}`);
        }
      });

      eventSource.addEventListener('complete', (e) => {
        const data = JSON.parse(e.data);
        this.stores = data.stores || [];
        this.progressBar.style.width = '100%';
        this.statVerified.textContent = this.stores.length;
        this.addLog(`🏁 ${this.stores.length} doğrulanmış mağaza bulundu!`);
        this.searchBtn.classList.remove('loading');
        this.renderResults();
        eventSource.close();
      });

      eventSource.addEventListener('error', (e) => {
        try {
          const data = JSON.parse(e.data);
          this.addLog(`❌ ${data.message}`);
        } catch {
          this.addLog('❌ Bağlantı hatası');
        }
        this.searchBtn.classList.remove('loading');
        eventSource.close();
      });

      eventSource.onerror = () => {
        this.searchBtn.classList.remove('loading');
        eventSource.close();
        if (this.stores.length > 0) this.renderResults();
      };
    } catch (err) {
      this.addLog(`❌ ${err.message}`);
      this.searchBtn.classList.remove('loading');
    }
  }

  renderResults() {
    this.resultsSection.classList.remove('hidden');
    this.resultsSummary.textContent = `"${this.keyword}" için ${this.stores.length} doğrulanmış Shopify mağazası`;

    if (!this.stores.length) {
      this.resultsGrid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon">😔</div>
          <h3>Mağaza bulunamadı</h3>
          <p>Farklı bir anahtar kelime deneyin</p>
        </div>`;
      return;
    }

    this.resultsGrid.innerHTML = this.stores.map((s, i) => this.card(s, i)).join('');
    this.resultsGrid.querySelectorAll('.store-card').forEach((c, i) => { c.style.animationDelay = `${i * 0.05}s`; });
    this.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  card(store, i) {
    const sc = store.score >= 80 ? 'score-high' : store.score >= 60 ? 'score-medium' : 'score-low';
    const sl = store.score >= 80 ? '🟢 Yüksek' : store.score >= 60 ? '🟡 Orta' : '🔴 Düşük';
    const proofs = store.shopifyProof.map(p => `<li>${this.esc(p)}</li>`).join('');
    
    const products = (store.products || []).slice(0, 3).map(p => {
      const name = (p.name || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (!name || name.length < 2) return '';
      const price = p.price || 'Siteye bak';
      const link = p.url ? `<a href="${this.esc(p.url)}" target="_blank" rel="noopener">${this.esc(name)}</a>` : this.esc(name);
      return `<div class="product-item"><span class="product-name">${link}</span><span class="product-price">${this.esc(price)}</span></div>`;
    }).filter(Boolean).join('');

    return `
      <div class="store-card">
        <div class="card-rank">${i + 1}</div>
        <div class="card-header">
          <div class="store-name">
            <a href="${this.esc(store.url)}" target="_blank" rel="noopener">${this.esc(store.name || store.domain)}</a>
          </div>
          <div class="store-domain">${this.esc(store.domain)}</div>
          <div class="store-score ${sc}">${sl} — Skor: ${store.score}/100</div>
        </div>
        <div class="proof-section">
          <div class="proof-title">🛒 Shopify Kanıtı</div>
          <ul class="proof-list">${proofs}</ul>
        </div>
        ${products ? `<div class="products-section"><div class="products-title">📦 Ürünler</div>${products}</div>` : ''}
        ${store.priceRange ? `<div class="card-notes"><span class="note-badge price-badge">💰 ${this.esc(store.priceRange)}</span></div>` : ''}
      </div>`;
  }

  addLog(msg) {
    const el = document.createElement('div');
    el.className = 'log-entry';
    el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    this.progressLog.appendChild(el);
    this.progressLog.scrollTop = this.progressLog.scrollHeight;
  }

  resetSearch() {
    this.stores = [];
    this.keyword = '';
    this.searchInput.value = '';
    this.resultsSection.classList.add('hidden');
    this.progressSection.classList.add('hidden');
    this.searchInput.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  exportCSV() {
    if (!this.stores.length) return;
    const rows = ['Rank,Name,Domain,URL,Score,Price Range,Shopify Proofs'];
    this.stores.forEach((s, i) => {
      rows.push(`${i+1},"${s.name}","${s.domain}","${s.url}",${s.score},"${s.priceRange}","${s.shopifyProof.join(' | ')}"`);
    });
    this.dl(`shopify-${this.keyword}.csv`, rows.join('\n'), 'text/csv');
  }

  exportJSON() {
    if (!this.stores.length) return;
    this.dl(`shopify-${this.keyword}.json`, JSON.stringify({ keyword: this.keyword, count: this.stores.length, stores: this.stores }, null, 2), 'application/json');
  }

  dl(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    a.click();
  }

  esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  trunc(s, n) { return (s||'').length > n ? s.slice(0, n) + '...' : s; }
}

document.addEventListener('DOMContentLoaded', () => { window.app = new ShopifyHunter(); });
