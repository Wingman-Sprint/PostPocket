import { describe, expect, it } from 'vitest'
import { postmarkDate, SUPPORT_URL, supportPromptDue } from '../app/utils/support'

describe('dukungan Sociabuzz', () => {
  it('membuka halaman PostPocket di Sociabuzz lewat https', () => {
    const url = new URL(SUPPORT_URL)
    expect(url.protocol).toBe('https:')
    expect(url.hostname).toBe('sociabuzz.com')
    expect(url.pathname).toBe('/wingmanclutch/tribe')
  })

  it('tanggal cap pos memakai bulan Indonesia dan waktu Jakarta', () => {
    expect(postmarkDate(new Date('2026-10-16T03:00:00Z'))).toBe('16 OKT 2026')
    expect(postmarkDate(new Date('2026-05-01T00:00:00Z'))).toBe('1 MEI 2026')
    // 31 Desember 18.00 UTC sudah 1 Januari di Jakarta.
    expect(postmarkDate(new Date('2026-12-31T18:00:00Z'))).toBe('1 JAN 2027')
  })

  it('dialog Traktir istirahat 30 hari setelah muncul sendiri', () => {
    const now = new Date('2026-10-16T03:00:00Z')
    expect(supportPromptDue(null, now)).toBe(true)
    expect(supportPromptDue('bukan tanggal', now)).toBe(true)
    expect(supportPromptDue('2026-10-16T02:00:00Z', now)).toBe(false)
    expect(supportPromptDue('2026-09-17T03:00:01Z', now)).toBe(false)
    expect(supportPromptDue('2026-09-16T03:00:00Z', now)).toBe(true)
  })
})
