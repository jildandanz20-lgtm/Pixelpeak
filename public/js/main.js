// ===== PIXELPEAK SMP — main.js =====

// Mobile nav toggle
function toggleNav() {
  const nav = document.getElementById('navLinks');
  if (nav) nav.classList.toggle('open');
}

// Store tabs
function switchTab(tab, btn) {
  const rankTab = document.getElementById('rankTab');
  const coinTab = document.getElementById('coinTab');
  if (rankTab) rankTab.style.display = tab === 'rank' ? 'grid' : 'none';
  if (coinTab) coinTab.style.display = tab === 'coin' ? 'grid' : 'none';
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

// Buy modal
function openBuyModal(itemName, itemType, price) {
  document.getElementById('modalItem').textContent = itemName;
  document.getElementById('modalPrice').textContent = 'Rp ' + price.toLocaleString('id-ID');
  document.getElementById('formItemName').value = itemName;
  document.getElementById('formItemType').value = itemType;
  document.getElementById('formPrice').value = price;
  document.getElementById('buyModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  const modal = document.getElementById('buyModal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}
document.addEventListener('click', e => {
  const modal = document.getElementById('buyModal');
  if (modal && e.target === modal) closeModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

// Live online players refresh
function refreshPlayers() {
  const box = document.getElementById('playersBox');
  const countEl = document.getElementById('onlineCount');
  if (!box) return;

  fetch('/api/players')
    .then(r => r.json())
    .then(data => {
      box.innerHTML = data.players
        .map(p => `<span class="player-tag">🟢 ${p}</span>`)
        .join('');
      if (countEl) countEl.textContent = `${data.players.length}/${data.max}`;
    })
    .catch(() => {});
}

if (document.getElementById('playersBox')) {
  setInterval(refreshPlayers, 30000);
}

// Alert after purchase redirect
const urlParams = new URLSearchParams(window.location.search);
const purchasedId = urlParams.get('purchased');
if (purchasedId) {
  // Bersihkan URL tanpa reload
  window.history.replaceState({}, '', '/dashboard');

  // Tampilkan notif custom
  setTimeout(() => {
    showToast(`✅ Transaksi berhasil! Kode: <strong>${purchasedId}</strong><br>Kirim ke admin via Discord.`, 8000);
  }, 400);
}

// Toast notification
function showToast(html, duration = 5000) {
  let toast = document.getElementById('pxl-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'pxl-toast';
    toast.style.cssText = `
      position:fixed; bottom:28px; left:50%; transform:translateX(-50%);
      background:#1a2232; border:1px solid #00d4ff;
      border-radius:14px; padding:16px 24px;
      color:#e8edf5; font-family:'Nunito',sans-serif;
      font-size:14px; font-weight:700; line-height:1.6;
      box-shadow:0 8px 32px rgba(0,0,0,.5);
      z-index:99999; text-align:center;
      animation:slideUp .3s ease;
      max-width:90vw;
    `;
    const style = document.createElement('style');
    style.textContent = '@keyframes slideUp{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
    document.head.appendChild(style);
    document.body.appendChild(toast);
  }
  toast.innerHTML = html;
  toast.style.display = 'block';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => { toast.style.display = 'none'; }, duration);
}

// Scroll reveal animation
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll(
  '.feature-card, .store-card, .vote-card, .stat-card, .vote-info, .info-card'
).forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(22px)';
  el.style.transition = 'opacity .45s ease, transform .45s ease';
  observer.observe(el);
});
