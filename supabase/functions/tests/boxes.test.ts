// Test integrasi kotak bareng (kontrak 0.3.0) terhadap stack Supabase lokal. Urutannya sama
// dengan e2e/mock-api.spec.ts di frontend, plus batas kotak dan dua publish bersamaan. Butuh
// secret key untuk mengisi kotak sampai hampir penuh langsung di database:
//
//   API_URL=http://127.0.0.1:54321 PUBLISHABLE_KEY=… SECRET_KEY=… deno test -A tests/boxes.test.ts
//
// Tanpa SECRET_KEY test ini dilewati.

import { assert, assertEquals, assertMatch } from '@std/assert'
import { createClient } from '@supabase/supabase-js'
import { bytea, sha256 } from '../_shared/token.ts'
import { letterFixture } from './fixtures.ts'

const API = Deno.env.get('API_URL') ?? ''
const KEY = Deno.env.get('PUBLISHABLE_KEY') ?? ''
const SECRET = Deno.env.get('SECRET_KEY') ?? ''
const ORIGIN = 'https://postpocket.vercel.app'
const ignore = !API || !SECRET

const admin = () => createClient(API, SECRET, { auth: { persistSession: false } })
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.2`

async function call(
  method: string,
  path: string,
  options: { body?: unknown; token?: string; ip?: string } = {},
) {
  const headers: Record<string, string> = {
    apikey: KEY,
    origin: ORIGIN,
    'x-forwarded-for': options.ip ?? ip(),
  }
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  if (options.token) headers['x-edit-token'] = options.token
  const response = await fetch(`${API}/functions/v1${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

async function upload(target: { signedUrl: string }, file: Uint8Array<ArrayBuffer>) {
  const response = await fetch(target.signedUrl, {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg', 'x-upsert': 'false' },
    body: file,
  })
  await response.body?.cancel()
  assert(response.ok, `upload gagal: ${response.status}`)
}

interface CreatedBox {
  id: string
  editToken: string
  slug: string
  invite: string
  url: string
  inviteUrl: string
  title: string
  to: string
  scheduled: boolean
  openable: boolean
  createdAt: string
  opensAt: string
  expiresAt: string
  limits: { letters: number; photos: number }
}

async function newBox(opensAt: string | null = null): Promise<CreatedBox> {
  const created = await call('POST', '/boxes', {
    body: { title: '  Ultah Rani ', to: 'Rani', design: 'par-avion', opensAt },
  })
  assertEquals(created.status, 201, JSON.stringify(created.body))
  return created.body
}

/** Draf titipan berfoto satu, sudah diunggah. */
async function draftEntry(invite: string, from = 'Budi') {
  const { body, files } = letterFixture()
  const created = await call('POST', '/letters', {
    body: { ...body, og: null, box: { invite, from } },
  })
  if (created.status !== 201) return { created, publish: null }
  await upload(created.body.uploads.photos.p1, files.photo)
  const publish = () =>
    call('POST', `/letters/${created.body.id}/publish`, { token: created.body.editToken })
  return { created, publish }
}

/** Titipan yang sudah terbit, dibuat langsung di database (tanpa berkas) untuk mengisi kotak. */
async function fillBox(boxId: string, count: number) {
  for (let i = 0; i < count; i++) {
    const id = crypto.randomUUID()
    const created = await admin().rpc('create_letter', {
      p_id: id,
      p_design: {},
      p_content: { version: 1, elements: [] },
      p_edit_token_hash: bytea(await sha256(crypto.randomUUID())),
      p_reply_to_id: null,
      p_assets: [],
      p_box_id: boxId,
      p_from_name: `Isi ${i}`,
    })
    assert(!created.error, created.error?.message)
    const published = await admin().rpc('publish_letter', {
      p_id: id,
      p_slug: `Isi${String(i).padStart(2, '0')}${
        crypto.randomUUID().replace(/-/g, '').slice(0, 5)
      }`,
      p_sizes: {},
    })
    assert(!published.error, published.error?.message)
  }
}

Deno.test({
  name: 'kotak bareng: buat, titip, tersegel, buka sekarang, baca, buka, hapus',
  ignore,
  async fn() {
    const box = await newBox()
    assertEquals([box.title, box.to, box.scheduled, box.openable], [
      'Ultah Rani',
      'Rani',
      false,
      false,
    ])
    assertEquals(box.url, `${ORIGIN}/k/${box.slug}`)
    assertEquals(box.inviteUrl, `${ORIGIN}/titip/${box.invite}`)
    assertMatch(box.invite, /^[A-Za-z0-9]{12}$/)
    assertEquals(box.limits, { letters: 20, photos: 40 })
    assertEquals(Date.parse(box.expiresAt) - Date.parse(box.opensAt), 30 * 86400_000)

    const invite = await call('GET', `/boxes/invite/${box.invite}`)
    assertEquals([invite.status, invite.body.closed, invite.body.usage], [200, false, {
      letters: 0,
      photos: 0,
    }])

    // Titip: tanpa OG, link-nya link titip kotak.
    const entry = await draftEntry(box.invite, '  Budi ')
    assertEquals(entry.created.body.uploads.og, null)
    const published = await entry.publish!()
    assertEquals(published.status, 200, JSON.stringify(published.body))
    assertEquals(published.body.url, box.inviteUrl)
    assertEquals(published.body.expiresAt, box.expiresAt)
    assertEquals(published.body.box, {
      title: 'Ultah Rani',
      to: 'Rani',
      opensAt: box.opensAt,
      scheduled: false,
    })

    // Surat titipan tidak ada di /l/{slug} dan tidak bisa dibalas.
    const slug = published.body.slug
    assertEquals((await call('GET', `/l/${slug}`)).status, 404)
    assertEquals((await call('POST', `/l/${slug}/open`)).status, 404)
    const { body: letter } = letterFixture()
    const reply = await call('POST', '/letters', { body: { ...letter, replyTo: slug } })
    assertEquals([reply.status, reply.body.error.code], [422, 'reply_not_found'])

    // Penerima sebelum waktunya: tersegel, jumlah terlihat.
    const sealed = await call('GET', `/k/${box.slug}`)
    assertEquals(
      [sealed.status, sealed.body.openable, sealed.body.letterCount, sealed.body.letters],
      [200, false, 1, []],
    )
    const early = await call('POST', `/k/${box.slug}/open`)
    assertEquals([early.status, early.body.error.code], [409, 'box_not_open'])

    // Pembuat: daftar nama pengirim tanpa isi.
    const managed = await call('GET', `/boxes/${box.id}`, { token: box.editToken })
    assertEquals(managed.body.usage, { letters: 1, photos: 1 })
    assertEquals(managed.body.letters.map((item: { from: string }) => item.from), ['Budi'])
    assertEquals(managed.body.letters[0].content, undefined)
    assertEquals((await call('GET', `/boxes/${box.id}`, { token: 'salah' })).status, 401)
    const wrongId = await call('GET', '/boxes/bukan-uuid', { token: box.editToken })
    assertEquals([wrongId.status, wrongId.body.error.code], [404, 'box_not_found'])

    // Buka sekarang memakai jam server, lalu kotak tertutup untuk titipan. Selama penerima belum
    // membukanya, pembuat masih bisa mengubahnya; Buka sekarang lagi tidak menggeser waktunya.
    const opened = await call('PATCH', `/boxes/${box.id}`, {
      token: box.editToken,
      body: { openNow: true },
    })
    assertEquals([opened.status, opened.body.openable, opened.body.scheduled], [200, true, true])
    const renamed = await call('PATCH', `/boxes/${box.id}`, {
      token: box.editToken,
      body: { title: 'Ultah ke-20 Rani', openNow: true },
    })
    assertEquals([renamed.status, renamed.body.title, renamed.body.opensAt], [
      200,
      'Ultah ke-20 Rani',
      opened.body.opensAt,
    ])
    const lateEntry = await draftEntry(box.invite)
    assertEquals([lateEntry.created.status, lateEntry.created.body.error.code], [
      422,
      'box_closed',
    ])
    const closed = await call('GET', `/boxes/invite/${box.invite}`)
    assertEquals(closed.body.closed, true)

    // Penerima membaca isi dan fotonya, lalu menandai dibuka (idempoten).
    const recipient = await call('GET', `/k/${box.slug}`)
    assertEquals(recipient.body.openable, true)
    assertEquals(recipient.body.letters[0].from, 'Budi')
    assertEquals(recipient.body.letters[0].content, letter.content)
    const photo = await fetch(recipient.body.letters[0].photos.p1.url)
    await photo.body?.cancel()
    assert(photo.ok, 'foto titipan bisa dimuat penerima')
    const first = await call('POST', `/k/${box.slug}/open`)
    assertEquals(first.status, 200, JSON.stringify(first.body))
    assertEquals(
      Date.parse(first.body.photosExpireAt) - Date.parse(first.body.openedAt),
      7 * 86400_000,
    )
    const again = await call('POST', `/k/${box.slug}/open`)
    assertEquals(again.body.openedAt, first.body.openedAt)

    // Setelah penerima membukanya, kotak tidak bisa diubah lagi.
    const late = await call('PATCH', `/boxes/${box.id}`, {
      token: box.editToken,
      body: { opensAt: new Date(Date.now() + 86400_000).toISOString() },
    })
    assertEquals([late.status, late.body.error.code], [409, 'box_closed'])

    // Pengirim menarik titipannya lagi, juga setelah kotak dibuka.
    const pulled = await call('DELETE', `/letters/${entry.created.body.id}`, {
      token: entry.created.body.editToken,
    })
    assertEquals(pulled.status, 204)
    assertEquals((await call('GET', `/k/${box.slug}`)).body.letterCount, 0)

    // Hapus kotak: kedua link mati.
    assertEquals((await call('DELETE', `/boxes/${box.id}`, { token: box.editToken })).status, 204)
    assertEquals((await call('GET', `/k/${box.slug}`)).body.error.code, 'box_not_found')
    assertEquals((await call('GET', `/boxes/invite/${box.invite}`)).status, 404)
  },
})

Deno.test({
  name: 'kotak bareng: jadwal, hapus titipan oleh pembuat, hapus kotak beserta draf',
  ignore,
  async fn() {
    const tomorrow = new Date(Date.now() + 86400_000).toISOString()
    const box = await newBox(tomorrow)
    assertEquals([box.scheduled, box.opensAt], [true, tomorrow])

    const entry = await draftEntry(box.invite)
    assertEquals((await entry.publish!()).status, 200)
    const draft = await draftEntry(box.invite, 'Draf')

    // Jadwal digeser: masa berlaku kotak dan titipannya ikut.
    const later = new Date(Date.now() + 3 * 86400_000).toISOString()
    const moved = await call('PATCH', `/boxes/${box.id}`, {
      token: box.editToken,
      body: { opensAt: later, to: ' Bima ' },
    })
    assertEquals([moved.status, moved.body.opensAt, moved.body.to], [200, later, 'Bima'])
    const row = await admin().from('letters').select('expires_at').eq(
      'id',
      entry.created.body.id,
    ).single()
    assertEquals(new Date(row.data!.expires_at).toISOString(), moved.body.expiresAt)

    const manual = await call('PATCH', `/boxes/${box.id}`, {
      token: box.editToken,
      body: { opensAt: null },
    })
    assertEquals(manual.body.scheduled, false)
    assertEquals(
      Date.parse(manual.body.opensAt) - Date.parse(manual.body.createdAt),
      30 * 86400_000,
    )

    for (
      const body of [
        { opensAt: new Date(Date.now() - 60_000).toISOString() },
        { opensAt: new Date(Date.now() + 40 * 86400_000).toISOString() },
        { openNow: true, opensAt: null },
        { design: 'nggak-ada' },
      ]
    ) {
      const rejected = await call('PATCH', `/boxes/${box.id}`, { token: box.editToken, body })
      assertEquals(
        [rejected.status, rejected.body.error.code],
        [422, 'invalid_box'],
        JSON.stringify(body),
      )
    }

    // Jadwal yang salah: kotak yang sudah terbuka tapi belum dibuka penerima masih bisa dijadwal
    // ulang. Kotaknya tersegel lagi untuk penerima, dan titipan diterima lagi.
    const opened = await call('PATCH', `/boxes/${box.id}`, {
      token: box.editToken,
      body: { openNow: true },
    })
    assertEquals(opened.body.openable, true)
    assertEquals((await call('GET', `/boxes/invite/${box.invite}`)).body.closed, true)
    const resealed = await call('PATCH', `/boxes/${box.id}`, {
      token: box.editToken,
      body: { opensAt: later },
    })
    assertEquals([resealed.status, resealed.body.openable, resealed.body.opensAt], [
      200,
      false,
      later,
    ])
    assertEquals((await call('GET', `/boxes/invite/${box.invite}`)).body.closed, false)
    const sealed = await call('GET', `/k/${box.slug}`)
    assertEquals([sealed.body.openable, sealed.body.letters], [false, []])
    const reopened = await draftEntry(box.invite, 'Susulan')
    assertEquals(reopened.created.status, 201)

    // Pembuat menghapus satu titipan.
    const unknown = await call('DELETE', `/boxes/${box.id}/letters/${crypto.randomUUID()}`, {
      token: box.editToken,
    })
    assertEquals([unknown.status, unknown.body.error.code], [404, 'box_not_found'])
    const removed = await call('DELETE', `/boxes/${box.id}/letters/${entry.created.body.id}`, {
      token: box.editToken,
    })
    assertEquals(removed.status, 204)
    assertEquals((await call('GET', `/boxes/${box.id}`, { token: box.editToken })).body.usage, {
      letters: 0,
      photos: 0,
    })

    // Hapus kotak ikut menghapus draf titipan, jadi publish draf itu 404.
    assertEquals((await call('DELETE', `/boxes/${box.id}`, { token: box.editToken })).status, 204)
    assertEquals((await draft.publish!()).status, 404)
  },
})

Deno.test({
  name: 'kotak bareng: penuh di 20 surat, dua publish bersamaan di batas terakhir',
  ignore,
  async fn() {
    const box = await newBox()
    await fillBox(box.id, 19)
    const a = await draftEntry(box.invite, 'A')
    const b = await draftEntry(box.invite, 'B')
    assertEquals([a.created.status, b.created.status], [201, 201])
    const results = await Promise.all([a.publish!(), b.publish!()])
    assertEquals(results.map((r) => r.status).sort(), [200, 422])
    const loser = results.find((r) => r.status === 422)!
    assertEquals(loser.body.error.code, 'box_full')

    const full = await draftEntry(box.invite, 'C')
    assertEquals([full.created.status, full.created.body.error.code], [422, 'box_full'])
    assertEquals((await call('GET', `/boxes/invite/${box.invite}`)).body.usage.letters, 20)

    assertEquals((await call('DELETE', `/boxes/${box.id}`, { token: box.editToken })).status, 204)
  },
})

Deno.test({
  name: 'kotak bareng: validasi, kode titip salah, dan rate limit 5 kotak per jam',
  ignore,
  async fn() {
    const base = { title: 'X', to: 'Y', design: 'laut', opensAt: null }
    const cases: [unknown, number, string][] = [
      [{ ...base, design: 'nggak-ada' }, 422, 'invalid_box'],
      [{ ...base, opensAt: new Date(Date.now() - 60_000).toISOString() }, 422, 'invalid_box'],
      [
        { ...base, opensAt: new Date(Date.now() + 31 * 86400_000).toISOString() },
        422,
        'invalid_box',
      ],
      [{ ...base, title: '   ' }, 400, 'invalid_request'],
      [{ ...base, title: 'x'.repeat(41) }, 400, 'invalid_request'],
      // Body kotak di atas 4 KB ditolak sebelum diparse.
      [{ ...base, title: 'x'.repeat(5000) }, 400, 'invalid_request'],
    ]
    for (const [body, status, code] of cases) {
      const result = await call('POST', '/boxes', { body })
      assertEquals([result.status, result.body.error.code], [status, code], JSON.stringify(body))
    }

    const { body: letter } = letterFixture()
    const missing = await call('POST', '/letters', {
      body: { ...letter, og: null, box: { invite: 'TidakAda1234', from: 'Budi' } },
    })
    assertEquals([missing.status, missing.body.error.code], [422, 'box_not_found'])
    for (const path of ['/boxes/invite/pendek', '/k/pendek', '/boxes/invite/TidakAda1234']) {
      const result = await call('GET', path)
      assertEquals([result.status, result.body.error.code], [404, 'box_not_found'], path)
    }

    const same = ip()
    const ids: { id: string; editToken: string }[] = []
    for (let i = 0; i < 5; i++) {
      const result = await call('POST', '/boxes', { body: base, ip: same })
      assertEquals(result.status, 201)
      ids.push(result.body)
    }
    const limited = await call('POST', '/boxes', { body: base, ip: same })
    assertEquals([limited.status, limited.body.error.code], [429, 'rate_limited'])
    for (const box of ids) await call('DELETE', `/boxes/${box.id}`, { token: box.editToken })
  },
})

Deno.test({
  name: 'kotak bareng: titipan 30 per jam per IP, terpisah dari surat biasa',
  ignore,
  async fn() {
    const box = await newBox()
    const same = ip()
    const { body } = letterFixture()
    const entry = { ...body, og: null, box: { invite: box.invite, from: 'Budi' } }
    // 10 surat biasa dari IP yang sama tidak memakai jatah titipan.
    for (let i = 0; i < 10; i++) {
      assertEquals((await call('POST', '/letters', { body, ip: same })).status, 201)
    }
    for (let i = 0; i < 30; i++) {
      assertEquals((await call('POST', '/letters', { body: entry, ip: same })).status, 201)
    }
    const limited = await call('POST', '/letters', { body: entry, ip: same })
    assertEquals([limited.status, limited.body.error.code], [429, 'rate_limited'])
    assertEquals((await call('DELETE', `/boxes/${box.id}`, { token: box.editToken })).status, 204)
  },
})
