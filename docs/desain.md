# Identitas visual PostPocket

PRD meminta fase polish "mengganti identitas visual" supaya PostPocket tidak terlihat seperti tiruan tiga web referensinya. Dokumen ini adalah arahnya. Nilai warnanya ada di `apps/web/app/assets/css/main.css`; komponen cukup memakai token.

## Subjek

PostPocket tempat anak muda Indonesia menyimpan momen kecil per hari, lalu mengirimnya sebagai kartu foil 3D lewat satu link. Benda-benda di dunianya: kertas surat, pulpen biru, amplop par avion, kemasan jajanan, strip photobox, dan TV jadul. Pilihan visual diambil dari benda-benda itu, bukan dari pola aplikasi pada umumnya.

## Arah: surat par avion

| Peran | Nilai | Dipakai untuk |
| --- | --- | --- |
| Kertas | `#F1F4F8` | Latar halaman: kertas HVS yang sedikit kebiruan, bukan krem |
| Putih | `#FFFFFF` | Kartu, lembar, dan kolom isian |
| Tinta | `#18204A` | Teks dan tombol utama: biru-hitam pulpen, bukan hitam |
| Merah pos | `#E23B3B` | Hanya di cap pos di halaman salah alamat (404) dan seni folder par avion di Kotak surat |
| Emas foil | dari preset foil; `#D9B45A` di logo | Hanya di kartu dan tutup amplop di logo |

Teks sekunder memakai tinta 66% (minimal 4,9:1) dan placeholder tinta 48%.

**Huruf.** Gantari untuk semua teks antarmuka, dari judul sampai keterangan. Gantari dibuat Anugrah Pasau dari Lafontype, foundry di Makassar: huruf buatan Indonesia untuk aplikasi anak muda Indonesia. Bentuknya bersih dan geometris tapi tetap hangat, dan bukan salah satu font yang sering muncul di desain buatan AI (Inter, Space Grotesk, Bricolage Grotesque, Plus Jakarta Sans, dan sejenisnya). Judul memakai ketebalan 700 dengan jarak huruf sedikit rapat, teks biasa 400, dan label 500–600. Isi surat memakai Delicious Handrawn, tulisan tangan Agung Rohmat, desainer huruf dari Jawa Tengah: lebih tegak dan huruf kecilnya lebih tinggi daripada Caveat, jadi tetap terbaca di kartu yang kecil, tapi lebarnya sama, jadi tata letak surat yang sudah terkirim tidak bergeser. VT323 tetap untuk layar TV. Di luar isi surat, tulisan tangan dipakai di tiga tempat, permintaan Kall pada 15 Oktober 2026 supaya hurufnya lebih mendominasi:

- kata "surat" di judul (Beranda, Kotak surat, Titip surat, gambar OG), lewat utility `hand-word`;
- nama modul di Beranda, seperti label tulisan tangan di bawah gambarnya;
- tanda tangan "PostPocket" di splash.

Spasi Delicious Handrawn sangat sempit ("ulang tahun" terbaca "ulangtahun"), jadi tulisan tangan yang lebih dari satu kata memakai jarak kata 0,15 em (`--letter-word-spacing`). Halaman info dan angka (bulan di Pocket, tanggal) tetap Gantari supaya mudah dibaca. Font cadangannya diukur sama dengan Arial (iPhone, desktop) atau Roboto (Android), jadi teks tidak melompat saat Gantari selesai dimuat.

**Modul.** Pocket dan TV memakai kertas dan tinta yang sama dengan Beranda. Ciri tiap modul ada di bendanya: kantong jajan dan jepitan kayu (utility `clothespin`) di Pocket, TV jadul berlayar VT323 di Memori TV dan Booth, dan folder kaca buram dengan panel belakang bercorak cairan di Kotak surat. Seni folder dilukis dari resep warna di preset (`kotak.json`). Resep bawaannya memakai merah dan biru par avion, karena folder itu juga membingkai surat.

**Lapisan mengambang.** Modal, lembar, dan popup memakai utility `scrim`: halaman di belakangnya kabur (blur 14 px) dan sedikit gelap, jadi yang mengambang terasa terangkat tanpa memutus konteks. Di browser yang menggambar tanpa GPU dan di tes otomatis (`data-render="cpu"` di `<html>`), latarnya cukup diredupkan, dan animasi kantong serta tali Pocket langsung ke keadaan akhirnya.

**Satu hal yang berani.** Kartu foil itu sendiri, ditambah kata "surat" yang ditulis tangan. Sejak 15 Oktober 2026 kartu contoh di Beranda, surat penerima, dan gambar OG tidak lagi dibingkai garis par avion merah-biru (Kall: "jatohnya kaya barbershop"). Kartunya melayang di panggung `dot-stage`, kisi titik yang memudar seperti panggung figur Hairline. Bagian lain dibuat tenang.

**Desain kartu siap pakai.** Sejak 16 Oktober 2026 ada lima desain sampul, masing-masing digambar ulang untuk setiap bentuk kartu (Asli, Tegak, Persegi, Mendatar), jadi tidak ada yang terpotong atau membesar:
- **Padang bunga:** ladang bunga di bawah, karangan daun foil dan dua kupu-kupu foil di atasnya.
- **Ranting:** buket eukaliptus, zaitun, dan beri di depan cincin foil ganda, diikat pita foil. Sebagian daunnya hanya garis foil.
- **Malam berbintang:** bukit berlapis dengan cemara dan pondok berjendela foil; bulan sabit, rasi, dan bintang jatuh dari foil.
- **Ulang tahun:** untaian bendera segitiga, balon dengan kilau foil, dan kue bertingkat dengan nyala lilin foil.
- **Lebaran:** ketupat bergantung pada tali foil, bulan sabit dengan bintang segi delapan, dan masjid berkubah dengan jendela foil.

Bingkai foil di tepi berupa dua garis, tebal di luar dan tipis di dalam, seperti bingkai kartu ucapan cetak. Isi surat tidak pernah saling menimpa: tulisan yang panjang diperkecil sampai muat di pitanya, dan bingkai foto mengikuti bentuk fotonya.

**Beranda bergaris tipis.** Sejak 15 Oktober 2026 Beranda memakai gaya [Hairline](https://hairline.lucasmarkes.com), pilihan Kall: figur isometrik dari satu garis tinta di atas putih, satu garis terang sebagai satu-satunya sorotan, dan kisi titik yang memudar di belakangnya. Modul tetap dibuka dengan bendanya (aturan 1), hanya digambar sebagai garis: surat dan amplop, kantong jajan di tali jemuran, bilik foto. Tiga panelnya satu pita bersekat, bukan tiga kartu yang sama. Kerumunan Open Peeps di atas footer diwarnai tinta yang sama dan berjalan pelan, supaya tidak mengalahkan isi halaman.

Garis dari judul kerumunan ke kerumunannya (`CrowdLine`) ikut bergerak seperti garis Hairline:
- digambar dari atas begitu terlihat;
- lalu satu kilau tinta turun pelan, berulang;
- kilaunya berhenti di luar layar, dan dengan gerakan dikurangi garisnya langsung utuh.

Gerakan figur mengikuti aturan 08 Hairline: pilihan memakai ease 700 ms, posisi pointer memakai pegas. Tidak boleh ada yang meloncat dalam satu frame. Pengecualian yang disengaja ada di dua figur:
- **Surat:** pulpennya terangkat ke awal baris berikutnya, tidak berpindah seketika. Pegas ceritanya teredam kritis (k 60, c 15,5), supaya putaran mundurnya tidak menyentak.
- **Booth:** bingkai foto tumbuh bersama stripnya.

## Logo

Sejak 15 Oktober 2026 logonya **P-amplop**: huruf P yang mangkuknya amplop, dengan tutup amplop emas sebagai lubangnya. Arahnya dipilih Kall dari tiga konsep (huruf P, amplop di kantong, dan segel lilin) yang dibuat dengan skill [logo-design](https://github.com/kaankiziltug/logo-design-skill). Alasannya: paling tegas, paling kuat di 16 px dan sebagai ikon aplikasi, dan berbeda dari logo P dan amplop yang sudah ada (Pinterest, Patreon, Gmail).

**Bentuk.** Kotak simbol 160 × 184:
- batang selebar 44;
- mangkuk 160 × 120, sudut kanannya 36 dan sudut lainnya 8;
- tutup amplop 80 × 30 (sisi 3 : 4 : 5), mulai tepat di tepi dalam batang;
- untuk ukuran di bawah 24 px, termasuk favicon, ada potongan kecil dengan tutup yang lebih dalam dan lebar.

Wordmark-nya Gantari ExtraBold yang sudah dijadikan garis, dengan tracking −0,02 em dan kern optis di Po, tP, ck, dan ke. Jangan mengetik ulang "PostPocket" dengan font sebagai pengganti logo.

**Lockup.**
- Horizontal: huruf kapital wordmark rata atas dengan P, berjarak 40. Batang P menggantung di bawah garis dasar seperti ekor huruf, jadi teks di sampingnya (misalnya menu di Beranda) disejajarkan dengan garis dasar wordmark.
- Bertumpuk: P 1,5× di tengah atas.
- Dengan tagline (header Pocket): wordmark di separuh atas tinggi P, tagline di separuh bawahnya.

**Warna.**

| Versi | Tampilan | Kontras |
| --- | --- | --- |
| Utama | P tinta `#18204A` dengan tutup emas `#D9B45A` | Emas di atas tinta 7,9:1; tinta di atas kanvas 14:1 |
| Satu warna | Tinta saja, tutupnya tetap lubang | |
| Terbalik | P putih dengan tutup emas, di atas tinta | |

Emas hanya ada di dalam P, tidak pernah langsung di atas kanvas atau putih.

**Latar.** Seperti Beranda: kanvas `#F1F4F8` atau putih, dan tinta untuk versi terbalik. Ikon aplikasi, favicon, layar pembuka PWA, dan gambar OG memakai kanvas. Di OG, logo duduk di kanvas di dalam bingkai par avion. Jangan di atas foto, gradien, atau pola.

**Jarak dan ukuran.** Ruang kosong di sekeliling logo minimal selebar batangnya. Ukuran minimum: simbol 16 px (pakai potongan kecil di bawah 24 px) dan lockup horizontal 24 px tingginya.

**Jangan:**
- ditarik atau diputar;
- diberi bayangan, gradien, atau garis tepi;
- diganti warnanya di luar tiga versi di atas;
- tutupnya dibuang atau P-nya dipakai tanpa tutup amplop;
- wordmark-nya diganti font lain.

**Berkas.**
- Sumber geometri: `apps/web/app/utils/brand-logo.ts`.
- Master SVG di `docs/brand/`: simbol, lockup horizontal, dan wordmark dalam versi utama, satu warna, terbalik, dan putih, plus lockup bertumpuk dan ikon.
- Di aplikasi, logo dipakai lewat komponen `BrandLogo`.
- Setelah geometri berubah, jalankan dari `apps/web`:
  - `node scripts/brand.mjs` untuk master dan favicon;
  - `node scripts/pwa-icons.mjs` untuk ikon PWA;
  - `node scripts/og-images.mjs` untuk gambar OG.

## Traktir PostPocket

Ajakan dukungan lewat [Sociabuzz](https://sociabuzz.com/wingmanclutch/tribe), ditambahkan 16 Oktober 2026. Mengikuti aturan "bendanya dulu": dialognya dibuka dengan **perangko** PostPocket (`SupportStamp`), bukan ikon hati atau koin.

- Perangko kertas putih bergerigi (lubang tepi lewat `mask`), wajahnya kertas `canvas` dengan logo P-amplop, nilai "Rp seikhlasnya", dan "Indonesia" seperti perangko sungguhan.
- Di dialog, perangkonya ditempel dengan sedikit putaran lalu dicap pos bertanggal hari ini (waktu Jakarta). Tulisan kapital di cap pos itu bagian dari bendanya. Tanpa animasi kalau `prefers-reduced-motion`.
- Pemicunya di Beranda: baris "Traktir PostPocket" di bawah kartu Pasang, dan tautan "Traktir" di footer.
- Dialog yang sama muncul sendiri (`useSupportPrompt`) setelah lembar "Link surat siap" atau "Suratmu sudah masuk kotak" ditutup, dan setelah Hasil Booth yang sudah disimpan ditutup. Paling sering sekali per 30 hari di satu perangkat (`localStorage`), dan tidak pernah muncul di atas lembar yang sedang dipakai.
- Tombol utamanya tautan biasa ke Sociabuzz di tab baru (`rel="noopener noreferrer"`). PostPocket tidak mengirim data apa pun ke sana.
- Tidak memakai emas foil atau merah pos: emas tetap hanya di kartu dan tutup amplop logo.

## Splash

Di awal setiap sesi, sebelum Beranda atau halaman aplikasi tampil, logo P-amplop terbentuk di kanvas berkisi titik (`AppSplash`):

1. garis P digambar;
2. tinta mengisinya dari bawah;
3. tutup amplop emas melipat turun;
4. kilau foil lewat sekali;
5. "PostPocket" ditulis tangan huruf demi huruf di bawahnya. Template tanda tangan dari Kall diubah dari React ke Vue tanpa memuat font: garis tiap huruf disimpan di `app/utils/brand-signature.ts`.

Tanda tangannya selesai di 1,9 detik, logo dan tanda tangan yang utuh diam sebentar, lalu splash memudar ke halaman. Totalnya 3,1 detik.

- **Sekali per sesi.** Skrip kecil di `<head>` (`app/utils/splash.ts`) memutuskan sebelum halaman tergambar, jadi tidak ada kedip.
- **Tidak di halaman yang dibuka dari link:** surat, kotak, dan titip. Penerimanya datang untuk isinya.
- **Tidak di halaman info dan lab,** dan tidak kalau pengguna meminta gerakan dikurangi.
- **Bisa dilewati** dengan ketukan atau tombol apa pun.
- **Tanpa JavaScript.** Seluruh animasinya CSS, jadi sudah berjalan sebelum JavaScript selesai dimuat.

## Aturan

1. **Bendanya dulu.** Setiap modul dibuka dengan bendanya (kartu foil, kantong, strip, TV), bukan ikon di dalam kartu yang seragam.
2. **Tanpa kebiasaan template.** Hindari pola-pola ini:
   - label huruf kapital berjarak di atas judul;
   - deretan "A · B · C";
   - panah di teks tombol;
   - kartu identik dengan bayangan yang sama;
   - font mono untuk label kecil.

   Kecuali bagian dari benda itu sendiri, misalnya cap tanggal di foto, merek di punggung kartu, atau tulisan di layar TV. Modal kantong Pocket juga pengecualian: kartu langkah bernomor 01–04 mengikuti Day Pocket, keputusan Kall pada 13 Oktober 2026.
3. **Kata-kata dari sudut pandang user.** Kalimat biasa (bukan huruf kapital semua), kata kerja yang jelas, dan satu nama untuk satu aksi di seluruh alur.
4. **Batas mutu tetap berlaku:** kontras minimal 4,5:1 untuk teks, fokus keyboard terlihat, `prefers-reduced-motion` dihormati, dan tata letak tetap rapi dari HP 360 px sampai desktop.

Panduan yang dipakai: skill [frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design) dari Anthropic, skill [Impeccable](https://github.com/pbakaus/impeccable) (bagian `typeset` dan `craft-floor`, dipakai untuk memilih Gantari), dan [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines) dari Vercel.
