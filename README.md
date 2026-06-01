# 🎮 PixelPeak SMP — Website

Website resmi server Minecraft PixelPeak SMP.
Stack: **Node.js + Express + PostgreSQL** — siap deploy ke Railway.

---

## 📁 Struktur Project

```
pixelpeak/
├── server.js          ← Main server, routes, HTML renderer
├── db.js              ← Koneksi PostgreSQL & inisialisasi tabel
├── package.json
├── Procfile           ← Untuk Railway
├── .env.example       ← Template environment variables
├── .gitignore
└── public/
    ├── css/style.css
    ├── js/main.js
    └── images/
        └── logo.png
```

---

## 🚀 Deploy ke Railway (Step by Step)

### 1. Push ke GitHub
```bash
git init
git add .
git commit -m "init: PixelPeak SMP"
git remote add origin https://github.com/username/pixelpeak-smp.git
git push -u origin main
```

### 2. Buat project di Railway
1. Buka [railway.app](https://railway.app) → **New Project**
2. Pilih **Deploy from GitHub repo** → pilih repo kamu
3. Railway auto-detect Node.js → klik **Deploy**

### 3. Tambah PostgreSQL
1. Di dashboard Railway → klik **+ New** → **Database** → **PostgreSQL**
2. Setelah database terbuat, klik database → tab **Variables**
3. Copy nilai `DATABASE_URL`

### 4. Set Environment Variables
Di Railway project → tab **Variables**, tambahkan:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | (otomatis dari Railway Postgres, atau paste manual) |
| `SESSION_SECRET` | string random panjang, contoh: `px2026!sMp#sEcReT$kEy@rAnDoM` |

> ✅ `PORT` sudah otomatis diset Railway, tidak perlu ditambah manual.

### 5. Done!
Railway akan auto-deploy. Tabel database dibuat otomatis saat server pertama kali jalan.

---

## 💻 Local Development

```bash
# 1. Clone repo
git clone https://github.com/username/pixelpeak-smp.git
cd pixelpeak-smp

# 2. Install dependencies
npm install

# 3. Setup env
cp .env.example .env
# Edit .env → isi DATABASE_URL dengan koneksi PostgreSQL lokal kamu

# 4. Jalankan
npm run dev    # pakai nodemon (auto-restart)
# atau
npm start

# Buka: http://localhost:3000
```

---

## 🔐 Akun Default

| Role  | Email | Password |
|-------|-------|----------|
| Admin | admin@pixelpeak.id | admin123 |

> ⚠️ **Ganti password admin** setelah deploy pertama!
> Caranya: login sebagai admin, atau edit langsung di PostgreSQL.

---

## ✨ Fitur Lengkap

### Halaman Publik
- **Home** — Hero dengan logo float, server info cards, live player online, fitur server
- **Store** — Tab Rank (Stone/Iron/Gold/Diamond) & Coin bundle dengan modal konfirmasi
- **Vote** — Link ke MinecraftMP, PlayMinecraft, TopG. Reward 50 Coin/vote
- **Contact** — Form kontak

### Auth System
- Register & Login berbasis session (disimpan di PostgreSQL)
- Role: `member` dan `admin`

### Member Dashboard `/dashboard`
- Profil + statistik (total order, selesai, pending, total belanja)
- History transaksi lengkap dengan kode **PXL-XXXXXXXX**
- Toast notifikasi setelah beli
- Instruksi konfirmasi pembayaran via Discord

### Store + Pembelian
- Modal konfirmasi sebelum submit
- Kode transaksi otomatis format `PXL-XXXXXXXX`
- Status awal: `pending`

### Admin Panel `/admin`
- Statistik: total transaksi, pending, selesai, revenue, total member
- Tabel transaksi: kode PXL, nickname, email, item, tipe, harga, status, tanggal
- **Filter**: Semua / Rank / Coin
- **Update status** inline via dropdown (pending → selesai / batal)
- Daftar semua member

### Live Player Online
- Tampil di Home, auto-refresh 30 detik
- Saat ini menggunakan simulasi — lihat bagian integrasi di bawah

---

## 🔧 Integrasi Minecraft Server (Live Player Count)

Untuk data player online yang real dari server Minecraft kamu:

```bash
npm install minecraft-server-util
```

Ganti fungsi `getFakePlayers()` di `server.js`:

```js
const { queryFull } = require('minecraft-server-util');

async function getRealPlayers() {
  try {
    const res = await queryFull('pixelpeak.id', 25565, { timeout: 3000 });
    return res.players.list || [];
  } catch {
    return ['Server sedang offline...'];
  }
}
```

---

## 🎨 Kustomisasi Cepat

| Yang ingin diubah | Lokasi di server.js |
|---|---|
| IP Server | Cari `pixelpeak.id` |
| Bedrock Port | Cari `19132` |
| Link Discord | Cari `discord.gg/pixelpeak` |
| Harga & nama rank | Array `ranks` di fungsi `renderStore()` |
| Harga & jumlah coin | Array `coins` di fungsi `renderStore()` |
| Warna tema | CSS variables di `:root` di `style.css` |

---

## 🛡️ Security Notes untuk Production

1. Gunakan password yang kuat untuk akun admin
2. Set `SESSION_SECRET` dengan string random minimal 32 karakter
3. Aktifkan HTTPS (Railway sudah otomatis HTTPS ✅)
4. Untuk password hashing, tambahkan `bcryptjs` dan hash password saat register/login
