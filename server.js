require('dotenv').config();
const express    = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session    = require('express-session');
const path       = require('path');
const { ClerkExpressWithAuth, clerkClient } = require('@clerk/clerk-sdk-node');
const { readUsers, readTransactions, writeUsers, writeTransactions } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ===== MIDDLEWARE =====
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'pixelpeak-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use(ClerkExpressWithAuth());

// ===== HELPERS =====
function generatePXLCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'PXL-';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const FAKE_PLAYERS = [
  'Steve_Pro','AlexBuilder','DiamondKing','CreeperHunter','EndSlayer',
  'NetherWalker','CraftMaster','ZombieSlayer','PixelFarmer','SkyWatcher',
  'BlockBreaker','RedstoneGuru','EnderDragon99','IronGolem22','CaveExplorer'
];
function getFakePlayers() {
  const count = Math.floor(Math.random() * 7) + 2;
  return [...FAKE_PLAYERS].sort(() => 0.5 - Math.random()).slice(0, count);
}

// ===== AUTH HELPERS =====
async function getOrCreateLocalUser(clerkId) {
  if (!clerkId) return null;
  try {
    const users = readUsers();
    let user = users.find(u => u.clerk_id === clerkId);
    if (user) return user;

    const clerkUser = await clerkClient.users.getUser(clerkId);
    const email = clerkUser.emailAddresses?.[0]?.emailAddress || '';
    const name  = `${clerkUser.firstName||''} ${clerkUser.lastName||''}`.trim() || email.split('@')[0];
    const adminEmail = process.env.ADMIN_EMAIL || '';
    const role  = email === adminEmail ? 'admin' : 'member';

    const newUser = {
      id: 'user-' + Date.now(),
      clerk_id: clerkId,
      name, email, role,
      minecraft_username: '',
      created_at: new Date().toISOString()
    };
    users.push(newUser);
    writeUsers(users);
    return newUser;
  } catch (err) {
    console.error('getOrCreateLocalUser:', err.message);
    return null;
  }
}

async function requireLogin(req, res, next) {
  const clerkId = req.auth?.userId;
  if (!clerkId) return res.redirect('/sign-in');
  req.localUser = await getOrCreateLocalUser(clerkId);
  if (!req.localUser) return res.redirect('/sign-in');
  next();
}

async function requireAdmin(req, res, next) {
  const clerkId = req.auth?.userId;
  if (!clerkId) return res.redirect('/sign-in');
  req.localUser = await getOrCreateLocalUser(clerkId);
  if (!req.localUser || req.localUser.role !== 'admin') return res.redirect('/');
  next();
}

async function loadUser(req) {
  const clerkId = req.auth?.userId;
  if (!clerkId) return null;
  return getOrCreateLocalUser(clerkId);
}

// ===== ROUTES =====

app.get('/', async (req, res) => {
  const user = await loadUser(req);
  res.send(renderPage('home', { user, players: getFakePlayers() }));
});

app.get('/store', async (req, res) => {
  const user = await loadUser(req);
  res.send(renderPage('store', { user }));
});

app.get('/vote', async (req, res) => {
  const user = await loadUser(req);
  res.send(renderPage('vote', { user }));
});

app.get('/contact', async (req, res) => {
  const user = await loadUser(req);
  res.send(renderPage('contact', { user }));
});

app.get('/sign-in', (req, res) => {
  if (req.auth?.userId) return res.redirect('/dashboard');
  res.send(renderClerkAuthPage('login'));
});

app.get('/sign-up', (req, res) => {
  if (req.auth?.userId) return res.redirect('/dashboard');
  res.send(renderClerkAuthPage('register'));
});

app.get('/onboarding', requireLogin, (req, res) => {
  if (req.localUser.minecraft_username) return res.redirect('/dashboard');
  res.send(renderPage('onboarding', { user: req.localUser }));
});

app.post('/onboarding', requireLogin, (req, res) => {
  const { minecraft_username } = req.body;
  if (!minecraft_username) return res.redirect('/onboarding');
  const users = readUsers();
  const idx = users.findIndex(u => u.id === req.localUser.id);
  if (idx !== -1) { users[idx].minecraft_username = minecraft_username; writeUsers(users); }
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  const pk = process.env.CLERK_PUBLISHABLE_KEY || '';
  res.send(`<!DOCTYPE html><html><head>
    <script src="https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js"></script>
    <script>
      window.addEventListener('load', async () => {
        await window.Clerk.load({ publishableKey: '${pk}' });
        await window.Clerk.signOut();
        window.location.href = '/';
      });
    </script>
    </head><body style="background:#0d1117;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">
    <p>Logging out...</p></body></html>`);
});

app.get('/dashboard', requireLogin, (req, res) => {
  if (!req.localUser.minecraft_username) return res.redirect('/onboarding');
  const transactions = readTransactions().filter(t => t.user_id === req.localUser.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.send(renderPage('dashboard', { user: req.localUser, transactions }));
});

app.post('/purchase', requireLogin, (req, res) => {
  if (!req.localUser.minecraft_username) return res.redirect('/onboarding');
  const { item_name, item_type, price } = req.body;
  const u = req.localUser;
  const txId = generatePXLCode();
  const transactions = readTransactions();
  transactions.push({
    id: txId,
    user_id: u.id,
    user_name: u.name,
    user_email: u.email,
    minecraft_username: u.minecraft_username,
    item_name, item_type,
    price: parseInt(price),
    status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  writeTransactions(transactions);
  res.redirect('/dashboard?purchased=' + txId);
});

// ADMIN
app.get('/admin', requireAdmin, (req, res) => {
  const transactions = readTransactions().sort((a,b) => new Date(b.created_at)-new Date(a.created_at));
  const users = readUsers().filter(u => u.role !== 'admin');
  res.send(renderPage('admin', { user: req.localUser, transactions, users, filter: 'all' }));
});

app.get('/admin/filter/:type', requireAdmin, (req, res) => {
  const filter = req.params.type;
  let transactions = readTransactions().sort((a,b) => new Date(b.created_at)-new Date(a.created_at));
  if (filter !== 'all') transactions = transactions.filter(t => t.item_type === filter);
  const users = readUsers().filter(u => u.role !== 'admin');
  res.send(renderPage('admin', { user: req.localUser, transactions, users, filter }));
});

app.post('/admin/update-status', requireAdmin, (req, res) => {
  const { tx_id, status } = req.body;
  const transactions = readTransactions();
  const idx = transactions.findIndex(t => t.id === tx_id);
  if (idx !== -1) { transactions[idx].status = status; transactions[idx].updated_at = new Date().toISOString(); }
  writeTransactions(transactions);
  res.redirect('/admin');
});

app.get('/api/players', (req, res) => res.json({ players: getFakePlayers(), max: 20 }));

// ===== START =====
app.listen(PORT, () => console.log(`🎮 PixelPeak SMP → http://localhost:${PORT}`));

// ===========================
// ===== HTML RENDERER =====
// ===========================
const CLERK_PK = () => process.env.CLERK_PUBLISHABLE_KEY || '';

function clerkScript() {
  return `
<script src="https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js" crossorigin="anonymous"></script>
<script>
(async () => {
  const pk = "${CLERK_PK()}";
  if (!pk || !window.Clerk) return;
  await window.Clerk.load({ publishableKey: pk });
})();
</script>`;
}

function renderPage(page, data = {}) {
  const { user } = data;
  let content = '';
  if      (page === 'home')       content = renderHome(data);
  else if (page === 'store')      content = renderStore(data);
  else if (page === 'vote')       content = renderVote(data);
  else if (page === 'contact')    content = renderContact(data);
  else if (page === 'dashboard')  content = renderDashboard(data);
  else if (page === 'admin')      content = renderAdminPage(data);
  else if (page === 'onboarding') content = renderOnboarding(data);

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>PixelPeak SMP</title>
<link rel="stylesheet" href="/css/style.css">
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet">
</head>
<body>
${renderNav(user)}
${content}
<script src="/js/main.js"></script>
${clerkScript()}
</body>
</html>`;
}

function renderClerkAuthPage(type) {
  const isLogin = type === 'login';
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${isLogin?'Login':'Daftar'} — PixelPeak SMP</title>
<link rel="stylesheet" href="/css/style.css">
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=swap" rel="stylesheet">
</head>
<body>
<section class="auth-section">
  <div class="auth-box">
    <img src="/images/logo.png" alt="PixelPeak" class="auth-logo">
    <div id="clerk-component" style="min-height:200px;display:flex;align-items:center;justify-content:center">
      <p style="color:#8b9ab0">Memuat...</p>
    </div>
    <p class="auth-switch" style="margin-top:16px">
      ${isLogin ? 'Belum punya akun? <a href="/sign-up">Daftar</a>' : 'Sudah punya akun? <a href="/sign-in">Login</a>'}
    </p>
  </div>
</section>
<script src="https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js" crossorigin="anonymous"></script>
<script>
(async () => {
  const pk = "${CLERK_PK()}";
  if (!pk) {
    document.getElementById('clerk-component').innerHTML =
      '<p style="color:#ff4757;font-size:13px">⚠️ CLERK_PUBLISHABLE_KEY belum diset di Railway Variables.</p>';
    return;
  }
  await window.Clerk.load({ publishableKey: pk });
  const el = document.getElementById('clerk-component');
  el.innerHTML = '';
  ${isLogin
    ? `window.Clerk.mountSignIn(el, { afterSignInUrl: '/dashboard', signUpUrl: '/sign-up' });`
    : `window.Clerk.mountSignUp(el, { afterSignUpUrl: '/onboarding', signInUrl: '/sign-in' });`}
})();
</script>
</body>
</html>`;
}

function renderNav(user) {
  return `<nav class="navbar">
  <div class="nav-container">
    <a href="/" class="nav-logo"><img src="/images/logo.png" alt="PixelPeak SMP" class="logo-img"></a>
    <div class="nav-links" id="navLinks">
      <a href="/">Home</a><a href="/store">Store</a>
      <a href="/vote">Vote</a><a href="/contact">Contact</a>
      ${user
        ? `<a href="/dashboard" class="nav-user">👤 ${user.name||'Member'}</a>
           ${user.role==='admin'?'<a href="/admin" class="nav-admin">⚙️ Admin</a>':''}
           <a href="/logout" class="nav-logout">Logout</a>`
        : `<a href="/sign-in" class="btn-nav-login">Login</a>
           <a href="/sign-up" class="btn-nav-register">Daftar</a>`}
    </div>
    <button class="hamburger" onclick="toggleNav()">☰</button>
  </div>
</nav>`;
}

function renderOnboarding({ user }) {
  return `
<section class="auth-section">
  <div class="auth-box">
    <img src="/images/logo.png" alt="PixelPeak" class="auth-logo">
    <h2>Satu langkah lagi! ⚔️</h2>
    <p style="color:var(--muted);margin-bottom:24px;font-size:14px">Masukkan username Minecraft kamu untuk melanjutkan.</p>
    <form method="POST" action="/onboarding">
      <div class="form-group">
        <label>Username Minecraft</label>
        <input type="text" name="minecraft_username" class="form-input" placeholder="Username in-game kamu" required>
      </div>
      <button type="submit" class="btn-primary" style="width:100%">✅ Simpan & Lanjutkan</button>
    </form>
  </div>
</section>`;
}

function renderHome({ user, players }) {
  const onlineHTML = players.map(p=>`<span class="player-tag">🟢 ${p}</span>`).join('');
  return `
<section class="hero">
  <div class="hero-bg"></div>
  <img class="hero-mc-img" src="https://www.minecraft.net/content/dam/games/minecraft/key-art/MC_The-Wild-Update_540x300.jpg" alt="">
  <div class="hero-overlay"></div>
  <div class="hero-content">
    <img src="/images/logo.png" alt="PixelPeak SMP" class="hero-logo">
    <p class="hero-subtitle">Server Minecraft SMP Terbaik di Indonesia</p>
    <div class="server-info-cards">
      <div class="info-card"><span class="info-icon">🎮</span><div><small>Versi</small><strong>1.8 – 1.21.x</strong></div></div>
      <div class="info-card"><span class="info-icon">🌐</span><div><small>IP Server</small><strong>pixelpeak.id</strong></div></div>
      <div class="info-card"><span class="info-icon">📡</span><div><small>Bedrock Port</small><strong>19132</strong></div></div>
      <div class="info-card"><span class="info-icon">👥</span><div><small>Player Register</small><strong id="onlineCount">${players.length}/20</strong></div></div>
    </div>
    <div class="hero-buttons">
      <a href="/store" class="btn-primary">▶ Play Now</a>
      <a href="https://discord.gg/pixelpeak" class="btn-secondary" target="_blank">↗ Join Discord</a>
    </div>
  </div>
</section>

<section class="online-players container">
  <h2 class="section-title">⚔️ Player Online Sekarang</h2>
  <div class="players-box" id="playersBox">${onlineHTML}</div>
  <p class="players-note">🔄 Update otomatis setiap 30 detik</p>
</section>

<section class="about-section">
  <div class="about-mc-bg"></div>
  <div class="about-inner">
    <h2 class="about-title">What is PixelPeak?</h2>
    <p class="about-desc">PixelPeak SMP adalah server Minecraft survival terkemuka di Indonesia yang menghadirkan pengalaman bermain yang unik dan menarik untuk pemain Java dan Bedrock Edition.</p>
    <div class="about-tags">
      <span class="about-tag">Java & Bedrock</span>
      <span class="about-tag">Economy System</span>
      <span class="about-tag">Indonesia Server</span>
      <span class="about-tag">24/7 Online</span>
    </div>
  </div>
</section>

<section class="economy-section">
  <img class="economy-mc-img" src="https://www.minecraft.net/content/dam/games/minecraft/key-art/MC-Vanilla_Universe_Java-Edition_hero-art_940x788.jpg" alt="">
  <div class="economy-inner">
    <h2 class="economy-title">Server SMP Terbaik</h2>
    <p class="economy-desc">PixelPeak SMP menawarkan pengalaman survival yang seru dengan komunitas aktif, event mingguan, sistem rank, dan berbagai fitur eksklusif yang bikin kamu betah main berjam-jam.</p>
    <div class="about-tags">
      <span class="about-tag">⛏️ Survival Murni</span>
      <span class="about-tag">🏆 Event Mingguan</span>
      <span class="about-tag">🌍 Cross-Platform</span>
    </div>
  </div>
</section>

<section class="features container">
  <h2 class="section-title">✨ Kenapa PixelPeak?</h2>
  <div class="features-grid">
    <div class="feature-card">
      <div class="feature-icon">🎮</div>
      <h3>Cross-Platform</h3>
      <p>Mainkan di Java Edition atau Bedrock Edition tanpa batasan. Semua pemain dapat berinteraksi dalam satu dunia.</p>
    </div>
    <div class="feature-card">
      <div class="feature-icon">💬</div>
      <h3>Support 24/7</h3>
      <p>Tim support kami siap membantu Anda 24 jam sehari, 7 hari seminggu untuk memastikan pengalaman bermain yang optimal.</p>
    </div>
    <div class="feature-card">
      <div class="feature-icon">👥</div>
      <h3>Komunitas Aktif</h3>
      <p>Bergabung dengan ribuan pemain aktif yang siap membantu dan berinteraksi dalam komunitas Discord kami yang ramah.</p>
    </div>
    <div class="feature-card">
      <div class="feature-icon">🏆</div>
      <h3>Event & Reward</h3>
      <p>Event seru setiap minggu dengan hadiah rank dan coin eksklusif. Vote dan dapatkan reward langsung!</p>
    </div>
  </div>
</section>

<section class="cta-section">
  <div class="container">
    <h2>Siap Bergabung?</h2>
    <p>Daftarkan akunmu dan mulai petualangan di PixelPeak SMP!</p>
    ${user?`<a href="/store" class="btn-primary">🛒 Lihat Store</a>`:`<a href="/sign-up" class="btn-primary">🚀 Daftar Sekarang</a>`}
  </div>
</section>
${renderFooter()}`;
}

function renderStore({ user }) {
  const ranks = [
    { name:'STONE',   price:15000,  color:'#aaaaaa', emoji:'🪨', features:['Prefix [Stone]','Set Home ×2','Color Chat'] },
    { name:'IRON',    price:30000,  color:'#d4d4d4', emoji:'⚙️', features:['Prefix [Iron]','Set Home ×4','Color Chat','/fly di Lobby'] },
    { name:'GOLD',    price:50000,  color:'#FFD700', emoji:'✨', features:['Prefix [Gold]','Set Home ×6','Color Chat','/fly Survival','500 Coin Bonus'] },
    { name:'DIAMOND', price:100000, color:'#5de6ff', emoji:'💎', features:['Prefix [Diamond]','Set Home ×10','Semua fitur Gold','1500 Coin Bonus','Custom Tag'] },
  ];
  const coins = [
    {amount:100,price:10000,emoji:'🪙'},{amount:250,price:20000,emoji:'🪙'},
    {amount:500,price:35000,emoji:'💰'},{amount:1000,price:60000,emoji:'💎'},
  ];
  const buyBtn = (name,type,price) => user
    ? `<button class="btn-store-buy" onclick="openBuyModal('${name}','${type}',${price})">Beli Sekarang</button>`
    : `<a href="/sign-in" class="btn-store-buy">Login untuk Beli</a>`;

  const rankCards = ranks.map(r=>`
    <div class="store-card" style="--rank-color:${r.color}">
      <div class="store-card-top"><span class="store-badge rank-badge">Rank</span><span class="store-price-tag">Rp ${r.price.toLocaleString('id')}</span></div>
      <div class="store-rank-name" style="color:${r.color}">${r.emoji} ${r.name}</div>
      <ul class="store-features">${r.features.map(f=>`<li>✔ ${f}</li>`).join('')}</ul>
      ${buyBtn(r.name+' Rank','rank',r.price)}
    </div>`).join('');

  const coinCards = coins.map(c=>`
    <div class="store-card coin-card">
      <div class="store-card-top"><span class="store-badge coin-badge">Coin</span><span class="store-price-tag">Rp ${c.price.toLocaleString('id')}</span></div>
      <div class="coin-amount">${c.emoji}</div>
      <div class="coin-label-big">${c.amount} Coin</div>
      ${buyBtn(c.amount+' Coin','coin',c.price)}
    </div>`).join('');

  return `
<section class="page-hero"><h1>🛒 Server Store</h1><p>Beli Rank dan Coin untuk meningkatkan pengalaman bermainmu</p></section>
<div class="store-tabs container">
  <button class="tab-btn active" onclick="switchTab('rank',this)">⚔️ Rank</button>
  <button class="tab-btn" onclick="switchTab('coin',this)">🪙 Coin</button>
</div>
<section class="store-grid container" id="rankTab">${rankCards}</section>
<section class="store-grid container" id="coinTab" style="display:none">${coinCards}</section>
<div id="buyModal" class="modal" style="display:none">
  <div class="modal-box">
    <div class="modal-icon">🛒</div>
    <h2>Konfirmasi Pembelian</h2>
    <p>Kamu akan membeli <strong id="modalItem"></strong></p>
    <p>Harga: <strong id="modalPrice" style="color:var(--accent)"></strong></p>
    <div class="modal-note">⚠️ Setelah submit, kirim kode PXL ke admin Discord untuk diproses.</div>
    <form method="POST" action="/purchase" id="buyForm">
      <input type="hidden" name="item_name" id="formItemName">
      <input type="hidden" name="item_type" id="formItemType">
      <input type="hidden" name="price" id="formPrice">
      <button type="submit" class="btn-primary" style="width:100%;margin-bottom:10px">✅ Buat Transaksi</button>
    </form>
    <button class="btn-secondary" onclick="closeModal()" style="width:100%">Batal</button>
  </div>
</div>
${renderFooter()}`;
}

function renderVote({ user }) {
  return `
<section class="page-hero"><h1>🗳️ Vote untuk PixelPeak</h1><p>Setiap vote = <strong style="color:var(--accent2)">50 Coin gratis</strong>!</p></section>
<section class="container vote-section">
  <div class="vote-info-cards">
    <div class="vote-info"><span>👍</span><h3>Voting Mudah</h3><p>Satu klik, konfirmasi instan</p><small>Cepat & Sederhana</small></div>
    <div class="vote-info"><span>🪙</span><h3>Reward 50 Coin</h3><p>50 coin gratis setiap vote</p><small>Setiap 24 Jam</small></div>
    <div class="vote-info"><span>🏆</span><h3>Manfaat Server</h3><p>Ranking tinggi = lebih banyak pemain</p><small>Menang-Menang</small></div>
  </div>
  <h2 class="section-title" style="margin-top:48px">Platform Vote</h2>
  <div class="vote-cards">
    <div class="vote-card"><div class="vote-platform">MinecraftMP <a href="https://minecraft-mp.com" target="_blank">↗</a></div><p>Situs daftar server Minecraft teratas</p><a href="https://minecraft-mp.com" target="_blank" class="btn-vote">Vote Now</a></div>
    <div class="vote-card"><div class="vote-platform">PlayMinecraft <a href="https://playminecraft.net" target="_blank">↗</a></div><p>Direktori server yang didorong komunitas</p><a href="https://playminecraft.net" target="_blank" class="btn-vote">Vote Now</a></div>
    <div class="vote-card"><div class="vote-platform">TopG <a href="https://topg.org" target="_blank">↗</a></div><p>Platform daftar game & server terpopuler</p><a href="https://topg.org" target="_blank" class="btn-vote">Vote Now</a></div>
  </div>
</section>
${renderFooter()}`;
}

function renderContact({ user }) {
  return `
<section class="page-hero"><h1>📬 Get in Touch</h1><p>Kami di sini untuk membantu!</p></section>
<section class="container contact-section">
  <div class="contact-form-box">
    <h2>Contact Form</h2>
    <div class="form-group"><label>Username Minecraft</label><input type="text" class="form-input" placeholder="Username kamu"></div>
    <div class="form-group"><label>Email</label><input type="email" class="form-input" placeholder="your@email.com"></div>
    <div class="form-group"><label>Subject</label><select class="form-input"><option>Pilih subject</option><option>Bug Report</option><option>Pertanyaan Rank</option><option>Masalah Transaksi</option><option>Lainnya</option></select></div>
    <div class="form-group"><label>Pesan</label><textarea class="form-input" rows="5" placeholder="Tuliskan pesanmu..."></textarea></div>
    <button class="btn-primary" style="width:100%">📤 Kirim Pesan</button>
  </div>
</section>
${renderFooter()}`;
}

function renderDashboard({ user, transactions }) {
  const fmt = n => 'Rp '+(n||0).toLocaleString('id');
  const totalSpent = transactions.filter(t=>t.status==='completed').reduce((a,t)=>a+t.price,0);
  const badge = s => {
    const m={pending:'🟡 Pending',completed:'🟢 Selesai',cancelled:'🔴 Dibatalkan'};
    return `<span class="status-badge ${s}">${m[s]||s}</span>`;
  };
  const rows = transactions.length
    ? transactions.map(t=>`<tr>
        <td><code class="tx-code">${t.id}</code></td>
        <td>${t.item_name}</td>
        <td><span class="badge ${t.item_type}">${t.item_type}</span></td>
        <td>${fmt(t.price)}</td>
        <td>${badge(t.status)}</td>
        <td>${new Date(t.created_at).toLocaleDateString('id-ID')}</td>
      </tr>`).join('')
    : `<tr><td colspan="6" class="table-empty">Belum ada transaksi — <a href="/store">Belanja sekarang</a></td></tr>`;

  return `
<section class="dashboard-section container">
  <div class="dashboard-header">
    <div class="dashboard-avatar">
      <div class="avatar-circle">${(user.name||'?')[0].toUpperCase()}</div>
      <div><h2>Halo, ${user.name||'Player'}! 👋</h2>
      <p>⚔️ ${user.minecraft_username||'-'} &nbsp;·&nbsp; ${user.email}</p></div>
    </div>
    <a href="/store" class="btn-primary">🛒 Beli Item</a>
  </div>
  <div class="dashboard-stats">
    <div class="stat-card"><h3>${transactions.length}</h3><p>Total Order</p></div>
    <div class="stat-card"><h3>${transactions.filter(t=>t.status==='completed').length}</h3><p>Selesai</p></div>
    <div class="stat-card"><h3>${transactions.filter(t=>t.status==='pending').length}</h3><p>Menunggu</p></div>
    <div class="stat-card"><h3 style="font-size:15px">${fmt(totalSpent)}</h3><p>Total Belanja</p></div>
  </div>
  <div class="section-label">📋 History Transaksi</div>
  <div class="table-wrapper">
    <table class="tx-table">
      <thead><tr><th>Kode PXL</th><th>Item</th><th>Tipe</th><th>Harga</th><th>Status</th><th>Tanggal</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div class="info-box">
    <strong>💡 Cara Konfirmasi Pembayaran</strong>
    <p>Setelah transfer, kirim kode PXL ke admin via Discord: <a href="https://discord.gg/pixelpeak" target="_blank" style="color:var(--accent)">discord.gg/pixelpeak</a></p>
  </div>
</section>
${renderFooter()}`;
}

function renderAdminPage({ user, transactions, users, filter }) {
  const fmt = n => 'Rp '+(n||0).toLocaleString('id');
  const badge = s => {
    const m={pending:'🟡 Pending',completed:'🟢 Selesai',cancelled:'🔴 Dibatalkan'};
    return `<span class="status-badge ${s}">${m[s]||s}</span>`;
  };
  const filters = ['all','rank','coin'];
  const fBtns = filters.map(f=>
    `<a href="/admin/filter/${f}" class="filter-btn ${filter===f?'active':''}">${f==='all'?'🔍 Semua':f==='rank'?'⚔️ Rank':'🪙 Coin'}</a>`
  ).join('');
  const txRows = transactions.length
    ? transactions.map(t=>`<tr>
        <td><code class="tx-code">${t.id}</code></td>
        <td><strong>${t.minecraft_username||'-'}</strong><br><small style="color:var(--muted)">${t.user_email}</small></td>
        <td>${t.item_name}</td>
        <td><span class="badge ${t.item_type}">${t.item_type}</span></td>
        <td>${fmt(t.price)}</td>
        <td>${badge(t.status)}</td>
        <td>${new Date(t.created_at).toLocaleDateString('id-ID')}</td>
        <td>
          <form method="POST" action="/admin/update-status" style="display:inline">
            <input type="hidden" name="tx_id" value="${t.id}">
            <select name="status" onchange="this.form.submit()" class="status-select">
              <option value="pending"   ${t.status==='pending'  ?'selected':''}>⏳ Pending</option>
              <option value="completed" ${t.status==='completed'?'selected':''}>✅ Selesai</option>
              <option value="cancelled" ${t.status==='cancelled'?'selected':''}>❌ Batal</option>
            </select>
          </form>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="8" class="table-empty">Tidak ada transaksi</td></tr>`;
  const memberRows = users.length
    ? users.map(u=>`<tr>
        <td><strong>${u.name}</strong></td><td>${u.email}</td>
        <td><code style="color:var(--accent3)">${u.minecraft_username||'-'}</code></td>
        <td>${new Date(u.created_at).toLocaleDateString('id-ID')}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" class="table-empty">Belum ada member</td></tr>`;
  const revenue = transactions.filter(t=>t.status==='completed').reduce((a,t)=>a+t.price,0);

  return `
<section class="admin-section container">
  <div class="admin-header">
    <div><h1>⚙️ Admin Panel</h1><p style="color:var(--muted);font-size:13px">PixelPeak SMP</p></div>
    <a href="/" class="btn-secondary">← Website</a>
  </div>
  <div class="dashboard-stats">
    <div class="stat-card"><h3>${transactions.length}</h3><p>Total Transaksi</p></div>
    <div class="stat-card"><h3 style="color:var(--warning)">${transactions.filter(t=>t.status==='pending').length}</h3><p>Pending</p></div>
    <div class="stat-card"><h3 style="color:var(--success)">${transactions.filter(t=>t.status==='completed').length}</h3><p>Selesai</p></div>
    <div class="stat-card"><h3 style="font-size:14px;color:var(--accent2)">${fmt(revenue)}</h3><p>Revenue</p></div>
    <div class="stat-card"><h3>${users.length}</h3><p>Total Member</p></div>
  </div>
  <div class="admin-block">
    <div class="admin-block-header"><h2>📋 Transaksi</h2><div class="filter-group">${fBtns}</div></div>
    <div class="table-wrapper">
      <table class="tx-table">
        <thead><tr><th>Kode PXL</th><th>Member</th><th>Item</th><th>Tipe</th><th>Harga</th><th>Status</th><th>Tanggal</th><th>Aksi</th></tr></thead>
        <tbody>${txRows}</tbody>
      </table>
    </div>
  </div>
  <div class="admin-block">
    <h2>👥 Daftar Member</h2>
    <div class="table-wrapper">
      <table class="tx-table">
        <thead><tr><th>Nama</th><th>Email</th><th>MC Username</th><th>Daftar</th></tr></thead>
        <tbody>${memberRows}</tbody>
      </table>
    </div>
  </div>
</section>
${renderFooter()}`;
}

function renderFooter() {
  return `
<footer class="footer">
  <div class="container">
    <img src="/images/logo.png" alt="PixelPeak" style="height:44px;margin-bottom:14px">
    <p>Server Minecraft SMP terbaik di Indonesia</p>
    <div class="footer-links">
      <a href="/store">Store</a><a href="/vote">Vote</a>
      <a href="/contact">Contact</a>
      <a href="https://discord.gg/pixelpeak" target="_blank">Discord</a>
    </div>
    <p class="footer-copy">© 2026 PixelPeak SMP. All rights reserved.</p>
  </div>
</footer>`;
}
