import { randomBytes, randomUUID } from 'node:crypto'
import { kotak } from '@postpocket/presets'
import type { H3Event } from 'h3'

// Mock kotak bareng (kontrak 0.3.0) untuk development dan E2E, dengan data di memori seperti
// mock surat. Surat titipannya disimpan di mock surat (`boxId`), jadi alur buat, unggah, dan
// terbitnya sama persis dengan surat biasa.

const DAY = 24 * 60 * 60 * 1000
/** Batas per kotak, sama dengan awal di kontrak (`BoxLimits`). */
export const BOX_LIMITS = { letters: 20, photos: 40 }

interface MockBox {
  id: string
  editToken: string
  slug: string
  invite: string
  title: string
  to: string
  design: string
  createdAt: number
  opensAt: number
  scheduled: boolean
  openedAt: number | null
  photosDeletedAt: number | null
}

const boxes = new Map<string, MockBox>()
const bySlug = new Map<string, string>()
const byInvite = new Map<string, string>()

function code(length: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from(randomBytes(length), (byte) => alphabet[byte % alphabet.length]).join('')
}

const iso = (time: number | null) => (time === null ? null : new Date(time).toISOString())
const expiresAt = (box: MockBox) => box.opensAt + 30 * DAY
const photosExpireAt = (box: MockBox) =>
  box.openedAt === null ? null : Math.min(box.openedAt + 7 * DAY, expiresAt(box))
/** Foto titipan tidak dikembalikan lagi: sudah dihapus job, atau masanya sudah lewat. */
const photosGone = (box: MockBox) =>
  box.photosDeletedAt !== null || (photosExpireAt(box) ?? Infinity) <= Date.now()
/** `photosDeletedAt` di kontrak: waktu job menghapusnya, atau `photosExpireAt` begitu lewat. */
const photosDeletedAt = (box: MockBox) =>
  box.photosDeletedAt ?? (photosGone(box) ? photosExpireAt(box) : null)

/** Kotak yang masih berlaku; yang lewat `expiresAt` dianggap sudah dihapus job. */
function live(id: string | undefined): MockBox | undefined {
  const box = id ? boxes.get(id) : undefined
  return box && Date.now() < expiresAt(box) ? box : undefined
}

function usage(box: MockBox) {
  const list = boxLetters(box.id)
  return {
    letters: list.length,
    photos: list.reduce((sum, item) => sum + boxLetterPhotos(item), 0),
  }
}

/** Teks dari pengguna sudah lolos skema `BoxText`; spasi di ujungnya dibuang. */
const clean = (value: string) => value.trim()

function validDesign(id: string) {
  return kotak.folders.some((folder) => folder.id === id)
}

function organizerView(box: MockBox, origin: string) {
  return {
    id: box.id,
    slug: box.slug,
    url: `${origin}/k/${box.slug}`,
    invite: box.invite,
    inviteUrl: `${origin}/titip/${box.invite}`,
    title: box.title,
    to: box.to,
    design: box.design,
    createdAt: iso(box.createdAt),
    opensAt: iso(box.opensAt),
    scheduled: box.scheduled,
    openable: Date.now() >= box.opensAt,
    expiresAt: iso(expiresAt(box)),
    openedAt: iso(box.openedAt),
    photosExpireAt: iso(photosExpireAt(box)),
    photosDeletedAt: iso(photosDeletedAt(box)),
    limits: BOX_LIMITS,
    usage: usage(box),
    letters: boxLetters(box.id).map((item) => ({
      id: item.id,
      from: item.from,
      publishedAt: iso(item.publishedAt),
      photos: boxLetterPhotos(item),
    })),
  }
}

export async function createMockBox(event: H3Event, raw: unknown) {
  const validate = (await useContract())('CreateBoxRequest')
  if (!validate(raw)) {
    return fail(event, 400, 'invalid_request', 'body tidak sesuai skema CreateBoxRequest', [
      ...contractDetails(validate.errors),
    ])
  }
  const body = raw as { title: string; to: string; design: string; opensAt: string | null }
  if (!validDesign(body.design))
    return fail(event, 422, 'invalid_box', 'design tidak ada di preset')
  const now = Date.now()
  const latest = now + 30 * DAY
  const wanted = body.opensAt === null ? null : Date.parse(body.opensAt)
  if (wanted !== null && (wanted <= now || wanted > latest)) {
    return fail(event, 422, 'invalid_box', 'opensAt harus di antara sekarang dan 30 hari lagi')
  }
  const box: MockBox = {
    id: randomUUID(),
    editToken: randomBytes(24).toString('base64url'),
    slug: code(10),
    invite: code(12),
    title: clean(body.title),
    to: clean(body.to),
    design: body.design,
    createdAt: now,
    opensAt: wanted ?? latest,
    scheduled: wanted !== null,
    openedAt: null,
    photosDeletedAt: null,
  }
  boxes.set(box.id, box)
  bySlug.set(box.slug, box.id)
  byInvite.set(box.invite, box.id)
  setResponseStatus(event, 201)
  return { ...organizerView(box, getRequestURL(event).origin), editToken: box.editToken }
}

function owned(event: H3Event, id: string): MockBox | { error: unknown } {
  const box = live(id)
  if (!box) return { error: fail(event, 404, 'box_not_found', 'kotak tidak ada') }
  if (getHeader(event, 'x-edit-token') !== box.editToken) {
    return { error: fail(event, 401, 'unauthorized', 'X-Edit-Token tidak cocok') }
  }
  return box
}

export function getMockBox(event: H3Event, id: string) {
  const box = owned(event, id)
  if ('error' in box) return box.error
  return organizerView(box, getRequestURL(event).origin)
}

export async function updateMockBox(event: H3Event, id: string, raw: unknown) {
  const box = owned(event, id)
  if ('error' in box) return box.error
  const validate = (await useContract())('UpdateBoxRequest')
  if (!validate(raw)) {
    return fail(event, 400, 'invalid_request', 'body tidak sesuai skema UpdateBoxRequest', [
      ...contractDetails(validate.errors),
    ])
  }
  const now = Date.now()
  // Selama penerima belum membukanya, juga setelah opensAt lewat (kontrak 0.4.2).
  if (box.openedAt !== null) {
    return fail(event, 409, 'box_closed', 'penerima sudah membuka kotaknya')
  }
  const body = raw as {
    title?: string
    to?: string
    design?: string
    opensAt?: string | null
    openNow?: true
  }
  if (body.design !== undefined && !validDesign(body.design)) {
    return fail(event, 422, 'invalid_box', 'design tidak ada di preset')
  }
  if (body.openNow && body.opensAt !== undefined) {
    return fail(event, 422, 'invalid_box', 'openNow dan opensAt tidak boleh bersamaan')
  }
  const latest = box.createdAt + 30 * DAY
  let opensAt = box.opensAt
  let scheduled = box.scheduled
  if (body.openNow) {
    // "Buka sekarang" memakai jam server, bukan jam HP. Kotak yang sudah terbuka tetap memakai
    // waktu bukanya.
    opensAt = Math.min(box.opensAt, now)
    scheduled = true
  } else if (body.opensAt === null) {
    opensAt = latest
    scheduled = false
  } else if (body.opensAt !== undefined) {
    const wanted = Date.parse(body.opensAt)
    if (wanted <= now || wanted > latest) {
      return fail(
        event,
        422,
        'invalid_box',
        'opensAt harus di depan dan paling lambat 30 hari setelah kotak dibuat',
      )
    }
    opensAt = wanted
    scheduled = true
  }
  Object.assign(box, {
    title: body.title === undefined ? box.title : clean(body.title),
    to: body.to === undefined ? box.to : clean(body.to),
    design: body.design ?? box.design,
    opensAt,
    scheduled,
  })
  return organizerView(box, getRequestURL(event).origin)
}

function removeBox(box: MockBox) {
  // Draf titipan yang belum terbit ikut dihapus, bukan hanya yang sudah terbit.
  for (const item of boxLettersWithDrafts(box.id)) removeMockLetter(item.id)
  boxes.delete(box.id)
  bySlug.delete(box.slug)
  byInvite.delete(box.invite)
}

export function deleteMockBox(event: H3Event, id: string) {
  const box = owned(event, id)
  if ('error' in box) return box.error
  removeBox(box)
  setResponseStatus(event, 204)
  return null
}

export function removeMockBoxLetter(event: H3Event, id: string, letterId: string) {
  const box = owned(event, id)
  if ('error' in box) return box.error
  if (!boxLetters(box.id).some((item) => item.id === letterId)) {
    return fail(event, 404, 'box_not_found', 'titipan tidak ada di kotak ini')
  }
  removeMockLetter(letterId)
  setResponseStatus(event, 204)
  return null
}

export function getMockBoxInvite(event: H3Event, invite: string) {
  const box = live(byInvite.get(invite))
  if (!box) return fail(event, 404, 'box_not_found', 'kotak tidak ada')
  return {
    title: box.title,
    to: box.to,
    design: box.design,
    opensAt: iso(box.opensAt),
    scheduled: box.scheduled,
    closed: Date.now() >= box.opensAt,
    limits: BOX_LIMITS,
    usage: usage(box),
  }
}

export function getMockBoxForRecipient(event: H3Event, slug: string) {
  const box = live(bySlug.get(slug))
  if (!box) return fail(event, 404, 'box_not_found', 'kotak tidak ada')
  const origin = getRequestURL(event).origin
  const openable = Date.now() >= box.opensAt
  const gone = photosGone(box)
  const list = boxLetters(box.id)
  return {
    slug: box.slug,
    title: box.title,
    to: box.to,
    design: box.design,
    opensAt: iso(box.opensAt),
    scheduled: box.scheduled,
    openable,
    letterCount: list.length,
    letters: openable
      ? list.map((item) => {
          const coverFile = item.files.find((file) => file.kind === 'cover')
          const photos = gone ? [] : item.files.filter((file) => file.kind === 'photo')
          return {
            id: item.id,
            from: item.from,
            design: item.design,
            content: item.content,
            cover: gone ? null : mockAsset(coverFile, origin),
            photos: Object.fromEntries(
              photos.flatMap((file) => {
                const asset = mockAsset(file, origin)
                return asset ? [[file.key, asset]] : []
              }),
            ),
            publishedAt: iso(item.publishedAt),
          }
        })
      : [],
    openedAt: iso(box.openedAt),
    photosExpireAt: iso(photosExpireAt(box)),
    photosDeletedAt: iso(photosDeletedAt(box)),
    expiresAt: iso(expiresAt(box)),
  }
}

export function openMockBox(event: H3Event, slug: string) {
  const box = live(bySlug.get(slug))
  if (!box) return fail(event, 404, 'box_not_found', 'kotak tidak ada')
  if (Date.now() < box.opensAt) return fail(event, 409, 'box_not_open', 'kotak belum bisa dibuka')
  box.openedAt ??= Date.now()
  return { openedAt: iso(box.openedAt), photosExpireAt: iso(photosExpireAt(box)) }
}

/** Khusus uji: jalankan pembersihan foto kotak "7 hari setelah dibuka" sekarang juga. */
export function deleteMockBoxPhotos(event: H3Event, slug: string) {
  const box = live(bySlug.get(slug))
  if (!box) return fail(event, 404, 'box_not_found', 'kotak tidak ada')
  for (const item of boxLetters(box.id)) dropMockPhotos(item)
  box.photosDeletedAt = Date.now()
  return { photosDeletedAt: iso(box.photosDeletedAt) }
}

// Dipakai mock surat untuk surat titipan.

/** Id kotak untuk kode titip, atau `null` kalau tidak ada. */
export function boxIdForInvite(invite: string): string | null {
  return live(byInvite.get(invite))?.id ?? null
}

/** Alasan surat titipan ditolak saat `POST /letters`, atau `null` kalau boleh. */
export function boxEntryProblem(invite: string, photos: number): [string, string] | null {
  const box = live(byInvite.get(invite))
  if (!box) return ['box_not_found', 'kode titip tidak ada']
  return boxPublishProblem(box.id, photos)
}

/** Alasan surat titipan ditolak: kotak sudah ditutup atau sudah penuh. */
export function boxPublishProblem(boxId: string, photos: number): [string, string] | null {
  const box = live(boxId)
  if (!box) return ['box_not_found', 'kotak tidak ada']
  if (Date.now() >= box.opensAt) return ['box_closed', 'kotak sudah ditutup untuk titipan']
  const used = usage(box)
  if (used.letters + 1 > BOX_LIMITS.letters || used.photos + photos > BOX_LIMITS.photos) {
    return ['box_full', 'kotak sudah penuh']
  }
  return null
}

/** Ringkasan kotak untuk respons publish surat titipan. */
export function boxReceipt(boxId: string, origin: string) {
  const box = boxes.get(boxId)!
  return {
    inviteUrl: `${origin}/titip/${box.invite}`,
    expiresAt: iso(expiresAt(box)),
    receipt: {
      title: box.title,
      to: box.to,
      opensAt: iso(box.opensAt),
      scheduled: box.scheduled,
    },
  }
}
