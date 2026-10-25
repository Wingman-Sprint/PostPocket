# Panduan Frontend PostPocket

Untuk Kall dan agent-nya. Baca [AGENTS.md](../AGENTS.md) dulu; detail produk lengkap ada di [PRD](prd/PRD-PostPocket.md), hasil bedah referensi di [docs/reference](reference/README.md).

> [!NOTE]
> **PostPocket 1.0 rilis 16 Oktober 2026.** Label beta sudah dihapus dari aplikasi. Versi rilis ada di `apps/web/package.json` dan tampil di footer Beranda serta laporan Lapor masalah bersama commit yang di-deploy, misalnya "1.0.0 (1abb127)". Naikkan versinya di PR rilis berikutnya.

## Mulai lokal

Butuh Node 24 (lihat `.nvmrc`) dan pnpm 9.

```sh
pnpm install   # sekali per clone, sekalian mengaktifkan hook git
cp apps/web/.env.example apps/web/.env   # isi URL dan publishable key Supabase dari Bintang
pnpm dev       # http://localhost:3000
```

Frontend hanya memakai URL proyek dan **publishable key** Supabase (aman dipakai di browser). Secret key tidak pernah masuk frontend, `.env`, atau commit.

Edge Functions produksi tidak menerima origin `http://localhost:3000` (kontrak 0.2.3). Jadi untuk `pnpm dev`, aktifkan mock API di `.env` (`NUXT_MOCK_API=1` dan `NUXT_PUBLIC_API_BASE=/mock-api`), atau arahkan URL dan publishable key di `.env` ke stack Supabase lokal (`http://127.0.0.1:54321`, key dari `supabase status`), yang gateway-nya menjawab CORS dengan `*`. Kalau `.env` menunjuk ke Supabase produksi tanpa mock, halaman surat masih bisa dibuka karena SSR, tapi "Buat link" dan menandai surat dibuka gagal karena CORS. Untuk menguji backend asli, pakai tes live ke domain produksi ([Gerbang Sprint 2](#gerbang-sprint-2)). Kotak bareng hanya tampil dengan `NUXT_PUBLIC_KOTAK_BARENG=1`, jadi nyalakan bersama mock API ([Kotak bareng](#kotak-bareng)).

| Perintah | Fungsi |
| --- | --- |
| `pnpm dev` | Server development `apps/web` |
| `pnpm lint` | ESLint (warning dianggap gagal) dan Prettier, semua package |
| `pnpm typecheck` | `nuxt typecheck` (vue-tsc) dan `tsc` untuk preset |
| `pnpm test` | Unit test Vitest, semua package |
| `pnpm test:e2e` | Playwright di build production: Android (Pixel 7), iPhone (WebKit), desktop |
| `pnpm build` | Build production `apps/web` |

Pertama kali menjalankan E2E di mesin baru: `pnpm --filter @postpocket/web exec playwright install chromium webkit`.

> [!NOTE]
> TypeScript dikunci di 6.0.x karena `vue-tsc` belum bisa memakai TypeScript 7 (versi native tidak punya `lib/tsc`). Naikkan bersama `vue-tsc` kalau sudah didukung.

> [!NOTE]
> `pnpm.overrides` di `package.json` root memaksa `esbuild` 0.28 yang sudah ditambal untuk `fontless` dari `@nuxt/fonts`, alat dev. Override ini boleh dihapus begitu `fontless` memakai esbuild 0.28.1 ke atas. Override `simple-git` dan patch DevTools sudah dihapus sejak Nuxt 4.6.2, karena DevTools 3.4.3 ke atas tidak lagi memakai simple-git.

## Struktur

```text
apps/web/
  app/assets/css/main.css   design token (@theme Tailwind) dan gaya dasar
  app/components/           komponen bersama dari PRD, dipanggil tanpa prefix: <StepCard>, <PillGroup>, ...
  app/components/letter/    komponen khusus Letter: FoilCard, LetterPage, LetterEditor, FrontPicker, dll.
  app/components/tv/        TvSet, CdShelf, CdDisc, TvSlideshow, BoothCamera, BoothLayoutPreview, BoothResult
  app/components/pocket/    SnackPacket (kantong foil SVG), TearablePacket (ketuk atau gores untuk menyobek),
                            PhotoLine (foto dijepit di tali), SaveDayModal (modal simpan hari), MonthPicker
  app/components/kotak/     GlassFolder (folder kaca), LetterViewer (baca surat satu per satu), FolderMini,
                            KeepBox (Simpan semua di kotak bareng)
  app/composables/          useCardMotion (gerak kartu), useFoilMask (peta foil), usePrintArt (gambar cetak)
  app/workers/              heic.worker.ts: HEIC ke JPEG dengan libheif, dimuat hanya saat ada foto HEIC;
                            foil-map.worker.ts: peta foil Detail, Bayangan, dan Satu warna (utils/foil-map-worker.ts)
  app/stores/               useLetterDraft (draf surat), useMemories (momen, hari Pocket, album CD), dan
                            useSavedLetters (surat tersimpan di Kotak surat) di IndexedDB
  app/utils/                logika murni (card-motion, foil-map, letter-draft, memories, calendar, exif,
                            color, foil, icons, packet-art, packet-tear, photo-line) dan util browser
                            (front-image, photo-filter), diuji di test/
  app/pages/                / (Beranda), /letter/new (editor surat), /l/:slug (penerima), /tv (TV dan Booth), /pocket (kalender), /pocket/:date (isi kantong), /kotak (Kotak surat), /kotak/baru dan /kotak/:id (bikin dan kelola kotak bareng), /titip/:kode (titip surat), /k/:slug (kotak bareng untuk penerima), serta alat uji /lab, /lab/foil, /lab/safari, /lab/kirim yang hanya ada di `pnpm dev` dan build E2E (mock API), tidak di produksi
  public/illustrations/     ilustrasi depan kartu per bentuk kartu, hasil scripts/illustrations.mjs
  e2e/                      skenario Playwright
  server/routes/mock-api/   mock API surat dan kotak bareng untuk development dan E2E (NUXT_MOCK_API=1)
  test/                     unit test Vitest
packages/presets/           pilihan desain dalam JSON + tipe dan helper (byId, isAllowed, surprise, illustrationArt,
                            tata letak isi surat: templateElements, textRooms, reflowTemplate, freeSpot)
```

## Aturan frontend

- **Hanya token.** Warna, radius, font, dan bayangan diambil dari `main.css`. Warna bawaan Tailwind sengaja dimatikan, jadi `bg-red-500` tidak akan jalan; pakai `bg-ink`, `text-ink-muted`, `rounded-card`, `shadow-raised`, dan seterusnya.
- **Pilihan desain dari preset.** Kertas, foil, kantong, bingkai, dan filter dibaca dari `@postpocket/presets`. Yang disimpan di surat (dan dikirim ke backend) hanya id-nya.
- **Logika di utils.** Hitungan dan validasi masuk `app/utils` beserta unit test di `test/`. Komponen cukup menampilkan data.
- **Ilustrasi milik sendiri.** Ubah `scripts/illustrations.mjs`, lalu jalankan `node scripts/illustrations.mjs`. Aset dari web referensi tidak boleh masuk repo. Setiap desain digambar ulang untuk setiap bentuk kartu (`variants` di preset), jadi jangan menampilkan ilustrasi dengan `object-fit: cover` dari bentuk lain; ambil gambarnya lewat `illustrationArt(ilustrasi, bentuk)`.
- **Cek efek 3D di Safari sungguhan.** Screenshot Playwright WebKit tidak memakai compositing 3D, jadi `backface-visibility` terlihat rusak padahal di Safari benar. E2E kartu memeriksa state DOM; tampilannya dicek di simulator iOS atau iPhone.
- **`mask` dijalankan setelah `filter`.** Kalau elemen ber-mask butuh bayangan, taruh `drop-shadow` di pembungkusnya.
- **Foto user selalu lewat `preparePhoto()`**: diputar sesuai EXIF, diperkecil ke 2048 px, lalu disimpan ulang sebagai JPEG supaya metadata lokasi hilang (PRD bagian Privasi).
- **Draf di IndexedDB menyimpan foto sebagai byte (`ArrayBuffer`), bukan `Blob`**: Safari Private Browsing menolak Blob di IndexedDB. Foto disimpan di key terpisah supaya mengetik isi surat tidak menulis ulang foto.
- **Id momen dan album Pocket adalah UUID (`crypto.randomUUID()`)**, karena sinkron fase 2 memakai id dari browser ([Rancangan skema fase 2](backend.md#rancangan-skema-fase-2)). Data lama, dengan id `m`/`a` + 6 karakter, diganti sekali saat dimuat. Fotonya tetap di kunci lama lewat `Moment.photoKey`, jadi penggantiannya cukup satu tulisan dan aman kalau terputus. Baca dan hapus foto selalu lewat store, jangan pakai `PHOTO_PREFIX + id` langsung.
- **Isi surat hanya dirender `LetterElementView`**, di editor, kartu, maupun halaman penerima. Jangan bikin renderer kedua, supaya yang dilihat penerima sama dengan yang disusun pengirim ([keputusan](spikes/editor-isi-surat.md)).
- **Surat yang sudah dikirim dirender `ReceivedLetter`** dari bentuk `ShownLetter` (`utils/letter-view.ts`), entah datangnya dari `GET /l/:slug` atau dari Kotak surat. Jangan bikin kartu penerima kedua.
- **Ekspor foto berfilter lewat `drawFiltered()`**, jangan `ctx.filter` langsung: Safari tidak mendukung `ctx.filter` dan filternya hilang diam-diam ([hasil spike](spikes/safari.md)).

## Komponen bersama

| Komponen | Dipakai di | Catatan |
| --- | --- | --- |
| `StepCard` | Letter, Pocket | `variant="section"` (nomor lingkaran hitam, gaya Foil Studio) atau `"card"` (nomor "01", gaya Day Pocket); slot `action` untuk tombol di kanan judul |
| `PillGroup` + `PillChip` | Semua | Pilihan teks tunggal (Reka UI RadioGroup); panah kiri/kanan pindah pilihan. Pilnya setinggi 30 px, tapi bidang ketuknya 44 px, dan jarak antarbarisnya 14 px supaya bidang ketuknya tidak bertumpuk |
| `SwatchGroup` + `Swatch` | Letter, Pocket, TV | Ukuran `sm` 30 px, `md` 40 px, `lg` 48 px dengan ikon di slot; `check` untuk centang gaya Day Pocket; `--swatch-gap` mengikuti warna latar. Bidang ketuk `sm` dan `md` sampai setengah jarak ke swatch sebelahnya (40 dan 44 px) |
| `StickyCTA` | Letter, Booth | Tombol hitam selebar panel yang menempel di bawah; `loading` dan `disabled` |
| `BottomSheet` | HP | Sheet yang opsinya bisa dilipat lewat chevron; slot `peek` untuk petunjuk dan `footer` untuk CTA, yang tetap terlihat saat sheet dilipat |
| `SidePanel` | Desktop | Kolom kanan 400 px setinggi layar; slot `footer` |
| `Modal` | Pocket | Dua kolom (slot `preview` dan isi), layar penuh di HP, Esc menutup, fokus terkunci, latar `scrim` yang kabur seperti semua popup (diredupkan saja di browser tanpa GPU) |
| `IconButton` | Semua | Tombol bulat 32/40/44 px; `label` wajib |
| `PhotoFrame` | Pocket, Booth, Letter | `polaroid`, `stamp` (tepi bergerigi), `ticket`; warna teks menyesuaikan warna bingkai |
| `FoilCard` | Letter, Beranda, halaman penerima | Kartu lipat foil CSS 3D, lihat [spike](spikes/foil-3d.md) |
| `HairlineFigure` | Beranda | Figur garis Hairline yang berputar sendiri (`play`) dan menjawab pointer; di server kotak kosong 5:4 |
| `TagButton` | Beranda | Link bertag dengan siku dan efek tekan sebelum pindah halaman |
| `AppSplash` | Awal sesi (app.vue) | Logo yang terbentuk dan tanda tangan ([Splash](desain.md#splash)). Keputusan tampil atau tidaknya di `app/utils/splash.ts`; tes otomatis melewatinya lewat `navigator.webdriver`, kecuali `e2e/splash.spec.ts` |
| `CrowdLine` | Beranda | Garis ke kerumunan yang digambar saat terlihat, lalu dilewati satu kilau tinta |
| `BrandLogo` | Semua header | Logo P-amplop ([Logo](desain.md#logo)): `variant` `lockup`, `symbol`, atau `wordmark`; tinggi lewat kelas, tinta ikut `currentColor`, tutup amplop `fill-brand-gold` |

Semua komponen bisa dilihat dan dicoba di `/lab`.

## Data surat untuk API

Bahan kontrak `docs/api/openapi.yaml`: apa yang dikirim frontend saat "Buat link" dan apa yang dibutuhkan halaman penerima. Nama field final mengikuti kontrak yang ditulis Bintang. Tipe dan validasinya ada di `packages/presets/src/letter-content.ts` (`normalizeContent`, `publishableContent`, `contentPhotoKeys`).

**`design`** berisi id preset dengan bentuk `LetterDesign`: `illustration`, `shape`, `foilMode`, `foilBorder`, `foilColor`, `paper`, dan `template`. `illustration: "upload"` berarti gambar depannya foto user.

**`content`** berisi elemen kanvas halaman surat. Posisi dan ukurannya relatif terhadap halaman, jadi tampil sama di layar mana pun.

```json
{
  "version": 1,
  "elements": [
    { "kind": "photo", "id": "e1", "x": 0.5, "y": 0.32, "width": 0.7, "rotation": -3, "photo": "p1", "aspect": 1.33 },
    { "kind": "text", "id": "e2", "x": 0.5, "y": 0.72, "width": 0.8, "rotation": 0, "text": "Selamat ulang tahun!", "size": 0.07, "align": "center" },
    { "kind": "sticker", "id": "e3", "x": 0.84, "y": 0.12, "width": 0.18, "rotation": 12, "sticker": "heart" }
  ]
}
```

| Field | Elemen | Arti | Rentang |
| --- | --- | --- | --- |
| `id` | Semua | Unik per surat | 1–40 huruf, angka, `-`, atau `_` |
| `x`, `y` | Semua | Titik tengah elemen, pecahan lebar dan tinggi halaman | 0–1 |
| `width` | Semua | Lebar, pecahan lebar halaman | 0,05–1 |
| `rotation` | Semua | Derajat searah jarum jam | -180–180 |
| `text` | `text` | Tulisan tangan (Delicious Handrawn), warnanya ikut kertas | Maksimal 600 karakter per blok |
| `size` | `text` | Ukuran huruf, pecahan lebar halaman | 0,02–0,25 |
| `align` | `text` | `left`, `center`, atau `right` | |
| `photo` | `photo` | Kunci foto di daftar `photos` | Pola sama dengan `id` |
| `aspect` | `photo` | Lebar dibagi tinggi bingkai; foto di-crop menutupi bingkai | 0,2–5 |
| `sticker` | `sticker` | Id stiker dari preset | Pola sama dengan `id` |

- Urutan `elements` adalah urutan tumpukan: yang terakhir tampil paling atas.
- Maksimal 4 blok teks, 4 foto, dan 16 stiker. Satu foto hanya dipakai sekali.
- Teks tidak berisi `\u0000` karena `jsonb` Postgres menolaknya; `normalizeContent()` sudah membuangnya.
- Slot foto kosong (`"photo": null`) hanya ada di draf dan dibuang sebelum dikirim.

**Berkas yang diunggah**

| Berkas | Kapan | Format |
| --- | --- | --- |
| Cover | Kalau `design.illustration` bernilai `upload` | JPEG atau WebP, maksimal 500.000 byte, sisi panjang maksimal 2048 px |
| `photos` | Satu per kunci `photo` di `content`, maksimal 4 | Sama dengan cover |
| Gambar OG | Selalu | JPEG 1200×630, maksimal 300.000 byte. PNG dari foto bisa lebih dari 750 KB |

Untuk setiap foto, frontend mengirim `key` (khusus `photos`), `type`, `width`, `height`, dan `size`. Server mengembalikan URL upload bertanda tangan untuk tiap foto, cover, dan gambar OG. `replyTo` berisi slug surat yang dibalas lewat "Bikin balasan".

**Yang dibutuhkan halaman penerima dari `GET /l/:slug`**: `design`, `content`, URL cover, URL tiap foto per kunci, URL gambar OG, `openedAt`, `expiresAt`, dan `photosDeletedAt`. Setelah foto dihapus, URL-nya tidak dikirim lagi dan halaman menampilkan placeholder di slotnya. Kalau `og` bernilai `null` (cover dari foto user ikut dihapus), meta tag OG memakai gambar bawaan `/og-surat.jpg` dan kartu memakai sampul polos.

**CORS** diatur di bagian CORS `docs/api/openapi.yaml`. Sejak 0.2.3, `http://localhost:3000` tidak diterima di produksi, jadi `pnpm dev` memakai mock API atau stack Supabase lokal ([Mulai lokal](#mulai-lokal)).

**Region fungsi.** Semua panggilan ke fungsi Supabase membawa `?forceFunctionRegion=ap-southeast-2` (kontrak 0.2.2, `useLetterApi`), termasuk SSR halaman surat dari Vercel `sin1`. DB dan Storage ada di Sydney; tanpa query ini fungsi jalan di Singapura dan setiap query bolak-balik ke Sydney (`GET /l/:slug` median sekitar 1,0 detik, dengan query sekitar 0,55 detik). Unggahan ke `signedUrl` dan mock lokal tidak memakainya.

**Mock API.** `apps/web/server/routes/mock-api/` meniru kelima endpoint di atas dan endpoint kotak bareng (kontrak 0.3.0, `server/utils/mock-boxes.ts`) (validasi, kode error, upload ke URL bertanda tangan) dengan data di memori, supaya alur "Buat link" dan halaman penerima bisa dibangun sebelum backend siap. Body `POST /letters` diperiksa langsung dengan skema di `docs/api/openapi.yaml` (ajv, `server/utils/contract.ts`): yang tidak sesuai skema dijawab `400` beserta `details` berisi lokasi field-nya, sedangkan isi yang ditolak (preset tidak dikenal, kunci foto tidak cocok, cover, `replyTo`, batas per jenis elemen) dijawab `422`. Jadi kalau kontraknya berubah, mock ikut berubah. `test/contract.test.ts` memastikan body dari klien lolos skema, dan E2E `mock-api.spec.ts` mencocokkan setiap respons mock dengan skemanya. Nyalakan dengan `NUXT_MOCK_API=1` dan `NUXT_PUBLIC_API_BASE=/mock-api` (contohnya di `apps/web/.env.example`); E2E selalu memakainya, sedangkan build produksi tidak memuatnya sama sekali ([Keamanan](#keamanan)). `/lab/kirim` menjalankan alur kirim dari ujung ke ujung: kompres foto, render gambar OG, kirim, baca, buka, lalu hapus.

## Kartu dan isi surat

Permintaan Kall pada 16 Oktober 2026: desain harus siap pakai di bentuk apa pun, bingkai foil tidak boleh menutupi kartu, dan isi surat tidak boleh saling menimpa.

- **Komposisi per bentuk.** `scripts/illustrations.mjs` menggambar setiap desain di kanvas setinggi 1000 dengan lebar sesuai bentuknya (Asli 720, Tegak 750, Persegi 1000, Mendatar 1333), dan letak bendanya dihitung dari lebar itu. Preset menyimpan pasangan `art` dan `foil` per bentuk di `variants`; `illustrationArt()` memilihnya, dan dipakai sampul kartu (`useCardFront`), preload halaman surat, lembar di Kotak surat, dan thumbnail langkah 1. `test/illustrations.test.ts` memastikan setiap berkas ada, rasionya sama dengan bentuknya, dan lapisan foilnya tanpa `<mask>` atau `url(#…)`, supaya aman dipakai sebagai mask CSS.
- **Saran ukuran foto.** Ikon info di samping Unggah foto (`FrontPicker`) muncul saat disorot mouse dan saat diketuk di layar sentuh: ukuran dengan rasio bentuk yang dipilih dan sisi panjang 2048 px (`idealPhotoSize()`), karena `preparePhoto()` menyimpan foto sampai ukuran itu. Bentuk Asli mengikuti fotonya. Yang dibuka karena disorot tetap terbuka selama mouse di atas ikon atau keterangannya, tidak memindahkan fokus, dan selalu bisa ditutup dengan Escape.
- **Thumbnail satu baris.** Pilihan gambar depan satu baris yang bisa digeser, jadi tingginya tetap saat thumbnail melebar di bentuk Mendatar dan pilihan Bentuk di bawahnya tidak berpindah di bawah jari. Thumbnail yang dipilih selalu digeser ke dalam layar.
- **Peta foil di Web Worker.** `useFoilMask()` menghitung peta Detail, Bayangan, dan Satu warna lewat `foilMapOffThread()`. Hitungannya sekitar 100 ms di Mac M4 dan hampir 200 ms di HP kelas menengah, jadi tidak boleh membekukan layar selagi kartu bergerak. Kalau workernya tidak bisa dimuat, misalnya berkasnya belum tersimpan saat offline, peta dihitung di thread utama seperti dulu. Gambar cetak dan mask yang sudah jadi disimpan di cache per gambar, jadi kartu yang sudah disiapkan (`warmCardFront()`) langsung tampil utuh.
- **Mode Bayangan** menghitung 22% piksel tergelap dari bagian yang bergambar saja (`shadowMask()`), dan latar transparan tidak pernah jadi foil. Sebelumnya desain yang lowong seperti Ranting berubah jadi bidang foil penuh.
- **Bingkai foil** (`.foil-border` di `FoilCard`): garis tebal di luar dan garis tipis di dalam, 4 cqmin dari tepi. Bentuknya dari `clip-path: polygon(evenodd, …)` dengan empat persegi bersarang. Jangan kembali ke `mask-composite`: begitu `-webkit-mask` menimpa `mask`, Chrome menggabung kedua lapisannya dan seluruh bidang di dalam bingkai jadi foil. Gambar OG menggambar bingkai yang sama (`upload-image.ts`).
- **Ruang tulisan** (`textRooms()` di preset): setiap blok teks boleh setinggi dua kali jarak dari titik tengahnya ke penghalang terdekat, yaitu tepi halaman (3%), foto yang sejajar dengannya, atau titik tengah antara dia dan teks lain. Yang dihitung hanya isi yang ikut terkirim, jadi slot foto kosong dan teks kosong tidak membuat ruang pengirim berbeda dari penerima. `LetterElementView` mengukur tulisannya di layar dan memperkecil hurufnya sampai muat (`fittedScale()`, paling kecil 20%, cukup untuk puisi atau daftar sampai sekitar 30 baris); karena ukurannya dalam `cqw`, skala yang sama berlaku di editor, kartu, dan tampilan baca. Editor memberi tahu kalau tulisan yang dipilih diperkecil atau tetap tidak muat (juga ke pembaca layar lewat `role="status"`), dan A+ dimatikan selama tulisannya diperkecil. Foto atau teks yang sengaja ditaruh menimpa titik tengah tulisan, dan stiker, tidak membatasi ruangnya.
- **Template tanpa tumpukan.** Setelah diputar, foto di template berjarak minimal 2% halaman satu sama lain dan 3% dari tepi, dan tulisannya punya pita sendiri setinggi minimal 20% halaman. `letter-template.test.ts` memeriksanya untuk setiap template di keempat bentuk.
- **Bingkai foto mengikuti fotonya.** Foto yang masuk slot dimuat dengan `fitPhoto()` ke kotak slot templatenya (`photoBox()`), jadi tampil utuh tanpa dipotong, tidak keluar dari tempatnya, dan tidak terus mengecil saat diganti berkali-kali. Di template satu foto, foto tegak boleh 1,4 kali lebih tinggi dari kotaknya (`photoGrow()`), seperti foto dari Pocket dan Booth. Bingkai yang sudah dipindah user memakai persegi seukuran sisi terpanjangnya.
- **Ganti bentuk menyusun ulang isi.** Ukuran foto dan tulisan dihitung dari rasio halaman, jadi posisi lama tidak berlaku di halaman yang bentuknya lain. Setiap rasio kartu berubah (termasuk saat foto depan berganti di bentuk Asli), semua teks dan foto berisi disusun ke slot tata letak rasio baru, dengan rata teks dan ukuran huruf pilihan user (`reflowTemplate()`). Foto yang hanya digeser sedikit pun ikut disusun, karena kalau dibiarkan, ukurannya dari halaman lama menimpa tulisan. Stiker yang jadi menutupi isi dipindah ke tempat kosong.
- **Template yang slotnya kurang dimatikan.** Template dengan slot foto lebih sedikit dari foto yang sudah diisi tidak bisa dipilih (`templateChoices` di store, dengan keterangan di langkah 5), dan Surprise me tidak memilihnya (`surprise(…, { minPhotos })`), karena foto yang tidak kebagian slot akan menumpuk di atas isi lain.
- **Tempat elemen baru** (`freeSpot()`, kisi 5 × 7): stiker dan foto tidak menutupi tulisan, lalu sesedikit mungkin menutupi foto dan stiker lain (menumpuk di atas stiker lain dihitung dua kali). "+ Teks" tidak pernah ditaruh di atas foto; kalau perlu kotaknya dipersempit, dan berbagi ruang dengan teks lain tidak apa-apa karena keduanya diperkecil supaya tidak bertumpuk.
- **Tidak keluar halaman.** Menggeser, memutar, membesarkan, mencubit, dan tombol panah di editor menjaga seluruh elemen, setelah diputar, tetap di halaman (`keptInPage()`, `scaled(…, pageRatio)`).
- **Desain baru butuh deploy backend.** Edge Function `letters` memvalidasi `design.illustration` dengan `packages/presets/letter.json` saat di-bundle, dan CI tidak men-deploy fungsi. Jadi desain baru masuk dengan `"hidden": true`: gambarnya sudah ada dan surat yang memakainya tetap dirender, tapi belum ditawarkan di editor dan Surprise me (`offeredIllustrations()`). Setelah `letters` di-deploy ulang dari `main`, hapus `hidden`-nya. Kalau server tetap menolak, editor menampilkan pesan `invalid_design` yang menyarankan gambar depan lain. Ulang tahun dan Lebaran dibuka 16 Oktober 2026, setelah Bintang men-deploy ulang `letters` dan mengecek produksi: draf dengan `birthday` dan `lebaran` mendapat 201, id ngawur tetap 422 `invalid_design`.
- Test: `test/illustrations.test.ts`, `test/letter-gesture.test.ts`, `test/front-image.test.ts`, `packages/presets/src/letter-template.test.ts`, dan `e2e/desain-surat.spec.ts` (sampul per bentuk, desain baru, ikon info, piksel bingkai foil, tulisan panjang, ganti bentuk, ganti foto berkali-kali, dan geser keluar halaman). Screenshot Playwright WebKit tidak menggambar kartu CSS 3D, jadi bingkai foil di Safari dicek di simulator iOS lewat `/lab/foil?art=sprig&shape=landscape&border=1`.

## Beranda

Gayanya mengikuti [Hairline](https://hairline.lucasmarkes.com): tenang, bergaris tipis, dan bendanya yang bicara. Urutannya: header, surat contoh di panggung berkisi titik (ditandatangani "PostPocket"), judul dengan satu kata tulisan tangan, subjudul, pita tiga panel, Kotak surat, kerumunan, dan footer.

- **Pita tiga panel** (Surat, Pocket, Photo Booth, dari kiri ke kanan): satu pita putih bersekat, bukan tiga kartu yang sama. Tiap panel dibuka dengan figur garis (`HairlineFigure`) yang bergerak sendiri dalam putaran dan menjawab pointer atau sentuhan: kartu yang ditulis lalu dioper dalam amplop, kantong jajan yang membuka dan menyimpan foto, dan bilik foto yang berkilat lalu mengeluarkan strip. Figurnya ada di `app/utils/hairline/{surat,pocket,booth}.js`, ditulis dalam bentuk skill `hairline-create` (`npx skills add lucasmarkes/hairline`) dan dicek dengan validator skill itu sebelum dipindah ke modul. Mesinnya `app/utils/hairline/kernel.js`, disalin apa adanya dari Hairline (MIT) dengan satu baris `export { HL }`; jangan diubah, ganti figurnya saja. Palet figurnya diturunkan dari tinta di atas putih (token `--color-hairline-*`), cubit untuk memperbesar tetap jalan di atas figur (`touch-action: pan-y pinch-zoom`), dan keterangan figur (`kantong 2`, `foto 3`) ditulis ke `data-read` untuk E2E. `test/hairline-figures.test.ts` menjalankan ketiganya dengan DOM dan jam tiruan: turnya sampai di tiap pemberhentian, tidak ada NaN, putarannya berhenti setelah tenang, dan tidak ada yang tertinggal setelah dihapus.
- **Tombol bertag** (`TagButton`, dari Offer Button positronx): saat disorot atau difokus, dua tag keluar dari balik tombol dan empat siku melebar. Saat diketuk, efek itu diputar 320 ms sebelum `navigateTo`, jadi HP yang tidak bisa menyorot juga melihatnya; dengan gerakan dikurangi atau tanpa GPU, langsung pindah. Klik dengan tombol pengubah (tab baru) tetap seperti link biasa. Fokus memakai `:focus-visible` (tag dan sikunya sesudah tautan, lewat `~`), jadi fokus dari klik mouse tidak meninggalkan tombolnya dalam keadaan terbuka.
- **Kerumunan** (`CrowdStreet`, `utils/crowd.ts`): orang Open Peeps (CC0) berwarna tinta berjalan pelan di atas garis footer, selebar layar dengan pinggir memudar. Paling banyak 14 orang, tidak ada yang kembar di layar, dan gambarnya (`public/peeps/open-peeps.webp`, 178 KB, dibuat ulang dengan `node scripts/peeps.mjs`) baru dimuat saat pitanya tinggal 300 px dari layar; service worker sengaja tidak menyimpannya lebih dulu (`globIgnores`). Diam saat di luar layar, saat tab ditinggal, dan berjajar diam saat gerakan dikurangi atau tanpa GPU.
- Test: `test/hairline.test.ts` (bentuk figur), `test/crowd.test.ts`, dan `e2e/beranda.spec.ts` (figur bergerak sendiri dan menjawab pointer, efek tekan sebelum pindah halaman, kerumunan dimuat belakangan).

## Kotak surat

Surat dari link hilang 30 hari setelah dikirim dan fotonya 7 hari setelah dibuka (kontrak), jadi penerima bisa menyimpannya di perangkatnya ([PRD Modul 4](prd/PRD-PostPocket.md#modul-4-kotak-surat)). Tidak ada perubahan backend: semuanya di IndexedDB.

- **Simpan surat** (`KeepLetter` di `/l/:slug`) memanggil `useSavedLetters().keep()`. Foto depan dan foto isi diunduh dari URL publiknya, disimpan sebagai momen lewat `useMemories().addMoments()`, baru suratnya dicatat (`utils/saved-letters.ts`). Jadi surat tersimpan tidak pernah menunjuk foto yang belum ada, dan fotonya ikut sinkron Pocket kalau login menyala. Foto yang sudah dihapus server (404, atau 400 dari Storage) jadi placeholder; gangguan koneksi menghentikan proses tanpa menyimpan setengah. Data surat tersimpan ditulis lewat `update()` idb-keyval dalam satu transaksi, jadi tab atau jendela PWA lain tidak tertimpa, dan tampilan baru berubah setelah tulisannya berhasil. Kotak surat tidak punya batas jumlah surat; batasnya ruang simpan browser di HP itu. Kalau penuh (`QuotaExceededError`, `isStorageFull()` di `utils/pwa.ts`), Simpan surat dan Simpan semua bilang memori HP penuh, bukan menyalahkan browser.
- **Urutan dan link langsung.** Folder "Surat untukmu" terus bertambah seperti kotak masuk, jadi suratnya urut dari yang terbaru di kipas, daftar, dan penampil. Folder kotak bareng tetap urut titipannya. `/kotak?surat=<id>` dan `/kotak?folder=<id>` membuka folder itu (dipakai "Buka Kotak surat" setelah menyimpan), dan `&baca=1` sekalian membuka suratnya. Foldernya tampil tertutup di tempatnya dulu (satu frame tergambar), lalu terbuka seperti diketuk, dan surat dari `baca=1` tumbuh dari lembarnya setelah kipasnya hampir diam. Link `/l/:slug` yang sudah mati tapi suratnya tersimpan di HP itu menawarkan "Buka di Kotak surat", dan kartu surat yang tersimpan tetap memberi tahu "Tersimpan di Kotak surat" setelah ditutup lagi. Kotak surat juga bisa dicapai dari editor surat (di samping Surat terkirim), dari kepala halaman TV, dan dari bawah kalender Pocket.
- **Back dan kembali.** Back di HP menutup penampil, lalu folder yang terbuka (`useBackToClose`), baru meninggalkan halaman; sama di `/k/:slug`. Saat folder menutup (diketuk lagi atau Back), kacanya ditahan di tempatnya di layar: ruang kipas di atasnya mengecil, jadi halamannya digulir naik sebanyak itu (`holdAt`, sama seperti saat pindah folder). `useBackToClose` memakai `scrollRestoration` "manual" begitu ada lembar terbuka, karena dengan "auto" Chrome mengembalikan halaman ke posisi saat foldernya dibuka. Kembali ke Kotak surat lewat Back, halamannya tampil seperti saat ditinggal, tanpa animasi masuk: posisi gulir, folder yang terbuka, dan letak kacanya di layar disimpan di entri riwayatnya sendiri saat halaman ditinggal (`history.state.kotak`). Setelah folder-foldernya tampil, folder itu dipasang lagi di tempat yang sama di layar (tanpa folder: posisi gulirnya) dan ditahan sebentar (`holdAt`), karena WebKit atau isi yang tampil belakangan masih bisa menggeser halaman. Router tidak menggulirnya ke atas (`scrollToTop` di `definePageMeta`). Router sendiri baru menyimpan posisi gulir setelah beberapa kali pindah halaman, dan memulihkannya saat halamannya masih kosong. Jadi folder yang terbuka saat "Putar fotonya di TV" diketuk sudah terbuka lagi saat kembali dari TV. Ketukan ganda di kaca folder (dalam 350 ms) tidak langsung menutup lagi folder yang baru dibuka, dan ketukan keduanya (sampai 500 ms, di dekat ketukan pertama) tidak membuka surat yang baru naik ke bawah jari; ketukan di lembar lain langsung membuka suratnya.
- **Memori HP.** Di atas 90% ruang simpan browser terpakai (`navigator.storage.estimate()`), Kotak surat memberi tahu memorinya hampir penuh sebelum menyimpan surat gagal.
- **Satu CD per folder.** Foto surat di folder "Surat untukmu" masuk CD "Surat untukmu"; CD-nya dicatat di folder (`album`) dan dibuat lagi kalau sudah dihapus. Setelah tiap penyimpanan (juga yang terputus di tengah), CD-nya dicocokkan lagi dengan semua surat di folder itu. Menghapus surat atau folder dari Kotak surat tidak menghapus fotonya dari CD. `/tv?album=<id>` langsung memutar CD itu.
- **Unduh foto** (`utils/letter-photos.ts`): di iPhone dan iPad lewat lembar Bagikan (`navigator.share({ files })`), karena unduhan biasa masuk app File, bukan Foto. Di tempat lain unduhan biasa berjeda 350 ms. Fotonya diunduh lebih dulu begitu bagian Simpan tampil, karena Safari menolak lembar Bagikan kalau ketukannya sudah lama berlalu. Kalau belum selesai saat diketuk, ketukan itu memakai unduhan yang sedang berjalan, dan di iPhone ketukan berikutnya yang membuka lembar Bagikan.
- **Folder kaca** (`GlassFolder`): panggung 340 × 272 yang diskalakan ke lebar folder. Seninya dilukis di kanvas dari resep `kotak.folders` (`utils/folder-art.ts`), bertahap paling lama 6 ms per frame lewat satu antrean (`utils/folder-paint.ts`) dan disimpan per resep dan ukuran. Tanpa GPU (`data-render="cpu"`) dan dengan `prefers-reduced-transparency`, kacanya tidak dikaburkan tapi lapisan warnanya lebih pekat. Lembar yang menyembul di atas kaca bisa diketuk; bagian di balik kaca menutup folder. Nama dan tanggal di lembar ada di label putih, jadi terbaca di atas gambar depan apa pun. Saat terbuka, ruang di atas folder membesar sesuai jumlah lembar di kipas (`openRoom()`), jadi kipasnya tidak menutupi judul di atasnya; halaman yang memuat folder memakai `overflow-x-clip`, jadi kipas yang melewati tepi layar HP tidak membuat halaman bisa digeser. Folder condong hanya saat disorot mouse (`@media (hover: hover)`) atau difokus keyboard (`:focus-visible`), karena di HP `:hover` dan fokus menempel setelah diketuk. Folder `sealed` tidak bisa dibuka, memakai cap tanggal di kanan atas kaca (jadi tidak menimpa judul dan nama penerima yang panjang), dan bergoyang saat diketuk; ketukan selama bergoyang diabaikan. Judul folder paling banyak dua baris. Bagian di bawah folder yang muncul saat folder dibuka (tombol dan daftar surat) memakai `<Transition name="reveal">` (kelas `reveal` di `main.css`): tingginya ikut bergerak (0,6 s) saat folder terbuka, jadi isi halaman di bawahnya tidak melompat. Membuka folder lain saat satu folder terbuka menggulir halaman selama animasinya, supaya folder yang diketuk tetap di tempatnya. Seni folder yang dilukis ulang karena ukurannya berubah (layar diputar) tidak memudar lagi. Di kipas yang terbuka, tiap lembar di belakang menyembul paling sedikit `FAN_STACK` (48 satuan folder) di atas lembar di depannya. Jaraknya dihitung per folder: lembar yang miring ke arah lain menutup sebagian jalur lembar di belakangnya (`fanOverlap()` di `utils/folder-art.ts`, dengan acakan miring tiap lembar, paling sedikit 8 satuan supaya sudut lembar yang miring tetap cukup lebar), dan folder yang diperkecil butuh lebih banyak satuan, jadi jalur yang bisa diketuk paling sedikit 44 px di layar, juga di titik tersempitnya. Titik "belum dibuka" ada di baris label itu. Lembar dan kaca mendarat tanpa memantul (`--gf-spring`), dan ruang di atas folder beserta kacanya bergerak dengan kurva dan durasi yang sama dengan lembarnya (0,75 s), jadi lembar depan tidak turun melewati tempatnya dulu.
- **Penampil** (`LetterViewer`): kartu tumbuh dari lembar yang diketuk (`origin`), lalu Sebelumnya dan Berikutnya menggeser kartu. Kartu yang sedang keluar dibuat `inert` dan `aria-hidden`, jadi hanya satu surat yang aktif. Setiap kali penampil dibuka, kartunya mulai tertutup. Tanpa lembar asal (dibuka dari daftar, atau lembarnya di luar layar), kartunya naik dari bawah, dan selama bergerak kartunya tidak bisa diketuk. "Baca lebih besar" (`LetterReader`, z-60) menutupi penampil. Di surat pertama dan terakhir fokus keyboard pindah ke tombol arah sebaliknya, dan kalau lembar yang membuka penampil ikut terhapus, fokus kembali ke `fallbackFocus` (judul halaman Kotak surat). Aksi tambahan, misalnya Hapus di Kotak surat, ada di kepala penampil, jadi tinggi kakinya tetap. Tanpa GPU atau dengan `prefers-reduced-motion`, animasinya langsung ke keadaan akhir (`calmMotion()`, dan kelas transisi geser dimatikan di `data-render="cpu"`).
  - Kartu baru tumbuh dari lembarnya setelah FoilCard selesai mengukur kartunya, jadi ukurannya mulai dari ukuran lembar, bukan ukuran penuh.
  - Fokus awal di kartunya, bukan di tombol Hapus. Panah kiri dan kanan pindah surat (di penampil, panah tidak membalik kartu). Di HP, geser ke samping di ruang kosong di luar kartu pindah surat, dan geser ke bawah menutup penampil; di atas kartunya, geseran tetap memutar kartu.
  - Ketukan Sebelumnya atau Berikutnya selama kartu masih bergeser digabung, jadi hanya surat tujuannya yang dipasang.
  - Surat sesudah dan sebelumnya disiapkan saat browser senggang (`warmCardFront()` di `useCardFront.ts`: gambar cetak dan mask foil masuk cache, gambarnya didekode), begitu juga dua surat terdepan saat folder dibuka. Kartunya langsung tampil utuh, tidak dibangun bertahap.
  - Ditutup selagi masih memudar masuk, scrim dan penampilnya memudar keluar dari kepekatan saat itu (`--fade-from` di keyframes `fade-out`), tidak berkedip.
  - Surat yang belum sempat disiapkan langsung naik, dan mask foil yang datang terlambat memudar masuk (`foil-in` di FoilCard), tidak muncul dalam satu frame. Menunggu mask sebelum kartunya naik sudah dicoba dan dibuang: ketukan terasa lambat (sampai 640 ms di CPU 4×), padahal di HP lambat foilnya tetap telat. Panggungnya menerima cubit untuk memperbesar (`touch-action: pinch-zoom`), dan Hapus serta Tutup berukuran 44 px.

## Kotak bareng

Banyak pengirim, satu penerima ([PRD Modul 4](prd/PRD-PostPocket.md#modul-4-kotak-surat), kontrak 0.3.0, [rancangan backend](backend.md#rancangan-kotak-bareng)). Semua halamannya 404 kecuali `NUXT_PUBLIC_KOTAK_BARENG=1`. Di produksi menyala sejak 15 Oktober 2026 (env Vercel production), setelah Edge Function `boxes` dan `k` ter-deploy; E2E dan `pnpm dev` menyalakannya bersama mock API.

- **Pembuat**: `/kotak/baru` memanggil `POST /boxes`, lalu menyimpan `editToken` di IndexedDB (`utils/my-boxes.ts`) seperti surat terkirim. Kalau browser menolak menyimpannya, kedua link langsung ditampilkan di halaman itu. Hanya browser itu yang bisa membuka `/kotak/:id`, dan tokennya hanya dilupakan kalau server menjawab `box_not_found`. Halaman kelola memuat ulang saat dibuka lagi tanpa menimpa hasil aksi yang lebih baru, dan "Buka sekarang" mengirim `openNow`, jadi jam HP tidak dipakai; status terbukanya dari `openable`. Hasil aksi tampil di bagian yang tombolnya ditekan (`BoxMessage`), dan setelah kotak terbuka link titip tidak ditawarkan lagi. Selama penerima belum membukanya (`openedAt` kosong), bagian Kapan dibuka tetap ada, juga setelah kotaknya terbuka (kontrak 0.4.2): Jadwalkan ulang menyegelnya lagi dan membuka lagi titipan sampai jadwal baru, jadi jadwal yang salah tidak terkunci. Setelah penerima membukanya, bagian itu hilang, dan `409 box_closed` dari halaman yang belum dimuat ulang dijelaskan sebagai penerima yang sudah membukanya. Setelah kotaknya dihapus, Kotak surat memberi tahu kotak mana yang terhapus (`/kotak?dihapus=<judul>`). `/kotak/baru` mengingatkan bahwa kotak hanya bisa dikelola dari browser itu, apalagi kalau terbuka di browser bawaan aplikasi lain.
- **Teman yang menitip**: `/titip/:kode` (SSR, `noindex`, OG `og-titip.jpg`) membuka editor dengan `?titip=<kode>`. Draf menyimpan kotak tujuan dan nama pengirim (`draft.box`, `draft.from`); kotaknya tetap saat strip Booth masuk lewat Pakai di surat. Surat titipan dikirim tanpa gambar OG, dan dicatat di Surat terkirim dengan `titip`, jadi bisa ditarik lagi dari halaman titip. Kalau kotaknya gagal dimuat karena koneksi, `?titip=` dikembalikan ke alamat supaya muat ulang mencoba lagi. Titipan yang ditolak karena kotaknya dihapus, ditutup, atau penuh tidak ditawari Coba lagi.
- **Batas kotak** (20 surat dan 40 foto, `BoxLimits`; foto depan dari galeri ikut dihitung, `utils/box-room.ts`):
  - `/kotak/baru` menyebut batasnya dari awal, dan halaman kelola bilang kalau kotaknya penuh surat atau penuh foto.
  - `/titip/:kode` menulis sisa surat dan fotonya. Kotak yang fotonya penuh bilang surat hanya bisa masuk tanpa foto, dan tidak menawarkan strip Booth. Kotak yang penuh menawarkan "Tulis surat sendiri". Teman-teman juga diberi tahu foto kotak dihapus 7 hari setelah penerima membukanya.
  - Editor dalam mode titip menolak kotak yang sudah penuh sebelum suratnya ditulis, dan banner titipnya menulis sisa tempatnya. Sebelum mengirim, sisa tempatnya dimuat ulang. Kalau kotaknya sudah ditutup atau penuh, atau fotonya lebih banyak dari sisa foto, suratnya tidak diunggah dan banner bilang apa yang harus dilakukan.
  - Kalau `box_full` tetap datang (kotak terisi teman lain tepat sebelum kirim), lembar kirim memuat ulang kotaknya untuk menjelaskan apakah suratnya atau fotonya yang tidak muat.
- **Penerima**: `/k/:slug` (SSR, `noindex`, OG `og-kotak.jpg`). Sebelum `openable`, folder tersegel; halaman memuat ulang sendiri saat jadwalnya tiba, atau sekali semenit untuk kotak manual, selama tab terlihat. Membuka surat pertama memanggil `POST /k/:slug/open`, kecuali di browser pembuatnya. Surat yang sudah dibuka dicatat di `localStorage` (`utils/box-read.ts`) untuk titik "belum dibuka". "Simpan semua" (`KeepBox`) menyimpan semua titipan ke folder `kotak-<slug>` di Kotak surat dengan satu CD, dan menulis tanggal foto dan kotaknya dihapus. Petunjuk "Ketuk kotaknya" dan daftar surat bertukar lewat transisi `reveal`, dan panel Simpan semua punya pengganti setinggi panelnya sebelum halaman selesai dimuat, jadi footer tidak terdorong. Tab yang kembali terlihat langsung memeriksa kotak yang masih disegel, kotak yang terbuka sendiri diumumkan ke pembaca layar, dan halaman yang gagal dimuat punya tombol Muat ulang.
- **Seni folder** satu kotak sama di halaman penerima, halaman kelola, dan Kotak surat (`folderSeed(slug)`); halaman titip memakai kode titipnya.
- **Waktu** (`utils/box-time.ts`): halaman yang di-SSR menulis WIB dulu, lalu zona waktu HP setelah dimuat (WIB, WITA, WIT, atau singkatan browser di luar Indonesia). Halaman yang hanya dirender di browser langsung memakai zona HP, sama dengan jam yang dipilih di input jadwal.
- **Unduh semua foto** (`KeepBox`): fotonya baru diunduh saat diminta, karena bisa puluhan. Di iPhone ketukan pertama menyiapkannya dan ketukan kedua membuka lembar Bagikan, karena Safari menolak lembar Bagikan kalau ketukannya sudah lama berlalu.
- **Halaman pribadi**: `/k/…` dan `/titip/…` tidak pernah disimpan service worker (`isPrivatePath()`).
- Gambar OG kotak dibuat ulang dengan `node scripts/og-images.mjs og-kotak.jpg og-titip.jpg`.

## Checklist per sprint

Centang item di PR yang menyelesaikannya. Agent mulai dari item pertama yang belum dicentang. Per 22 Oktober 2026 semua item sudah dicentang; pekerjaan baru ditambahkan di sini lewat PR sebelum dikerjakan.

**Sprint 0 (minggu 1)**

- [x] Scaffold Nuxt + TypeScript + Pinia, Tailwind, ESLint, Prettier, Vitest, Playwright, CI
- [x] Design token di CSS variables
- [x] Komponen bersama: StepCard, PillChip, PillGroup, Swatch, SwatchGroup, StickyCTA, BottomSheet, SidePanel, Modal, IconButton, PhotoFrame
- [x] Preset desain di `packages/presets`
- [x] Spike kartu foil CSS vs TresJS: CSS 3D dipilih ([hasil](spikes/foil-3d.md))
- [x] Uji `ctx.filter` di engine Safari dan Chrome ([hasil](spikes/safari.md))
- [x] Uji kamera dan benchmark kartu di iPhone dan HP Android kelas menengah sungguhan (`/lab/safari`, `/lab/foil?bench=1`), lolos 22 Oktober 2026 ([Uji di HP sungguhan](#uji-di-hp-sungguhan))
- [x] Ukuran dan catatan referensi di `docs/reference/` (screenshot di luar repo karena repo public)

**Sprint 1 (minggu 2–3)**

- [x] Halaman `/letter/new` dengan langkah 1 sampai 4 (gambar depan, bagian foil, warna foil, kertas), kartu berubah langsung tanpa reload. Langkah 5 sementara berupa kolom teks sampai editor Sprint 2 siap
- [x] Upload, drop, dan paste foto sendiri untuk gambar depan; bentuk Asli, Portrait, Square, Landscape
- [x] Peta foil dari gambar di browser: Detail (deteksi tepi), Bayangan (threshold), Satu warna
- [x] Surprise me memakai `surprise()` dari preset, dengan animasi kartu berputar sekali
- [x] Draf otomatis di IndexedDB; refresh tidak menghilangkan isi
- [x] Gerbang: kartu foil di atas 50 fps di HP Android kelas menengah, lolos 22 Oktober 2026

**Sprint 2 (minggu 4–5)**

- [x] Editor isi surat dengan 4 template, teks tulisan tangan, foto (maksimal 4), dan stiker. Editornya DOM, bukan vue-konva ([keputusan](spikes/editor-isi-surat.md))
- [x] Alur "Buat link": kompres tiap foto sampai di bawah 500 KB (JPEG atau WebP), hapus EXIF lokasi, upload ke URL bertanda tangan, lalu publish (kontrak dari `docs/api/openapi.yaml`). Diuji lewat mock API; begitu Edge Function siap tinggal ganti `NUXT_PUBLIC_API_BASE`
- [x] Gambar OG dirender di browser waktu "Buat link" dari kartu yang sama: JPEG 1200×630 maksimal 300.000 byte, diunggah lewat URL bertanda tangan seperti foto. Jangan pasang Nuxt OG Image
- [x] Halaman penerima `/l/:slug` dengan animasi buka di bawah 600 ms dan tombol Bikin balasan; placeholder di slot foto kalau fotonya sudah dihapus (7 hari setelah surat pertama kali dibuka), dan sampul polos kalau cover dari foto user ikut dihapus
- [x] `/l/**` di-SSR lewat `routeRules` dengan header `X-Robots-Tag: noindex`, dan meta tag OG memakai URL gambar OG dari `GET /l/:slug`, atau gambar OG bawaan kalau sudah dihapus
- [x] Region fungsi Vercel `sin1` (Singapura), bukan US. Supabase-nya di Sydney (`ap-southeast-2`), bukan Singapura ([Deploy](#deploy))
- [x] Gerbang: link terbuka di HP lain tanpa login dan preview-nya tampil di WhatsApp ([cara cek](#gerbang-sprint-2)), lolos 13 Oktober 2026

**Sprint 3 (minggu 6–7)**

- [x] Halaman TV: badan clay dengan 8 warna, panel filter, rak CD (ketuk punggung untuk memilih, ketuk lagi untuk membuka, lalu seret piringan ke TV atau tekan Masukkan CD; piringan terbang ke slot), slideshow
- [x] Booth: hitung mundur, strip 1×4 / 2×2 / satu foto dengan pratinjau bentuk hasilnya di layar, unduh PNG dengan filter yang sama dengan layar
- [x] Kirim hasil Booth ke Letter

**Sprint 4 dan beta (minggu 8–10)**

- [x] Pocket: kalender, modal simpan hari, buka kantong, album otomatis per bulan ke TV
- [x] `navigator.storage.persist()` dan ajakan pasang PWA ([PWA](#pwa))
- [x] Uji di 3 HP; perbaiki bug dari tester. Langkah 1 sampai 10 [Uji di HP sungguhan](#uji-di-hp-sungguhan) lolos 22 Oktober 2026

**Fase 2: login dan sinkron Pocket** (skema sudah di produksi sejak #50, [rancangan](backend.md#rancangan-skema-fase-2))

- [x] Id momen dan album jadi UUID, data lama diganti saat dimuat (#48)
- [x] OAuth client Google (Google Cloud) dan provider Google di Supabase Auth, dipasang 15 Oktober 2026. Login dan cadangan foto sudah dicek di iPhone.
  - Sejak 16 Oktober 2026 client-nya dipublikasikan (In production), jadi akun Google mana pun bisa masuk, tanpa daftar test users dan batas 100. Scope-nya non-sensitive (`openid`, `email`, `profile`), jadi tidak perlu verifikasi Google. Logo sengaja tidak dipasang, karena logo butuh verifikasi brand.
  - Branding: homepage `https://postpocket.vercel.app` dan kebijakan privasi `/privasi`. Authorized domain: `postpocket.vercel.app` dan domain proyek Supabase (`<ref>.supabase.co`). `vercel.app` dan `supabase.co` ada di Public Suffix List, jadi Google meminta domain proyeknya, bukan domain induknya.
  - Halaman login Google menulis "Lanjutkan ke `<ref>.supabase.co`", karena callback-nya di domain Supabase. Supaya yang tampil domain sendiri, perlu custom domain Supabase (add-on berbayar).
  - Dicek 16 Oktober 2026: "Masuk dengan Google" di produksi membuka halaman login Google tanpa error, link Kebijakan Privasinya ke `/privasi`, dan Kall berhasil masuk di HP dengan akun Google yang tidak pernah ada di daftar test users.
- [x] Login Google dan kartu Cadangan di Pocket ([Sinkron Pocket](#sinkron-pocket)). Surat tetap bisa dibuat dan dibuka tanpa login
- [x] Sinkron dua arah sesuai catatan Sinkron di rancangan:
  - tarik dengan jendela 5 menit, penerapannya idempoten;
  - momen yang hilang dari `moment_ids` kantong ditempel lagi;
  - unggah versi kompres ke `<owner_id>/<id>.jpg`, dan berkas yang hilang diunggah ulang.
- [x] Pesan saat kuota penuh (`23514`, 100 foto). Unggah yang ditolak policy menggagalkan sinkron itu dan dicoba lagi, kecuali unggah ulang berkas yang hilang, yang dilewati per foto
- [x] Batas kantong dan album per user (migrasi `hardening`, [backend](backend.md#audit-sebelum-rilis-10)): kantong atau album yang ditolak kuota tetap menunggu di perangkat, perubahan lain tetap terkirim, dan kartu Cadangan menulis "Cadangan kantong penuh" atau "Cadangan album penuh"
- [x] `/privasi` menjelaskan akun Google dan cadangan foto, sebelum login dibuka
- [x] Sinkron baru dinyalakan di produksi setelah job pembersihan berkas dan baris berstatus hapus dari Bintang ada (#52). Kartu Cadangan baru muncul kalau provider Google sudah aktif
- [x] Hapus akun dari kartu Cadangan (kontrak 0.4.0), tanpa login ulang ([Sinkron Pocket](#sinkron-pocket)). `/privasi` menjelaskan caranya, dan Lapor masalah tetap ada untuk yang tidak bisa masuk lagi

## Sinkron Pocket

Login Google mencadangkan dan menyinkronkan Pocket, TV, dan Booth antar perangkat (fase 2). IndexedDB tetap sumber utama dan tetap jalan offline; server hanya cadangan. Skema dan aturannya ada di [Rancangan skema fase 2](backend.md#rancangan-skema-fase-2).

| Bagian | Isi |
| --- | --- |
| `app/stores/sync.ts` (`useSync`) | Klien Supabase dimuat lazy saat halaman Pocket atau TV memanggil `start()`, jadi halaman surat tidak memuat `@supabase/supabase-js`. Login PKCE kembali ke `/pocket?masuk=1`. Sinkron dijadwalkan 2 detik setelah setiap perubahan, saat online lagi, dan saat aplikasi dibuka lagi |
| `app/utils/sync-run.ts` (`runSync`) | Satu putaran: tarik, unduh foto baru dulu, gabungkan, kirim perubahan, lalu unggah ulang berkas yang hilang dari cadangan |
| `app/utils/sync.ts` | Bentuk baris tabel dan aturan gabung (`mergeRemote`), fungsi murni |
| `app/utils/sync-supabase.ts` | `SyncBackend` di atas PostgREST dan bucket `moments`. Tarikan per halaman 1.000 baris diurutkan `updated_at` lalu kunci unik (`id`, atau `day` untuk kantong), karena baris dari satu upsert punya `updated_at` yang sama persis |
| `app/components/pocket/BackupCard.vue` | Kartu Cadangan di bawah kalender: tombol Google, status, kuota, keluar, dan Hapus akun (`DeleteAccountDialog.vue`) |
| `app/utils/account-api.ts` | `DELETE /account` (kontrak 0.4.0) dengan sesi login di `Authorization: Bearer`. Alamatnya selalu fungsi Supabase (`useAccountApiOptions`), juga saat `NUXT_PUBLIC_API_BASE` menunjuk mock |

Aturannya:
- **Catatan perubahan.** Setiap perubahan kenangan dicatat di `MemoryData.pending` dalam tulisan yang sama dengan datanya, dengan nomor urut. Baris yang tercatat tapi sudah tidak ada berarti dihapus. Nomor urut menjaga perubahan yang terjadi selama sinkron supaya tidak ikut dianggap terkirim. Semua perubahan data store dibaca dan ditulis tanpa jeda `await`, supaya sinkron di belakang tidak menimpa perubahan user.
- **Tulisan terakhir menang** dihitung saat kirim. Baris yang masih menunggu dikirim menang dari server, tapi momen yang hanya ada di server tetap ditambahkan ke urutan kantong dan album. Baris lain mengikuti server, dan momen yang hanya ada di perangkat ditempel lagi lalu dikirim ulang.
- **Sinkron pertama** akun di perangkat (dicatat per akun di `postpocket:sync`): server menang untuk baris yang ada di kedua tempat, data yang hanya ada di perangkat dikirim, dan tanda hapus lama tidak pernah menghapus apa pun.
- **Ganti akun.** Perangkat yang sebelumnya tersinkron ke akun lain bertanya dulu. Kalau user setuju, semua momen dan album mendapat id baru (`withNewIds`), karena id di cadangan unik untuk semua akun. Fotonya tetap di kunci lamanya (`photoKey`). Email yang sama dengan id baru tidak ditanya (`asksBeforeMerging`): akun lamanya sudah dihapus lalu dibuat lagi lewat akun Google yang sama, jadi kenangannya memang milik orang yang sama.
- **Hapus akun.** Tidak perlu login ulang, karena pemegang sesi juga bisa menghapus semua cadangan lewat sinkron. Dialognya menyebut yang ikut terhapus dan yang tetap ada, dengan fokus awal di Batal.
  - `removeAccount()` memanggil `DELETE /account`, lalu keluar di perangkat ini.
  - `postpocket:sync` sengaja tidak dihapus. Akun Google yang sama yang masuk lagi tidak ditanya (lihat Ganti akun), tapi akun lain tetap ditanya dulu sebelum kenangan di perangkat ini digabung ke cadangannya.
  - 401 juga dianggap selesai, misalnya kalau jawaban 204 sebelumnya hilang di jalan. Error lain ditampilkan di dialog, dan user tetap masuk.
  - Selama sinkron berjalan, tombolnya mati, dan selama akun dihapus, sinkron tidak dimulai.
  - Kenangan di perangkat, surat, dan kotak bareng tidak ikut terhapus.
  - Perangkat lain keluar sendiri saat token-nya diperbarui, paling lama 1 jam. Sampai itu, sinkron di sana ditolak server.
- **Foto.** Foto dari cadangan diunduh sebelum momennya ditampilkan. Yang gagal diunduh ditarik lagi di sinkron berikutnya. Yang naik selalu versi kompres JPEG ≤ 500.000 byte.
- **Kartu Cadangan** hanya muncul kalau URL Supabase diisi dan provider Google aktif (`/auth/v1/settings`), atau user sudah login. Tanpa itu, isinya tetap pengingat bahwa kenangan hanya ada di perangkat ini.

**Uji.**
- `test/sync.test.ts` menguji aturan gabung dan `runSync` dengan server palsu.
- `e2e/sinkron.spec.ts` menguji dua perangkat, hapus, kuota, unggah ulang, ganti akun, hapus akun, dan tombol Google ke stack Supabase lokal. Tes hapus akun memanggil fungsi `account` sungguhan dan hanya membuat jawaban 503 pertama sendiri, jadi stack-nya dijalankan dengan Edge Functions. Butuh Docker:

```sh
npx supabase@2.120.0 start -x studio,imgproxy,mailpit,realtime,logflare,vector,supavisor,postgres-meta
eval "$(npx supabase@2.120.0 status -o env | grep -E '^(API_URL|PUBLISHABLE_KEY|SECRET_KEY)=')"
export API_URL PUBLISHABLE_KEY SECRET_KEY
SYNC_E2E=1 pnpm --filter @postpocket/web exec playwright test --project=android --project=iphone
```

Login Google sendiri tidak bisa diuji otomatis. Tesnya memakai user yang dibuat lewat admin API, dan provider email tetap nyala di stack lokal untuk itu. Tes tombol Google memastikan alamat `/auth/v1/authorize` yang dibuka sudah benar. E2E biasa tidak menyentuh Supabase, karena URL-nya dikosongkan.

**Kotak surat** ([PRD Modul 4](prd/PRD-PostPocket.md#modul-4-kotak-surat))

- [x] Simpan surat dan Unduh foto di halaman penerima; fotonya masuk CD "Surat untukmu" di TV
- [x] Halaman `/kotak` dengan folder kaca, baca surat satu per satu, hapus surat dan folder
- [x] Animasi folder kaca dan penampil dicek di iPhone dan Android sungguhan ([langkah 9](#uji-di-hp-sungguhan)), lolos 22 Oktober 2026
- [x] Kotak bareng di atas mock (kontrak 0.3.0): bikin dan kelola kotak, titip dari editor dan Booth, kotak tersegel, baca satu per satu, Simpan semua
- [x] Kotak bareng menyala di produksi (`NUXT_PUBLIC_KOTAK_BARENG=1` di Vercel) setelah Edge Function `boxes` dan `k` dari Bintang ter-deploy, 15 Oktober 2026. Alur bikin, titip, buka, dan simpan dicek di browser ke produksi (22 dari 22 langkah lolos)

## Keamanan

- **Header keamanan** untuk semua halaman dan aset, dari `securityHeaders` di `nuxt.config.ts`:
  - `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'`, plus `X-Frame-Options: DENY` untuk browser lama, jadi halaman tidak bisa dibingkai situs lain;
  - `X-Content-Type-Options: nosniff`;
  - `Referrer-Policy: strict-origin-when-cross-origin`, jadi alamat lengkap (termasuk slug surat) tidak terkirim ke situs lain;
  - `Permissions-Policy`: hanya kamera (Booth) yang boleh dipakai, mikrofon, lokasi, pembayaran, dan USB dimatikan.
  
  Header itu dipasang dua kali. `routeRules['/**']` berlaku untuk halaman yang dirender server dan untuk server Node di E2E. Di Vercel, Nitro menulis header routeRules ke config tanpa `continue`, jadi berkas statis yang punya aturan lebih spesifik (aset `/_nuxt/`, manifest dan service worker PWA) tidak mendapat header `'/**'`. Karena itu `nitro.vercel.config.routes` menambah rute pertama yang memasang header ke semua jalur lalu meneruskan routing. Cek di produksi dengan `curl -sI` ke halaman dan ke satu berkas `/_nuxt/…`.

  CSP untuk skrip sengaja belum dipasang: Nuxt menyisipkan skrip inline (payload, splash), jadi butuh nonce atau hash per halaman. HSTS sudah dikirim Vercel.
- **Alat uji tidak ikut rilis.** Modul kecil di `nuxt.config.ts` membuang halaman `/lab`, mock API (`server/routes/mock-api`), dan kontrak yang dibaca mock dari build produksi, jadi di sana semuanya 404. Keduanya tetap ada di `pnpm dev` dan build E2E (`NUXT_MOCK_API=1`). Di build itu pun mock API menjawab 404 kalau `NUXT_MOCK_API` mati saat server jalan (`assertMockEnabled`).
- **Rahasia.** Frontend hanya memakai URL Supabase dan publishable key. Hook `pre-commit` menolak `.env` dan pola secret (`scripts/check-secrets.sh`), workflow `Web` mengecek ulang semua berkas yang di-track, dan secret scanning GitHub menyala.
- **Data pribadi di perangkat.** Halaman surat penerima, kotak bareng, dan titip tidak pernah disimpan service worker (`isPrivatePath()`), dan Lapor masalah tidak menyertakan link surat.
- **Audit dependensi.** `pnpm audit --prod` masih melaporkan dua temuan tanpa versi tambalan: `node-forge` (lewat `listhen`, server `nuxt dev`) dan `braces` (lewat pencarian berkas saat build). Keduanya hanya dipakai alat development dan build, dan tidak menerima masukan dari pengguna. Cek lagi setiap Nuxt naik versi.

## PWA

PostPocket bisa dipasang ke layar utama lewat `@vite-pwa/nuxt` (manifest dan service worker). Service worker hanya ada di build production; `pnpm dev` tidak memakainya, jadi cek PWA lewat `pnpm build && node apps/web/.output/server/index.mjs` atau `pnpm test:e2e`.

| Yang disimpan | Cara | Kenapa |
| --- | --- | --- |
| JS, CSS, ilustrasi bentuk Asli, ikon, stiker, `offline.html` | Precache saat service worker dipasang | Aplikasi tetap jalan tanpa sinyal |
| Ilustrasi bentuk Tegak, Persegi, dan Mendatar (`/illustrations/*-{portrait,square,landscape}*.svg`) | Disimpan saat dipakai, diperbarui di belakang | Sekitar 800 KB kalau ikut precache, padahal biasanya hanya satu bentuk yang dipakai |
| Halaman | Jaringan dulu, salinan terakhir kalau offline. Beranda, editor surat, Pocket, TV, Kotak surat, dan halaman pertama disimpan sejak kunjungan pertama | Selalu versi terbaru, tapi tetap bisa dibuka offline; draf surat, kenangan, dan surat tersimpan memang ada di IndexedDB, dan Pocket, TV, serta Kotak surat hanya dirender di browser, jadi salinan halamannya tidak memuat data pribadi |
| Font (`/_fonts/`) | Disimpan saat dipakai | Hanya subset yang benar-benar dimuat |
| Surat penerima (`/l/…`), kotak bareng (`/k/…`), dan halaman titip (`/titip/…`) | Tidak pernah disimpan | Isinya pribadi |

- Halaman yang belum pernah tersimpan menampilkan `offline.html` saat offline.
- Versi baru tidak langsung dipakai. Toast "Versi baru PostPocket siap" muncul dan user memilih kapan memuat ulang, supaya tulisan yang sedang diketik tidak hilang.
- Kartu "Pasang PostPocket" di Beranda memakai dialog pasang bawaan Chrome, atau petunjuk Tambah ke Layar Utama di iPhone. Aplikasi yang terpasang meminta `navigator.storage.persist()`, dan Safari tidak menghapus datanya setelah 7 hari.
- Begitu foto pertama tersimpan di perangkat (kenangan Pocket, Booth, foto dari TV, atau foto draf surat), browser juga diminta menyimpan secara permanen. Chrome dan Safari memutuskannya sendiri, Firefox menanyakan izin sekali.
- Halaman baru yang menampilkan data pribadi wajib dikecualikan dari cache: tambahkan ke `isPrivatePath()` di `app/utils/pwa.ts` dan aturan `runtimeCaching` di `nuxt.config.ts`.
- Ikon aplikasi dibuat ulang dengan `node scripts/pwa-icons.mjs` dari folder `apps/web`.

## Uji di HP sungguhan

Item checklist yang butuh HP sungguhan dicek sekali jalan dengan daftar di bawah, dan semuanya lolos 22 Oktober 2026. Ulangi daftar ini sebelum rilis besar berikutnya:
- benchmark dan kamera (Sprint 0);
- gerbang 50 fps (Sprint 1);
- uji di 3 HP (beta);
- animasi Kotak surat (langkah 9).

Pakai tiga HP: iPhone (Safari), Android kelas menengah (Chrome), dan satu Android lain, lebih bagus lagi kalau yang murah. Langkah 3 sampai 10 dibuka di domain produksi. Halaman `/lab` di langkah 1 dan 2 tidak ada di produksi, jadi dibuka dari Mac lewat `pnpm dev --host` (alamat `http://<ip-mac>:3000` di jaringan yang sama), dan kamera di langkah 2 lewat tunnel HTTPS karena kamera butuh HTTPS.

| # | Lakukan | Yang harus terjadi |
| --- | --- | --- |
| 1 | Buka `/lab/foil?bench=1`, tunggu 4 detik, lalu tekan "Salin hasil" di langkah 5 | Hasil fps dan p95 tersalin. Gerbang: di atas 50 fps di Android kelas menengah |
| 2 | Buka `/lab/safari` | Semua cek lolos, dan kamera tampil setelah diberi izin |
| 3 | Tulis surat: foto depan dari galeri (HEIC di iPhone), coba Detail, Bayangan, dan Satu warna, isi 2 foto dan stiker, lalu Buat link | Kartu berubah langsung, link keluar, dan foto tidak tertutup foil |
| 4 | Kirim link-nya lewat WhatsApp ke HP lain, buka, ketuk kartu, lalu Bikin balasan | Preview muncul, surat terbuka tanpa login, dan animasi bukanya mulus |
| 5 | Pocket: simpan hari dengan 3 foto, buka kantong dengan ketukan lalu dengan goresan, geser foto di tali, ganti desain, lalu hapus kantong | Foto keluar dari mulut kantong, tali bisa digeser, tidak patah-patah |
| 6 | TV: putar album bulan ini, seret CD ke TV, ganti filter | CD terbang ke slot dan slideshow jalan dengan filter |
| 7 | Booth: ambil strip 1×4, simpan ke Pocket dan CD, lalu Pakai di surat | Hitung mundur jalan, strip sesuai pratinjau, dan muncul di surat |
| 8 | Pasang ke layar utama, nyalakan mode pesawat, buka Pocket dan TV | Keduanya tetap terbuka offline, lengkap dengan foto |
| 9 | Buka surat berfoto dari link WhatsApp, Simpan surat, lalu Unduh foto. Buka Kotak surat, buka foldernya, ketuk salah satu surat, geser ke surat berikutnya, lalu nyalakan mode pesawat dan buka lagi | Foto masuk app Foto (iPhone) atau galeri (Android). Folder condong dan menyebar tanpa patah-patah, kartu keluar dari lembarnya, dan surat tetap terbuka offline |
| 10 | Setelah kotak bareng menyala: bikin kotak, bagikan link titip ke grup, titip dari dua HP (satu dengan strip Booth), lalu buka link penerima di HP ketiga sebelum dan sesudah Buka sekarang | Preview WhatsApp tampil untuk kedua link, kotak tersegel lalu terbuka sendiri, surat dibaca satu per satu, dan Simpan semua masuk Kotak surat |

Laporan per HP berisi:
- model HP, versi OS, dan browser;
- hasil langkah 1;
- nomor langkah yang bermasalah, beserta screenshot.

Kalau ketiga HP lolos, centang item-item itu di checklist.

- `/lab/foil?bench=1` menjalankan benchmark otomatis; hasilnya muncul di pojok kanan atas dan bisa disalin dari langkah 5. Parameter lain: `?flip=1` (sampul belakang) dan `?open=1` (kartu terbuka).
- `/lab/safari` memeriksa `ctx.filter`, OffscreenCanvas, WebGL2, IndexedDB, dan kamera. Kamera hanya jalan di HTTPS, jadi buka lewat tunnel HTTPS ke `pnpm dev --host`.
- `/lab/foil` juga menerima `?art=<ilustrasi>`, `?shape=<bentuk>`, dan `?border=1`, misalnya untuk mengecek bingkai foil di simulator iOS tanpa mengetuk layar.

## Gerbang Sprint 2

Begitu Edge Function `letters` dan `l` ter-deploy, gerbangnya dicek dalam tiga langkah:

1. `LIVE_BASE_URL=https://postpocket.vercel.app pnpm --filter @postpocket/web exec playwright test --project=android` menjalankan `e2e/live.spec.ts` ke backend asli: kirim surat berfoto, buka dari konteks browser baru tanpa login (seperti HP lain), cek aturan preview WhatsApp, lalu hapus suratnya lagi. Tes lain dilewati dan server lokal tidak dinyalakan. Uji ini membuat satu surat sungguhan, jadi ikut dihitung rate limit (10 surat per jam per IP).
   - Tiap langkah dibatasi 30 detik. Kalau ada yang macet, tes gagal sebelum batas 120 detik, dan surat ujinya tetap dihapus.
   - Hasil tiap run disimpan di folder sendiri, `apps/web/test-results/live-<waktu>/`, jadi run berikutnya tidak menghapusnya. Trace hanya ada untuk tes yang gagal. Buka dengan `pnpm --filter @postpocket/web exec playwright show-trace <folder>/trace.zip`.
   - Kalau `POST /l/:slug/open` tidak dijawab, pesan gagalnya mendaftar semua panggilan fungsi dari "HP lain", termasuk preflight yang gagal.
2. `pnpm --filter @postpocket/web check:preview <link surat>` memeriksa satu link seperti crawler WhatsApp. Syarat preview: halaman 200 tanpa login, meta OG ada di HTML dari server, gambar OG https, JPEG atau PNG, 1200×630, dan maksimal 300.000 byte. Cek privasinya: halaman surat wajib `noindex`. Aturannya di `apps/web/scripts/link-preview.mjs`, dan E2E `kirim-terima.spec.ts` ikut memakainya dengan mock.
3. Terakhir, cek manual: kirim linknya lewat WhatsApp ke HP lain, pastikan preview (judul dan sampul) muncul dan suratnya terbuka tanpa login.

Langkah 1 hanya bisa jalan ke backend asli, karena tesnya mengecek region fungsi dan header dari Supabase, jadi mock tidak bisa dipakai. Sejak kontrak 0.2.3, ini juga satu-satunya cara menguji backend asli dari browser: `pnpm dev` dan preview Vercel ditolak CORS.

Hasil 13 Oktober 2026, setelah region fungsi Sydney (#31, #33) ter-deploy:

| Langkah | Hasil |
| --- | --- |
| 1. Tes live | Lolos di Android dan iPhone. Semua panggilan fungsi dijawab dari `ap-southeast-2` |
| 2. `check:preview` | Semua aturan lolos untuk surat dari Bintang: halaman 200, gambar OG JPEG 1200×630 sebesar 162.145 byte, `noindex` |
| 3. WhatsApp | Kall dan Bintang saling kirim surat. Preview tampil dan suratnya terbuka tanpa login |

## Gambar README

- **Gambar promo** (`docs/gambar/promo-*.webp`, 1320 × 2868 seperti screenshot App Store) memakai layar produksi asli di dalam bingkai iPhone 17 yang digambar sendiri, di atas amplop bertutup emas, dengan satu kata tulisan tangan di judulnya. Buat ulang dengan `node scripts/promo-readme.mjs` setiap kali Beranda, editor surat, atau Pocket berubah. Butuh Google Chrome, karena kartu foil butuh GPU. Data contohnya hanya masuk IndexedDB browser sementara, jadi tidak ada surat yang dikirim. Teks judul, stiker, dan posisinya ada di daftar `promos` di skrip itu.
- **Diagram arsitektur** dibuat dengan [Archify](https://github.com/tt-a1i/archify) dari [`arsitektur.archify.json`](arsitektur.archify.json). Versi interaktifnya (`docs/arsitektur.html`) dipublikasikan GitHub Pages dari folder `docs/` (ada `docs/.nojekyll`) di <https://wingman-sprint.github.io/PostPocket/arsitektur.html>, dan tiap bagian menaut ke baris kode di commit `meta.repository.revision`. Setelah arsitektur berubah:
  1. Perbarui JSON-nya, termasuk revisi dan nomor baris rujukan.
  2. Clone Archify di luar repo, lalu jalankan `node <archify>/archify/bin/archify.mjs finalize architecture docs/arsitektur.archify.json .archify/arsitektur.html --repo-root . --quality showcase` (folder `.archify/` di-ignore).
  3. Salin `.archify/arsitektur.html` ke `docs/arsitektur.html`.
  4. Ekspor PNG terang dan gelap lewat tombol Ekspor, lalu simpan sebagai WebP 2400 px: `cwebp -q 95 -resize 2400 0 <png> -o docs/gambar/arsitektur-terang.webp`, begitu juga `arsitektur-gelap.webp`.

## Deploy

Proyek Vercel `postpocket` (Hobby, akun Kall) tersambung ke repo ini lewat GitHub. Setiap push ke `main` deploy ke produksi di [postpocket.vercel.app](https://postpocket.vercel.app), setiap PR dapat preview.

| Setting | Nilai |
| --- | --- |
| Root directory | `apps/web`, file di luar root ikut di-build (misalnya `packages/presets`) |
| Framework dan Node | Nuxt, 24.x |
| Region fungsi | `sin1` (Singapura), dekat dengan pengguna di Indonesia. Supabase ada di Sydney (`ap-southeast-2`) |
| Env production, preview, development | `NUXT_PUBLIC_SUPABASE_URL` dan `NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, nilainya sama dengan `apps/web/.env` |
| Env production saja | `NUXT_PUBLIC_KOTAK_BARENG=1` |

- Preview dilindungi Vercel Authentication, jadi hanya bisa dibuka akun pemilik proyek. Domain produksi terbuka untuk siapa saja.
- Sejak kontrak 0.2.3, Edge Functions hanya menerima origin domain produksi. Di preview, halaman surat masih terbuka lewat SSR, tapi "Buat link" dan menandai surat dibuka ditolak CORS. Alur kirim diuji di E2E (mock) dan tes live (produksi).
- Env baru atau yang berubah baru terpakai di deploy berikutnya. Hanya nilai yang aman di browser yang boleh masuk sini; secret key tetap di Supabase.
