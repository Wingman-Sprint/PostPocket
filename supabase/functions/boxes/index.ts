// Fungsi `boxes`: kotak bareng untuk pembuatnya dan halaman titip (kontrak 0.3.0).
// POST /boxes, GET/PATCH/DELETE /boxes/{id}, DELETE /boxes/{id}/letters/{letterId},
// GET /boxes/invite/{invite}. Kontrak: docs/api/openapi.yaml.

import {
  BOX_LIMITS,
  boxError,
  boxLetters,
  boxNotFound,
  INVITE,
  liveBox,
  openable,
  organizerBox,
  usage,
} from '../_shared/box.ts'
import { type BoxRow, check, db, iso, UUID } from '../_shared/db.ts'
import { deleteBoxes, deleteLetters } from '../_shared/files.ts'
import { ApiError, empty, json, notFound, readJson, serve } from '../_shared/http.ts'
import { type RateLimit, takeRateLimit } from '../_shared/rate-limit.ts'
import { bytea, newEditToken, newInvite, newSlug, sameHash, sha256 } from '../_shared/token.ts'
import { parseCreateBox, parseUpdateBox } from '../_shared/validate.ts'

/** Batas pembuatan kotak per IP, terpisah dari surat (docs/backend.md, Rancangan kotak bareng). */
const RATE_LIMIT: RateLimit = {
  bucket: 'create_box',
  limit: 5,
  window: '1 hour',
  message: 'terlalu banyak kotak dari IP ini',
}

/**
 * Batas body `POST` dan `PATCH /boxes`. Body terpanjang yang sah (judul dan nama penerima 40
 * karakter emoji yang di-escape) sekitar 1 KB; batas umum 100 KB untuk isi surat terlalu longgar
 * di sini.
 */
const BODY_LIMIT = 4096

async function createBox(request: Request) {
  const body = parseCreateBox(await readJson(request, BODY_LIMIT))
  await takeRateLimit(request, RATE_LIMIT)
  const editToken = newEditToken()
  const hash = bytea(await sha256(editToken))
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db().rpc('create_box', {
      p_slug: newSlug(),
      p_invite: newInvite(),
      p_edit_token_hash: hash,
      p_title: body.title,
      p_recipient: body.to,
      p_design: body.design,
      p_opens_at: body.opensAt,
    })
    // Slug atau kode titip bentrok (sangat jarang): coba lagi.
    if ((error as { code?: string } | null)?.code === '23505') continue
    const rejected = boxError(error, 422)
    if (rejected) throw rejected
    const box = (check({ data, error }) as BoxRow[])[0]!
    return json(request, 201, { ...organizerBox(request, box, []), editToken })
  }
  throw new Error('Gagal membuat slug kotak unik')
}

/** Kotak milik pemegang `X-Edit-Token`. 404 kalau tidak ada, 401 kalau tokennya salah. */
async function ownedBox(request: Request, id: string): Promise<BoxRow> {
  if (!UUID.test(id)) throw boxNotFound()
  const box = await liveBox('id', id)
  if (!box) throw boxNotFound()
  const token = request.headers.get('x-edit-token')
  if (!token || !sameHash(await sha256(token), box.edit_token_hash)) {
    throw new ApiError(401, 'unauthorized', 'X-Edit-Token tidak ada atau tidak cocok')
  }
  return box
}

async function getBox(request: Request, id: string) {
  const box = await ownedBox(request, id)
  return json(request, 200, organizerBox(request, box, await boxLetters(box.id)))
}

async function updateBox(request: Request, id: string) {
  const box = await ownedBox(request, id)
  const patch = parseUpdateBox(await readJson(request, BODY_LIMIT))
  const { data, error } = await db().rpc('update_box', { p_id: box.id, p_patch: patch })
  if ((error as { message?: string } | null)?.message === 'box_closed') {
    throw new ApiError(409, 'box_closed', 'penerima sudah membuka kotaknya, jadi tidak bisa diubah')
  }
  const rejected = boxError(error, 422)
  if (rejected) throw rejected
  const updated = (check({ data, error }) as BoxRow[])[0]
  // Kotak lewat expires_at di antara dua query.
  if (!updated) throw boxNotFound()
  return json(request, 200, organizerBox(request, updated, await boxLetters(updated.id)))
}

async function deleteBox(request: Request, id: string) {
  const box = await ownedBox(request, id)
  await deleteBoxes([box.id])
  return empty(request, 204)
}

async function removeBoxLetter(request: Request, id: string, letterId: string) {
  const box = await ownedBox(request, id)
  if (!UUID.test(letterId)) throw boxNotFound('titipan tidak ada di kotak ini')
  const rows = check(
    await db().from('letters').select('id').eq('id', letterId).eq('box_id', box.id)
      .eq('status', 'sent').limit(1),
  ) as { id: string }[]
  if (!rows[0]) throw boxNotFound('titipan tidak ada di kotak ini')
  await deleteLetters([letterId])
  return empty(request, 204)
}

async function getInvite(request: Request, invite: string) {
  if (!INVITE.test(invite)) throw boxNotFound()
  const box = await liveBox('invite', invite)
  if (!box) throw boxNotFound()
  return json(request, 200, {
    title: box.title,
    to: box.recipient,
    design: box.design,
    opensAt: iso(box.opens_at),
    scheduled: box.scheduled,
    closed: openable(box),
    limits: BOX_LIMITS,
    usage: usage(await boxLetters(box.id)),
  })
}

Deno.serve(serve(async (request, path) => {
  const method = request.method
  if (path === '/boxes' && method === 'POST') return await createBox(request)
  const invite = path.match(/^\/boxes\/invite\/([^/]+)$/)
  if (invite && method === 'GET') return await getInvite(request, invite[1])
  const letter = path.match(/^\/boxes\/([^/]+)\/letters\/([^/]+)$/)
  if (letter && method === 'DELETE') return await removeBoxLetter(request, letter[1], letter[2])
  const one = path.match(/^\/boxes\/([^/]+)$/)
  if (one && method === 'GET') return await getBox(request, one[1])
  if (one && method === 'PATCH') return await updateBox(request, one[1])
  if (one && method === 'DELETE') return await deleteBox(request, one[1])
  throw notFound('endpoint tidak ada')
}))
