# MEGAY PMMS — Demo Publik (GitHub Pages)

Repo ini berisi **MEGAY PMMS Build 15**, dikemas untuk deploy gratis ke GitHub
Pages sebagai versi **DEMO**. PREMIUM dan VIP hanya aktif lewat lisensi
bertanda tangan digital (ECDSA) yang kamu terbitkan dan jual sendiri — bukan
sesuatu yang bisa di-generate sendiri oleh pengunjung, karena hanya *public
key* yang ikut ter-publish, bukan *private key*-nya.

## Struktur repo

```
docs/               ← INI yang dipublish sebagai situs (GitHub Pages)
  index.html
  src/
  data/
  .nojekyll
PMMS_User_Manual.docx              ← dokumentasi, tidak ikut ter-publish
PMMS_SQLite_Migration_Guide.docx   ← dokumentasi, tidak ikut ter-publish
tools/sqlite-migration/            ← tool migrasi lokal (Node.js), tidak ikut ter-publish
```

Kenapa dipisah ke folder `docs/`? Supaya yang online cuma aplikasinya —
dokumen Word dan tool Node.js tetap ada di repo (untuk kamu/kolaborator) tapi
tidak dilayani sebagai halaman web.

## Cara deploy (5 menit)

1. Buat repo baru di GitHub (boleh public — gratis untuk akun personal/organisasi biasa).
2. Push seluruh isi folder ini ke branch `main`:
   ```bash
   git init
   git add .
   git commit -m "PMMS Build 15 — public demo"
   git branch -M main
   git remote add origin https://github.com/<username>/<repo>.git
   git push -u origin main
   ```
3. Di GitHub: **Settings → Pages** → Source: `Deploy from a branch` → Branch:
   `main` / folder **`/docs`** → Save.
4. Tunggu 1–2 menit, situs akan aktif di
   `https://<username>.github.io/<repo>/`.

Tidak ada build step, tidak ada dependency, tidak ada environment variable
yang perlu di-setup — situsnya statis murni.

## Login demo

Akun default: `admin` / `admin123` (akan diminta ganti password saat login
pertama). Data tersimpan di `localStorage` **browser masing-masing
pengunjung** — setiap orang yang buka demo ini punya "instalasi" sendiri,
tidak saling memengaruhi, dan tidak tersimpan di server manapun.

## Yang sudah disesuaikan untuk demo publik

- Tombol **"💬 Beli Lisensi via WhatsApp"** ditambahkan di halaman Settings
  dan di setiap notifikasi batas DEMO (limit aset, limit Work Order, fitur
  RCA, export laporan) — mengarah ke nomor yang kamu isi. Untuk mengganti
  nomor, edit satu baris di `docs/src/db.js`:
  ```js
  const LICENSE_CONTACT_WHATSAPP = "6281283277360";
  ```
- `.nojekyll` ditambahkan supaya GitHub Pages tidak memproses folder lewat
  Jekyll (semua file, termasuk yang berawalan non-standar, tetap dilayani
  apa adanya).
- Tidak ada private key, kredensial, atau data pelanggan sungguhan yang ikut
  di-push — aman untuk repo public.

## Batasan yang perlu kamu sadari (bukan bug)

Karena ini aplikasi client-side (jalan sepenuhnya di browser, tanpa server),
seseorang yang paham JavaScript **secara teknis bisa** membuka DevTools dan
menonaktifkan pengecekan lisensi **di sesi browser mereka sendiri secara
lokal**. Ini tidak menghasilkan lisensi sah yang bisa dipakai ulang atau
dibagikan sebagai file valid, dan tidak memengaruhi instalasi siapa pun yang
lain — sama seperti batas wajar software desktop berbasis license key pada
umumnya. Kalau ke depan kamu butuh proteksi yang lebih kuat (mis. validasi
server, akun berbayar terpusat), itu perlu arsitektur client-server — bukan
lagi murni statis di GitHub Pages.
