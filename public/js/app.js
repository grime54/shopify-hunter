// ===== Shopify Hunter X-3000 — Frontend =====

class ShopifyHunter {
  constructor() {
    this.stores = [];
    this.keyword = '';
    this.init();
  }

  init() {
    // Elements
    this.searchForm = document.getElementById('searchForm');
    this.searchInput = document.getElementById('searchInput');
    this.searchBtn = document.getElementById('searchBtn');
    this.searchSection = document.getElementById('searchSection');
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

    // Events
    this.searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.startSearch();
    });

    // Tag clicks
    document.querySelectorAll('.tag').forEach(tag => {
      tag.addEventListener('click', () => {
        this.searchInput.value = tag.dataset.keyword;
        this.startSearch();
      });
    });

    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());

    // Export buttons
    document.getElementById('exportCsvBtn').addEventListener('click', () => this.exportCSV());
    document.getElementById('exportJsonBtn').addEventListener('click', () => this.exportJSON());
    document.getElementById('newSearchBtn').addEventListener('click', () => this.resetSearch());

    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    this.updateThemeIcon(savedTheme);
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    this.updateThemeIcon(next);
  }

  updateThemeIcon(theme) {
    const icon = document.querySelector('.theme-icon');
    icon.textContent = theme === 'dark' ? '🌙' : '☀️';
  }

  async startSearch() {
    const keyword = this.searchInput.value.trim();
    if (!keyword) return;

    this.keyword = keyword;
    this.stores = [];

    // UI transitions
    this.searchBtn.classList.add('loading');
    this.progressSection.classList.remove('hidden');
    this.resultsSection.classList.add('hidden');
    this.progressLog.innerHTML = '';
    this.progressBar.style.width = '0%';
    this.statSearched.textContent = '0';
    this.statFound.textContent = '0';
    this.statVerified.textContent = '0';

    // Smooth scroll to progress
    this.progressSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    this.addLog(`🚀 "${keyword}" için arama başlatılıyor...`);

    try {
      const eventSource = new EventSource(`/api/search?q=${encodeURIComponent(keyword)}`);

      eventSource.addEventListener('status', (e) => {
        const data = JSON.parse(e.data);
        this.progressTitle.textContent = data.phase === 'searching' ? '🌐 Aranıyor...' :
          data.phase === 'verifying' ? '🔍 Doğrulanıyor...' :
          data.phase === 'done' ? '✅ Tamamlandı!' : '⏳ Hazırlanıyor...';
        this.progressMessage.textContent = data.message;
        this.addLog(data.message);
      });

      eventSource.addEventListener('progress', (e) => {
        const data = JSON.parse(e.data);
        if (data.phase === 'searching') {
          const pct = Math.round((data.completed / data.total) * 50);
          this.progressBar.style.width = pct + '%';
          this.statSearched.textContent = data.completed;
          this.statFound.textContent = data.found;
        } else if (data.phase === 'verifying') {
          const pct = 50 + Math.round((data.completed / data.total) * 50);
          this.progressBar.style.width = pct + '%';
          this.statVerified.textContent = data.completed;
          if (data.current) {
            this.addLog(`🔎 Kontrol: ${this.truncate(data.current, 60)}`);
          }
        }
      });

      eventSource.addEventListener('complete', (e) => {
        const data = JSON.parse(e.data);
        this.stores = data.stores || [];
        this.progressBar.style.width = '100%';
        this.statVerified.textContent = this.stores.length;

        this.addLog(`🏁 Tamamlandı! ${this.stores.length} doğrulanmış mağaza bulundu.`);

        this.searchBtn.classList.remove('loading');
        this.renderResults();
        eventSource.close();
      });

      eventSource.addEventListener('error', (e) => {
        try {
          const data = JSON.parse(e.data);
          this.addLog(`❌ Hata: ${data.message}`);
        } catch {
          this.addLog('❌ Bağlantı hatası.');
        }
        this.searchBtn.classList.remove('loading');
        eventSource.close();
      });

      // Browser EventSource error fallback
      eventSource.onerror = () => {
        this.searchBtn.classList.remove('loading');
        if (this.stores.length === 0) {
          this.addLog('⚠️ Bağlantı kesildi. Sonuçlar yükleniyor...');
        }
        eventSource.close();
        if (this.stores.length > 0) {
          this.renderResults();
        }
      };

    } catch (err) {
      this.addLog(`❌ Hata: ${err.message}`);
      this.searchBtn.classList.remove('loading');
    }
  }

  renderResults() {
    this.resultsSection.classList.remove('hidden');
    this.resultsSummary.textContent = 
      `"${this.keyword}" için ${this.stores.length} doğrulanmış Shopify mağazası bulundu`;

    if (this.stores.length === 0) {
      this.resultsGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1">
          <div class="empty-icon">😔</div>
          <h3>Mağaza bulunamadı</h3>
          <p>Farklı bir anahtar kelime deneyin</p>
        </div>`;
      return;
    }

    this.resultsGrid.innerHTML = this.stores.map((store, i) => this.renderCard(store, i)).join('');
    
    // Animate cards sequentially
    const cards = this.resultsGrid.querySelectorAll('.store-card');
    cards.forEach((card, i) => {
      card.style.animationDelay = `${i * 0.05}s`;
    });

    this.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  renderCard(store, index) {
    const scoreClass = store.score >= 80 ? 'score-high' : store.score >= 60 ? 'score-medium' : 'score-low';
    const scoreLabel = store.score >= 80 ? '🟢 Yüksek' : store.score >= 60 ? '🟡 Orta' : '🔴 Düşük';

    const proofs = store.shopifyProof.map(p => `<li>${this.escapeHtml(p)}</li>`).join('');

    const products = store.products.slice(0, 3).map(p => `
      <div class="product-item">
        <span class="product-name">
          ${p.url ? `<a href="${this.escapeHtml(p.url)}" target="_blank" rel="noopener">${this.escapeHtml(this.truncate(p.name, 40))}</a>` 
            : this.escapeHtml(this.truncate(p.name, 40))}
        </span>
        <span class="product-price">${this.escapeHtml(p.price)}</span>
      </div>
    `).join('');

    const notes = store.notes.map(n => `<span class="note-badge">${this.escapeHtml(n)}</span>`).join('');

    return `
      <div class="store-card">
        <div class="card-rank">${index + 1}</div>
        <div class="card-header">
          <div class="store-name">
            <a href="${this.escapeHtml(store.url)}" target="_blank" rel="noopener">
              ${this.escapeHtml(store.name || store.domain)}
            </a>
          </div>
          <div class="store-domain">${this.escapeHtml(store.domain)}</div>
          <div class="store-score ${scoreClass}">${scoreLabel} — Skor: ${store.score}/100</div>
        </div>

        <div class="proof-section">
          <div class="proof-title">🛒 Shopify Kanıtı</div>
          <ul class="proof-list">${proofs}</ul>
        </div>

        ${products ? `
        <div class="products-section">
          <div class="products-title">📦 Ürünler</div>
          ${products}
        </div>` : ''}

        ${store.priceRange ? `
        <div class="card-notes">
          <span class="note-badge price-badge">💰 ${this.escapeHtml(store.priceRange)}</span>
          ${notes}
        </div>` : (notes ? `<div class="card-notes">${notes}</div>` : '')}
      </div>`;
  }

  addLog(message) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    this.progressLog.appendChild(entry);
    this.progressLog.scrollTop = this.progressLog.scrollHeight;
  }

  resetSearch() {
    this.stores = [];
    this.keyword = '';
    this.searchInput.value = '';
    this.resultsSection.classList.add('hidden');
    this.progressSection.classList.add('hidden');
    this.searchSection.scrollIntoView({ behavior: 'smooth' });
    this.searchInput.focus();
  }

  exportCSV() {
    if (!this.stores.length) return;
    const header = 'Rank,Name,Domain,URL,Score,Price Range,Shopify Proofs,Products\n';
    const rows = this.stores.map((s, i) => {
      const proofs = s.shopifyProof.join(' | ');
      const products = s.products.map(p => `${p.name} (${p.price})`).join(' | ');
      return `${i+1},"${s.name}","${s.domain}","${s.url}",${s.score},"${s.priceRange}","${proofs}","${products}"`;
    }).join('\n');
    this.download(`shopify-hunter-${this.keyword}.csv`, header + rows, 'text/csv');
  }

  exportJSON() {
    if (!this.stores.length) return;
    const data = {
      keyword: this.keyword,
      timestamp: new Date().toISOString(),
      count: this.stores.length,
      stores: this.stores,
    };
    this.download(`shopify-hunter-${this.keyword}.json`, JSON.stringify(data, null, 2), 'application/json');
  }

  download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.substring(0, max) + '...' : str;
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  window.app = new ShopifyHunter();
});
