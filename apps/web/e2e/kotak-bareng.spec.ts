import { readFileSync } from 'node:fs'
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'

// Kotak bareng (kontrak 0.3.0) lewat mock API: pembuat bikin kotak, teman-teman menitip surat,
// penerima membukanya, membaca suratnya satu per satu, lalu menyimpan semuanya.

const jpeg = readFileSync(new URL('./fixtures/foto-kecil.jpg', import.meta.url))

interface Links {
  invite: string
  open: string
}

/** Bikin kotak lewat halaman /kotak/baru sebagai pembuat, lalu ambil kedua link-nya. */
async function createBox(page: Page, title = 'Ultah ke-20 Rani', to = 'Rani'): Promise<Links> {
  await page.goto('/kotak')
  await page.getByTestId('kotak-baru').click()
  await page.getByTestId('box-to').fill(to)
  await page.getByTestId('box-title').fill(title)
  await page.getByTestId('box-create').click()
  await expect(page.getByTestId('box-manage-title')).toHaveText(title)
  return {
    invite: await page.getByTestId('box-invite-url').inputValue(),
    open: await page.getByTestId('box-open-url').inputValue(),
  }
}

const codeOf = (url: string) => url.split('/').pop()!

/** Surat titipan lewat mock API, dengan foto depan dan satu foto isi kalau `photos`. */
async function titipViaApi(
  request: APIRequestContext,
  invite: string,
  from: string,
  text: string,
  photos = true,
) {
  const meta = { type: 'image/jpeg', width: 32, height: 24, size: jpeg.length }
  const response = await request.post('/mock-api/letters', {
    data: {
      design: {
        illustration: photos ? 'upload' : 'meadow',
        shape: 'portrait',
        foilMode: 'detail',
        foilBorder: true,
        foilColor: 'gold',
        paper: 'blush',
        template: 'photo-1',
      },
      content: {
        version: 1,
        elements: [
          ...(photos
            ? [
                {
                  kind: 'photo',
                  id: 'p1',
                  x: 0.5,
                  y: 0.35,
                  width: 0.74,
                  rotation: -2,
                  photo: 'f1',
                  aspect: 1.25,
                },
              ]
            : []),
          {
            kind: 'text',
            id: 't1',
            x: 0.5,
            y: 0.8,
            width: 0.8,
            rotation: 0,
            text,
            size: 0.07,
            align: 'center',
          },
        ],
      },
      cover: photos ? meta : null,
      photos: photos ? [{ key: 'f1', ...meta }] : [],
      og: null,
      replyTo: null,
      box: { invite: codeOf(invite), from },
    },
  })
  if (!response.ok()) return { status: response.status(), body: await response.json() }
  const created = await response.json()
  if (photos) {
    for (const target of [created.uploads.cover, created.uploads.photos.f1]) {
      await request.put(target.signedUrl, { headers: { 'content-type': 'image/jpeg' }, data: jpeg })
    }
  }
  const published = await request.post(`/mock-api/letters/${created.id}/publish`, {
    headers: { 'x-edit-token': created.editToken },
  })
  return { status: published.status(), body: await published.json() }
}

/** Surat yang sedang tampil di penampil, bukan yang sedang bergeser keluar. */
const shownCard = (viewer: Locator) =>
  viewer.locator('[data-testid="viewer-letter"]:not([aria-hidden="true"])')

test('pembuat bikin kotak, dua teman menitip, penerima membaca satu per satu lalu menyimpan semua', async ({
  page,
  browser,
  request,
  browserName,
}) => {
  test.setTimeout(90_000)
  const links = await createBox(page)
  await expect(page.getByTestId('box-manage-status')).toContainText('Kamu yang membukanya')
  await page.goto('/kotak')
  await expect(page.getByTestId('my-box')).toContainText('Ultah ke-20 Rani')

  // Teman pertama lewat link titip dan editor surat biasa.
  const friend = await (await browser.newContext()).newPage()
  const titip = await friend.goto(links.invite)
  expect(titip?.headers()['x-robots-tag']).toBe('noindex')
  await expect(friend.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    'Titip surat untuk Rani',
  )
  await expect(friend.getByTestId('titip-room')).toContainText('Belum ada surat yang masuk')
  await friend.getByTestId('titip-write').click()
  const banner = friend.getByTestId('titip-banner')
  await expect(banner).toContainText('Untuk kotak "Ultah ke-20 Rani"')
  await friend.getByRole('textbox', { name: 'Isi surat' }).fill('Selamat ulang tahun, Rani!')
  // Tanpa nama pengirim, suratnya belum bisa dititip.
  await friend.getByRole('button', { name: 'Titip ke kotak' }).click()
  await expect(banner.getByRole('alert')).toHaveText('Tulis namamu dulu, ya.')
  await expect(friend.getByTestId('titip-from')).toBeFocused()
  await friend.getByTestId('titip-from').fill('Budi')
  await friend.getByRole('button', { name: 'Titip ke kotak' }).click()
  const dialog = friend.getByTestId('send-letter')
  await expect(dialog).toHaveAttribute('data-state', 'done', { timeout: 20_000 })
  await expect(friend.getByTestId('titip-done')).toContainText(
    'Dititip ke kotak "Ultah ke-20 Rani"',
  )
  await expect(friend.getByTestId('titip-box-link')).toHaveAttribute('href', links.invite)
  await friend.getByTestId('titip-box-link').click()
  await expect(friend.getByTestId('titip-mine')).toContainText('Selamat ulang tahun, Rani!')
  await expect(friend.getByTestId('titip-room')).toContainText('1 surat sudah masuk')

  // Teman kedua langsung lewat API, dengan foto.
  expect((await titipViaApi(request, links.invite, 'Sari', 'Kangen jalan bareng!')).status).toBe(
    200,
  )

  // Penerima sebelum kotak dibuka: tersegel, isinya belum dikirim.
  const slug = codeOf(links.open)
  const rani = await (await browser.newContext()).newPage()
  const opened = await rani.goto(links.open)
  expect(opened?.headers()['x-robots-tag']).toBe('noindex')
  await expect(rani.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /\/og-kotak\.jpg$/,
  )
  await expect(rani.getByTestId('box-sealed')).toBeVisible()
  await expect(rani.getByTestId('box-page')).toContainText('2 surat dari teman-temanmu')
  await expect(rani.getByTestId('folder-toggle')).toHaveAttribute('aria-label', /Disegel/)
  // Diketuk selagi disegel: foldernya bergoyang, tidak terbuka.
  await rani.getByTestId('folder-toggle').click({ force: true })
  await expect(rani.getByTestId('glass-folder')).toHaveAttribute('data-nudge', 'true')
  await expect(rani.getByTestId('glass-folder')).not.toHaveAttribute('data-open', /.*/)
  const before = await (await request.get(`/mock-api/k/${slug}`)).json()
  expect(before).toMatchObject({ openable: false, letterCount: 2, letters: [] })
  expect((await request.post(`/mock-api/k/${slug}/open`)).status()).toBe(409)

  // Pembuat melihat nama pengirimnya saja, lalu menekan Buka sekarang.
  await page.goto('/kotak')
  await page.getByTestId('my-box').click()
  await expect(page.getByTestId('box-entry')).toHaveText([/Dari Budi/, /Dari Sari.*2 foto/])
  page.once('dialog', (question) => question.accept())
  await page.getByTestId('box-open-now').click()
  await expect(page.getByTestId('box-manage-status')).toContainText('Sudah terbuka untuk Rani')
  await expect(page.getByTestId('box-open-now')).toHaveCount(0)
  // Link titip tidak ditawarkan lagi, dan pesannya tampil di dekat link untuk Rani.
  await expect(page.getByRole('heading', { name: 'Titipan sudah ditutup' })).toBeVisible()
  await expect(page.getByTestId('box-invite-url')).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Kirim link buka' })).toHaveText(
    'Kotak sudah terbuka. Kirim link buka ke Rani.',
  )

  // Penerima: kotak terbuka, surat dibaca satu per satu.
  await rani.reload()
  await expect(rani.getByTestId('box-hint')).toBeVisible()
  // POST /k/:slug/open yang pertama sengaja diputus, seperti gangguan sesaat yang pernah terlihat
  // di produksi. Klien mencobanya sekali lagi, jadi kotaknya tetap tercatat dibuka.
  let openCalls = 0
  await rani.route(
    (url) => /\/k\/[^/]+\/open$/.test(url.pathname),
    (route) => (++openCalls === 1 ? route.abort('failed') : route.continue()),
  )
  await rani.getByTestId('folder-toggle').click()
  await rani.getByTestId('box-read').click()
  const viewer = rani.getByTestId('letter-viewer')
  await expect(viewer.getByTestId('viewer-title')).toHaveText('Dari Budi')
  await expect(viewer.getByTestId('viewer-count')).toHaveText('Surat 1 dari 2')
  await shownCard(viewer)
    .getByRole('button', { name: /Surat dari Budi/ })
    .click()
  await expect(shownCard(viewer).getByTestId('letter-page')).toContainText(
    'Selamat ulang tahun, Rani!',
  )
  await expect(shownCard(viewer).getByTestId('letter-from')).toHaveText('Dari Budi')
  // Membuka surat pertama menandai kotak dibuka (hitungan 7 hari foto mulai).
  await expect
    .poll(async () => (await (await request.get(`/mock-api/k/${slug}`)).json()).openedAt)
    .not.toBeNull()
  expect(openCalls).toBe(2)
  await viewer.getByTestId('viewer-next').click()
  await expect(viewer.getByTestId('viewer-title')).toHaveText('Dari Sari')
  await shownCard(viewer)
    .getByRole('button', { name: /Surat dari Sari/ })
    .click()
  await expect(shownCard(viewer).getByTestId('letter-page')).toContainText('Kangen jalan bareng!')
  await expect(shownCard(viewer).locator('.letter-page img')).toHaveAttribute('src', /mock-api/)
  await viewer.getByRole('button', { name: 'Tutup', exact: true }).click()
  await expect(rani.getByTestId('box-read')).toHaveText('Baca lagi dari awal')

  // Unduh semua foto: di Android dan komputer langsung diunduh (foto depan dan foto isi Sari).
  const keep = rani.getByTestId('keep-box')
  if (browserName === 'chromium') {
    const names: string[] = []
    rani.on('download', (download) => names.push(download.suggestedFilename()))
    await keep.getByTestId('keep-box-download').click()
    await expect.poll(() => names.length).toBe(2)
    expect(names[0]).toMatch(/^postpocket-ultah-ke-20-rani-sari-\d\.jpg$/)
  }

  // Simpan semua: folder di Kotak surat dan satu CD di TV.
  await keep.getByTestId('keep-box-save').click()
  await expect(keep).toHaveAttribute('data-state', 'saved')
  await expect(keep).toContainText('CD "Ultah ke-20 Rani"')
  await keep.getByTestId('keep-box-tv').click()
  await expect(rani.getByTestId('tv-slideshow')).toBeVisible()
  await expect(rani.getByTestId('tv-counter')).toContainText('2')
  await rani.goto('/kotak')
  const folder = rani.getByTestId('saved-folder')
  await expect(folder.getByTestId('folder-toggle')).toHaveAccessibleName(
    'Buka Ultah ke-20 Rani, 2 surat',
  )

  // Pembuat yang membuka link penerima tidak diajak menyimpan dan tidak menandai kotak dibuka.
  await page.goto(links.open)
  await expect(page.getByTestId('own-box-note')).toBeVisible()
  await expect(page.getByTestId('keep-box')).toHaveCount(0)
  await friend.context().close()
  await rani.context().close()
})

test('titipan bisa ditarik dan dihapus, kotak yang sudah dibuka menolak titipan, lalu kotaknya dihapus', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(90_000)
  const links = await createBox(page, 'Perpisahan Dimas', 'Dimas')

  // Teman menitip lewat editor, lalu menariknya lagi dari halaman titip.
  const friend = await (await browser.newContext()).newPage()
  await friend.goto(`/letter/new?titip=${codeOf(links.invite)}`)
  await expect(friend.getByTestId('titip-banner')).toContainText('Perpisahan Dimas')
  await friend.getByRole('textbox', { name: 'Isi surat' }).fill('Salah tulis')
  await friend.getByTestId('titip-from').fill('Andi')
  await friend.getByRole('button', { name: 'Titip ke kotak' }).click()
  await expect(friend.getByTestId('send-letter')).toHaveAttribute('data-state', 'done', {
    timeout: 20_000,
  })
  await friend.goto(links.invite)
  const mine = friend.getByTestId('titip-mine')
  await expect(mine).toContainText('Salah tulis')
  friend.once('dialog', (question) => question.accept())
  await mine.getByRole('button', { name: 'Tarik' }).click()
  await expect(mine).toHaveCount(0)
  await expect(friend.getByTestId('titip-room')).toContainText('Belum ada surat yang masuk')

  // Pembuat menghapus titipan yang tidak pantas.
  await titipViaApi(request, links.invite, 'Iseng', 'Tidak pantas', false)
  await page.reload()
  await expect(page.getByTestId('box-entry')).toHaveText([/Dari Iseng/])
  page.once('dialog', (question) => question.accept())
  await page.getByTestId('box-entry').getByRole('button', { name: 'Hapus' }).click()
  await expect(page.getByTestId('box-entry')).toHaveCount(0)

  // Setelah dibuka, titipan baru ditolak. Teman yang sedang menulis tidak ditawari Coba lagi,
  // karena kotak yang sudah ditutup tidak akan menerimanya.
  await friend.goto(`/letter/new?titip=${codeOf(links.invite)}`)
  await expect(friend.getByTestId('titip-banner')).toContainText('Perpisahan Dimas')
  await friend.getByRole('textbox', { name: 'Isi surat' }).fill('Hampir telat')
  await friend.getByTestId('titip-from').fill('Andi')
  page.once('dialog', (question) => question.accept())
  await page.getByTestId('box-open-now').click()
  await expect(page.getByTestId('box-manage-status')).toContainText('Sudah terbuka')
  // Kotaknya dicek lagi tepat sebelum mengirim, jadi suratnya tidak sempat diunggah.
  await friend.getByRole('button', { name: 'Titip ke kotak' }).click()
  await expect(friend.getByTestId('letter-notice')).toContainText('Kotak ini sudah ditutup')
  await expect(friend.getByTestId('letter-notice')).toContainText('Batal titip')
  await expect(friend.getByTestId('send-letter')).toHaveCount(0)
  const late = await titipViaApi(request, links.invite, 'Telat', 'Telat', false)
  expect(late.status).toBe(422)
  expect(late.body.error.code).toBe('box_closed')
  await friend.goto(links.invite)
  await expect(friend.getByTestId('titip-closed')).toBeVisible()
  await expect(friend.getByTestId('titip-write')).toHaveCount(0)

  // Kotak dihapus: kedua link mati.
  page.once('dialog', (question) => question.accept())
  await page.getByTestId('box-delete').click()
  await expect(page).toHaveURL(/\/kotak$/)
  // Kotak surat memberi tahu kotaknya sudah terhapus, bukan diam-diam kembali ke sana.
  await expect(page.getByTestId('box-deleted')).toContainText('Perpisahan Dimas" sudah dihapus')
  await expect(page.getByTestId('my-box')).toHaveCount(0)
  expect((await friend.goto(links.open))?.status()).toBe(404)
  await expect(friend.getByTestId('box-missing')).toContainText('sudah tidak tersedia')
  expect((await friend.goto(links.invite))?.status()).toBe(404)
  await expect(friend.getByTestId('titip-missing')).toBeVisible()
  await friend.context().close()
})

test('kotak terjadwal tersegel sampai waktunya, jadwalnya bisa diubah atau dijadikan manual', async ({
  page,
  browser,
}) => {
  await page.goto('/kotak/baru')
  await page.getByTestId('box-to').fill('Nadia')
  await page.getByRole('radio', { name: 'Tanggal tertentu' }).click()
  // Jadwal bawaan: besok jam 19.00.
  await expect(page.getByTestId('box-opens')).toHaveValue(/T19:00$/)
  await page.getByTestId('box-create').click()
  await expect(page.getByTestId('box-manage-title')).toHaveText('Untuk Nadia')
  await expect(page.getByTestId('box-manage-status')).toContainText('Terbuka sendiri')
  const open = await page.getByTestId('box-open-url').inputValue()

  const nadia = await (await browser.newContext()).newPage()
  await nadia.goto(open)
  await expect(nadia.getByTestId('box-sealed')).toBeVisible()
  await expect(nadia.getByTestId('box-page')).toContainText('Bisa dibuka')
  await expect(nadia.getByTestId('folder-toggle')).toHaveAttribute('aria-label', /Dibuka /)

  // Jadwal diubah, lalu dikembalikan ke manual.
  await page.getByTestId('box-schedule').click()
  const input = page.getByTestId('box-schedule-input')
  const later = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  const pad = (value: number) => String(value).padStart(2, '0')
  await input.fill(
    `${later.getFullYear()}-${pad(later.getMonth() + 1)}-${pad(later.getDate())}T08:30`,
  )
  await page.getByRole('button', { name: 'Simpan jadwal' }).click()
  await expect(page.getByText(/^Kotak terbuka sendiri/)).toBeVisible()
  await page.getByRole('button', { name: 'Buka manual saja' }).click()
  await expect(page.getByTestId('box-manage-status')).toContainText('Kamu yang membukanya')
  await nadia.reload()
  await expect(nadia.getByTestId('folder-toggle')).toHaveAttribute('aria-label', /Disegel/)
  await nadia.context().close()
})

test('jadwal yang salah: kotak yang sudah terbuka bisa dijadwal ulang selama penerima belum membukanya', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000)
  const links = await createBox(page, 'Ultah ke-23 Shelvia', 'Shelvia')
  const slug = codeOf(links.open)
  expect((await titipViaApi(request, links.invite, 'Budi', 'Selamat ya', false)).status).toBe(200)

  // Kotaknya terbuka terlalu cepat. Penerima belum membukanya, jadi jadwalnya belum terkunci.
  page.once('dialog', (question) => question.accept())
  await page.getByTestId('box-open-now').click()
  const status = page.getByTestId('box-manage-status')
  await expect(status).toContainText('Sudah terbuka untuk Shelvia, tapi dia belum membukanya')
  await expect(page.getByRole('heading', { name: 'Titipan sudah ditutup' })).toBeVisible()
  await expect(page.getByTestId('box-schedule-section')).toContainText('jadwalkan ulang')
  await expect(page.getByTestId('box-open-now')).toHaveCount(0)

  // Dijadwal ulang: tersegel lagi untuk penerima, dan teman-teman bisa menitip lagi.
  await page.getByTestId('box-schedule').filter({ hasText: 'Jadwalkan ulang' }).click()
  const later = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
  const pad = (value: number) => String(value).padStart(2, '0')
  await page
    .getByTestId('box-schedule-input')
    .fill(`${later.getFullYear()}-${pad(later.getMonth() + 1)}-${pad(later.getDate())}T23:59`)
  await page.getByRole('button', { name: 'Simpan jadwal' }).click()
  await expect(page.getByText(/^Kotak tersegel lagi dan terbuka sendiri/)).toBeVisible()
  await expect(status).toContainText('Terbuka sendiri')
  await expect(page.getByTestId('box-invite-url')).toHaveValue(links.invite)
  expect(await (await request.get(`/mock-api/k/${slug}`)).json()).toMatchObject({
    openable: false,
    letterCount: 1,
    letters: [],
  })
  expect((await titipViaApi(request, links.invite, 'Sari', 'Susulan', false)).status).toBe(200)

  // Setelah penerima membukanya, jadwalnya terkunci. Halaman pembuat yang belum dimuat ulang
  // diberi tahu saat mencoba, lalu bagian jadwalnya hilang.
  page.once('dialog', (question) => question.accept())
  await page.getByTestId('box-open-now').click()
  await expect(status).toContainText('dia belum membukanya')
  expect((await request.post(`/mock-api/k/${slug}/open`)).status()).toBe(200)
  await page.getByTestId('box-schedule').click()
  await page.getByRole('button', { name: 'Simpan jadwal' }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Shelvia sudah membuka kotaknya, jadi jadwalnya tidak bisa diubah lagi.',
  )
  await expect(status).toContainText('sudah dibuka')
  await expect(page.getByTestId('box-schedule-section')).toHaveCount(0)
})

test('kipas surat di folder yang terbuka tidak menutupi judul dan tidak membuat halaman bergeser', async ({
  page,
  browser,
  request,
}) => {
  const links = await createBox(page, 'Wisuda Bima', 'Bima')
  for (const name of ['Ayu', 'Bayu', 'Citra', 'Doni']) {
    expect((await titipViaApi(request, links.invite, name, 'Selamat!', false)).status).toBe(200)
  }
  page.once('dialog', (question) => question.accept())
  await page.getByTestId('box-open-now').click()
  await expect(page.getByTestId('box-manage-status')).toContainText('Sudah terbuka')

  // Layar HP sempit: empat lembar di kipas, paling lebar ke kanan.
  const bima = await (await browser.newContext({ viewport: { width: 360, height: 780 } })).newPage()
  await bima.goto(links.open)
  await bima.getByTestId('folder-toggle').click()
  await expect(bima.getByTestId('glass-folder')).toHaveAttribute('data-open', 'true')
  // Tunggu kipasnya selesai menyebar (animasi tanpa akhir, kalau ada, diabaikan).
  await bima.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== 'running' ||
          animation.effect?.getComputedTiming().endTime === Infinity,
      ),
  )
  const layout = await bima.evaluate(() => {
    const title = document.querySelector('h1')!.getBoundingClientRect()
    const sheets = [...document.querySelectorAll('.gf-sheet')].map((sheet) =>
      sheet.getBoundingClientRect(),
    )
    return {
      sheets: sheets.length,
      gap: Math.min(...sheets.map((sheet) => sheet.top)) - title.bottom,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }
  })
  expect(layout.sheets).toBe(4)
  expect(layout.gap).toBeGreaterThanOrEqual(0)
  expect(layout.overflow).toBeLessThanOrEqual(0)
  await bima.context().close()
})

test('kotak yang penuh menolak titipan berikutnya', async ({ page, request }) => {
  test.setTimeout(60_000)
  const links = await createBox(page, 'Kotak ramai', 'Tia')
  for (let i = 0; i < 20; i++) {
    expect((await titipViaApi(request, links.invite, `Teman ${i + 1}`, 'Halo', false)).status).toBe(
      200,
    )
  }
  const extra = await titipViaApi(request, links.invite, 'Teman 21', 'Halo', false)
  expect(extra.status).toBe(422)
  expect(extra.body.error.code).toBe('box_full')
  await page.goto(links.invite)
  await expect(page.getByTestId('titip-room')).toHaveText(
    'Kotak ini sudah penuh (20 surat), jadi titipan baru tidak muat lagi.',
  )
  await expect(page.getByTestId('titip-write')).toHaveCount(0)
  // Bukan jalan buntu: masih bisa menulis surat sendiri lewat link.
  await expect(page.getByRole('link', { name: 'Tulis surat sendiri' })).toHaveAttribute(
    'href',
    '/letter/new',
  )
  // Editor yang dibuka lewat link titip lama langsung memberi tahu, sebelum suratnya ditulis.
  await page.goto(`/letter/new?titip=${codeOf(links.invite)}`)
  await expect(page.getByTestId('letter-notice')).toContainText('sudah penuh (20 surat)')
  await expect(page.getByTestId('titip-banner')).toHaveCount(0)
  // Pembuatnya juga diberi tahu kotaknya penuh.
  await page.goto('/kotak')
  await page.getByTestId('my-box').click()
  await expect(page.getByTestId('box-room')).toContainText('Kotaknya sudah penuh (20 surat)')
})

/** Titipan dengan foto depan dan `photos` foto isi (paling banyak 4), lewat mock API. */
async function titipWithPhotos(
  request: APIRequestContext,
  invite: string,
  from: string,
  photos: number,
) {
  const meta = { type: 'image/jpeg', width: 32, height: 24, size: jpeg.length }
  const keys = Array.from({ length: photos }, (_, i) => `f${i + 1}`)
  const created = await (
    await request.post('/mock-api/letters', {
      data: {
        design: {
          illustration: 'upload',
          shape: 'portrait',
          foilMode: 'detail',
          foilBorder: true,
          foilColor: 'gold',
          paper: 'blush',
          template: 'photo-1',
        },
        content: {
          version: 1,
          elements: keys.map((key, i) => ({
            kind: 'photo',
            id: `p${i + 1}`,
            x: 0.5,
            y: 0.2 + i * 0.15,
            width: 0.4,
            rotation: 0,
            photo: key,
            aspect: 1.25,
          })),
        },
        cover: meta,
        photos: keys.map((key) => ({ key, ...meta })),
        og: null,
        replyTo: null,
        box: { invite: codeOf(invite), from },
      },
    })
  ).json()
  for (const target of [created.uploads.cover, ...keys.map((key) => created.uploads.photos[key])]) {
    await request.put(target.signedUrl, { headers: { 'content-type': 'image/jpeg' }, data: jpeg })
  }
  const published = await request.post(`/mock-api/letters/${created.id}/publish`, {
    headers: { 'x-edit-token': created.editToken },
  })
  expect(published.status()).toBe(200)
}

test('kotak yang fotonya penuh: teman diberi tahu sebelum menulis, surat berfoto ditahan sebelum diunggah', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(90_000)
  const links = await createBox(page, 'Album angkatan', 'Bu Rina')
  // 8 titipan × 5 foto (foto depan dan 4 foto isi) = 40 foto, suratnya baru 8 dari 20.
  for (let i = 0; i < 8; i++) await titipWithPhotos(request, links.invite, `Murid ${i + 1}`, 4)
  await page.reload()
  await expect(page.getByTestId('box-room')).toContainText('Fotonya sudah penuh (40 foto)')
  await expect(page.getByTestId('box-room')).toContainText('Masih muat 12 surat, asal tanpa foto')

  const friend = await (await browser.newContext()).newPage()
  await friend.goto(links.invite)
  await expect(friend.getByTestId('titip-room')).toContainText(
    'Masih muat 12 surat, tapi fotonya sudah penuh: suratmu hanya bisa masuk tanpa foto.',
  )
  await expect(friend.getByText('Mau pakai strip foto Booth?')).toHaveCount(0)
  await expect(friend.getByTestId('titip-photos-note')).toContainText('dihapus 7 hari')

  await friend.getByTestId('titip-write').click()
  const banner = friend.getByTestId('titip-banner')
  await expect(banner.getByTestId('titip-room-left')).toContainText(
    'Foto di kotak ini sudah penuh, jadi suratmu hanya bisa masuk tanpa foto.',
  )
  await friend.getByTestId('titip-from').fill('Sari')
  await friend.getByRole('textbox', { name: 'Isi surat' }).fill('Terima kasih, Bu')
  // Foto depan dari galeri juga dihitung foto kotak.
  await friend.getByTestId('front-upload').setInputFiles({
    name: 'foto.jpg',
    mimeType: 'image/jpeg',
    buffer: jpeg,
  })
  const warning = banner.getByTestId('titip-room-warning')
  await expect(warning).toContainText('Suratmu punya 1 foto (termasuk gambar depan)')
  await friend.getByRole('button', { name: 'Titip ke kotak' }).click()
  await expect(warning).toBeFocused()
  await expect(friend.getByTestId('send-letter')).toHaveCount(0)
  await friend.context().close()
})

test('Kotak surat: folder yang diketuk tetap di tempatnya saat folder di atasnya menutup', async ({
  page,
  request,
  isMobile,
}) => {
  test.skip(!isMobile, 'Di layar lebar foldernya bersebelahan, jadi tidak saling menggeser')
  test.setTimeout(90_000)
  // Folder kotak bareng: kotaknya dibuka lalu Simpan semua.
  const box = await (
    await request.post('/mock-api/boxes', {
      data: { title: 'Ultah Rani', to: 'Rani', design: 'senja', opensAt: null },
    })
  ).json()
  for (const name of ['Budi', 'Citra', 'Dewi']) {
    await titipViaApi(request, box.inviteUrl, name, `Dari ${name}`, false)
  }
  await request.patch(`/mock-api/boxes/${box.id}`, {
    headers: { 'x-edit-token': box.editToken },
    data: { openNow: true },
  })
  await page.goto(`/k/${box.slug}`)
  await page.getByTestId('keep-box-save').click()
  await expect(page.getByTestId('keep-box')).toHaveAttribute('data-state', 'saved')
  // Folder Surat untukmu dari surat lewat link.
  const created = await (
    await request.post('/mock-api/letters', {
      data: {
        design: {
          illustration: 'meadow',
          shape: 'portrait',
          foilMode: 'design',
          foilBorder: false,
          foilColor: 'gold',
          paper: 'cream',
          template: 'photo-1',
        },
        content: {
          version: 1,
          elements: [
            {
              kind: 'text',
              id: 't1',
              x: 0.5,
              y: 0.5,
              width: 0.8,
              rotation: 0,
              text: 'Halo',
              size: 0.07,
              align: 'center',
            },
          ],
        },
        cover: null,
        photos: [],
        og: { type: 'image/jpeg', width: 1200, height: 630, size: jpeg.length },
        replyTo: null,
      },
    })
  ).json()
  await request.put(created.uploads.og.signedUrl, {
    headers: { 'content-type': 'image/jpeg' },
    data: jpeg,
  })
  const published = await (
    await request.post(`/mock-api/letters/${created.id}/publish`, {
      headers: { 'x-edit-token': created.editToken },
    })
  ).json()
  await page.goto(`/l/${published.slug}`)
  await page.getByRole('button', { name: /Surat untukmu/ }).click()
  await page.getByTestId('keep-save').click()
  await expect(page.getByTestId('keep-letter')).toHaveAttribute('data-state', 'saved')

  await page.goto('/kotak')
  const folders = page.getByTestId('saved-folder')
  await expect(folders).toHaveCount(2)
  await folders.nth(0).getByTestId('folder-toggle').click()
  await expect(folders.nth(0).getByTestId('folder-actions')).toBeVisible()
  // Folder bawah di dekat atas layar: tanpa penahan gulir, ia terlempar ke atas layar.
  await folders.nth(1).evaluate((el) => el.scrollIntoView({ block: 'start' }))
  // Posisi folder bawah di setiap frame selama folder atas menutup dan folder bawah membuka.
  const run = await page.evaluate(async () => {
    const lower = document.querySelectorAll<HTMLElement>('[data-testid="saved-folder"]')[1]!
    const before = lower.getBoundingClientRect().top
    lower.querySelector<HTMLElement>('[data-testid="folder-toggle"]')!.click()
    const tops: number[] = []
    const start = performance.now()
    await new Promise<void>((resolve) => {
      const sample = () => {
        tops.push(lower.getBoundingClientRect().top)
        if (performance.now() - start < 1000) requestAnimationFrame(sample)
        else resolve()
      }
      requestAnimationFrame(sample)
    })
    return { before, tops, scrollY: window.scrollY }
  })
  await expect(folders.nth(0).getByTestId('folder-actions')).toHaveCount(0)
  await expect(folders.nth(1).getByTestId('folder-actions')).toBeVisible()
  // Tidak pernah terlempar ke atas layar. Selama halamannya masih bisa digulir, folder yang
  // diketuk diam di tempatnya; kalau sudah di paling atas, folder itu hanya naik ke tempatnya.
  expect(Math.min(...run.tops)).toBeGreaterThanOrEqual(-1)
  const after = run.tops.at(-1)!
  if (run.scrollY > 0) expect(Math.abs(after - run.before)).toBeLessThan(4)
  else expect(after).toBeLessThanOrEqual(run.before + 1)
})

test('link kotak dan link titip yang salah memberi 404 yang jelas', async ({ page }) => {
  const box = await page.goto('/k/AAAAAAAAAA')
  expect(box?.status()).toBe(404)
  await expect(page.getByTestId('box-missing')).toContainText('sudah tidak tersedia')
  const invite = await page.goto('/titip/AAAAAAAAAAAA')
  expect(invite?.status()).toBe(404)
  await expect(page.getByTestId('titip-missing')).toContainText('sudah tidak tersedia')
  // Pengelola kotak yang dibuat di browser lain tidak bisa dibuka dari sini.
  await page.goto('/kotak/00000000-0000-4000-8000-000000000000')
  await expect(page.getByTestId('box-manage-missing')).toContainText(
    'tidak tercatat di browser ini',
  )
})

test('strip Booth yang dipakai di surat tetap dititip ke kotak', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Kamera palsu hanya ada di Chromium')
  test.setTimeout(60_000)
  const links = await createBox(page, 'Kado Raka', 'Raka')
  await page.goto(`/letter/new?titip=${codeOf(links.invite)}`)
  await page.getByTestId('titip-from').fill('Lala')
  await page.getByTestId('titip-booth').click()
  await page.getByRole('radio', { name: 'Satu foto' }).click()
  const record = page.getByTestId('booth-record')
  await expect(record).toBeEnabled({ timeout: 10_000 })
  await record.click()
  await expect(page.getByTestId('booth-result')).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Pakai di surat' }).click()
  await expect(page).toHaveURL(/\/letter\/new$/)
  await expect(page.getByTestId('titip-banner')).toContainText('Kado Raka')
  await expect(page.getByTestId('titip-from')).toHaveValue('Lala')
  await expect(page.getByTestId('letter-page').locator('[data-kind="photo"] img')).toHaveAttribute(
    'src',
    /^blob:/,
  )
  await page.getByRole('button', { name: 'Titip ke kotak' }).click()
  await expect(page.getByTestId('send-letter')).toHaveAttribute('data-state', 'done', {
    timeout: 20_000,
  })
  await expect(page.getByTestId('titip-done')).toContainText('Kado Raka')
})

test('nama pengirim yang panjang tidak melebarkan daftar surat', async ({ page, request }) => {
  test.setTimeout(60_000)
  const box = await (
    await request.post('/mock-api/boxes', {
      data: { title: 'Perpisahan kantor', to: 'Bu Ratna', design: 'laut', opensAt: null },
    })
  ).json()
  for (let i = 1; i <= 5; i++) {
    const from = `Muhammad Rizky Ramadhan Pratama Putra ${i}`
    expect((await titipViaApi(request, box.inviteUrl, from, 'Terima kasih', false)).status).toBe(
      200,
    )
  }
  await request.patch(`/mock-api/boxes/${box.id}`, {
    headers: { 'x-edit-token': box.editToken },
    data: { openNow: true },
  })

  /** Daftar surat yang terlihat tidak melewati tepi layar, dan isinya tidak terpotong ke samping. */
  async function listFits(list: Locator) {
    const fit = await list.evaluate((el) => ({
      right: el.getBoundingClientRect().right,
      viewport: window.innerWidth,
      overflow: el.scrollWidth - el.clientWidth,
    }))
    expect(fit.right).toBeLessThanOrEqual(fit.viewport)
    expect(fit.overflow).toBeLessThanOrEqual(0)
  }

  await page.goto(`/k/${box.slug}`)
  await page.getByTestId('folder-toggle').click()
  await expect(page.getByTestId('box-read')).toBeVisible()
  await listFits(page.getByRole('list', { name: 'Semua surat di kotak' }))

  await page.getByTestId('keep-box-save').click()
  await expect(page.getByTestId('keep-box')).toHaveAttribute('data-state', 'saved')
  await page.getByTestId('keep-box-open').click()
  const folder = page.getByTestId('saved-folder')
  await expect(folder.getByTestId('folder-toggle')).toHaveAttribute('aria-expanded', 'true')
  await listFits(folder.getByTestId('folder-actions').locator('ol'))
})
