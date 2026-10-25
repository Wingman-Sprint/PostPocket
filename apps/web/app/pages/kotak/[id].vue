<script setup lang="ts">
import type { OrganizerBox } from '~/utils/box-api'
import { boxRoom } from '~/utils/box-room'
import {
  deviceTimeZone,
  formatDay as formatDayIn,
  formatWhen as formatWhenIn,
  fromLocalInput,
  scheduleRange,
  toLocalInput,
} from '~/utils/box-time'
import { LetterApiError, errorMessage } from '~/utils/letter-api'
import { folderSeed } from '~/utils/folder-art'
import { forgetBox, myBox, refreshBox, type MyBox } from '~/utils/my-boxes'

/**
 * Halaman kelola kotak bareng untuk pembuatnya (kontrak 0.3.0): bagikan link titip dan link buka,
 * atur kapan dibuka, lihat dan hapus titipan, atau hapus kotaknya. Isi titipan tidak ditampilkan,
 * supaya tetap jadi kejutan; titipan yang tidak pantas bisa dihapus lewat namanya.
 */
if (!useRuntimeConfig().public.kotakBareng) {
  throw createError({ statusCode: 404, statusMessage: 'Kotak bareng belum tersedia', fatal: true })
}
useSeoMeta({ title: 'Kelola kotak bareng · PostPocket', robots: 'noindex' })

const route = useRoute()
const id = String(route.params.id)
const api = useBoxApi()

// Halaman ini hanya dirender di browser, jadi waktu ditulis dalam zona waktu HP, sama dengan jam
// yang dipilih di input jadwal.
const zone = deviceTimeZone()
const formatWhen = (value: string | number | Date) => formatWhenIn(value, zone)
const formatDay = (value: string | number | Date) => formatDayIn(value, zone)

const local = ref<MyBox | null>(null)
const box = ref<OrganizerBox | null>(null)
const state = ref<'loading' | 'ready' | 'elsewhere' | 'missing' | 'error'>('loading')
const error = ref('')
const notice = ref('')
/** Bagian tempat pesan aksi terakhir tampil: di dekat tombol yang ditekan. */
type MessageAt = 'top' | 'link' | 'schedule' | 'entries' | 'bottom'
const messageAt = ref<MessageAt>('top')
const busy = ref(false)

/** Kotak sudah dihapus server. Hanya `box_not_found`: 404 umum tidak menghapus token pembuatnya. */
async function gone() {
  await forgetBox(id)
  state.value = 'missing'
}

// Pemuatan ulang di belakang tidak boleh menimpa hasil aksi yang lebih baru: tiap pemuatan dan
// aksi menaikkan nomor ini, dan hanya hasil dengan nomor terakhir yang dipakai.
let latest = 0
async function load(background = false) {
  local.value = await myBox(id)
  if (!local.value) {
    state.value = 'elsewhere'
    return
  }
  const ticket = ++latest
  try {
    const fresh = await api.get(id, local.value.editToken)
    if (ticket !== latest) return
    box.value = fresh
    state.value = 'ready'
    await refreshBox(id, {
      title: fresh.title,
      to: fresh.to,
      design: fresh.design,
      expiresAt: fresh.expiresAt,
    })
  } catch (problem) {
    if (ticket !== latest) return
    if (problem instanceof LetterApiError && problem.code === 'box_not_found') await gone()
    // Gangguan sesaat saat memuat ulang di belakang: data yang sudah tampil tetap dipakai.
    else if (background && box.value) {
      messageAt.value = 'top'
      notice.value = 'Kotak belum bisa dimuat ulang. Yang tampil mungkin belum yang terbaru.'
    } else {
      error.value = errorMessage(problem)
      state.value = 'error'
    }
  }
}
onMounted(() => load())
// Titipan baru dari teman-teman terlihat begitu halaman ini dibuka lagi.
useEventListener(document, 'visibilitychange', () => {
  if (document.visibilityState !== 'visible') return
  if (state.value === 'ready') void load(true)
  else if (state.value === 'error') void load()
})

// Terbuka atau belum menurut jam server, bukan jam HP. Kotak terjadwal dimuat ulang begitu
// jadwalnya lewat selagi halaman ini terbuka.
const now = ref(Date.now())
useIntervalFn(() => {
  now.value = Date.now()
  if (box.value && !box.value.openable && now.value >= Date.parse(box.value.opensAt)) {
    void load(true)
  }
}, 30_000)
const open = computed(() => !!box.value?.openable)
const room = computed(() =>
  box.value ? boxRoom(box.value.limits, box.value.usage) : { letters: 0, photos: 0 },
)
const files = computed(() =>
  (box.value?.letters ?? []).slice(0, 4).map((item) => ({
    id: item.id,
    name: `Dari ${item.from}`,
    meta: formatDay(item.publishedAt),
  })),
)

const { width: windowWidth } = useWindowSize()
const folderWidth = computed(() => Math.max(240, Math.min(320, windowWidth.value - 32)))

const canShare = import.meta.client && typeof navigator.share === 'function'
const copied = ref<'invite' | 'open' | null>(null)
async function copy(which: 'invite' | 'open') {
  if (!box.value) return
  try {
    await navigator.clipboard.writeText(which === 'invite' ? box.value.inviteUrl : box.value.url)
    copied.value = which
    setTimeout(() => {
      if (copied.value === which) copied.value = null
    }, 2000)
  } catch {
    document.querySelector<HTMLInputElement>(`[data-testid="box-${which}-url"]`)?.select()
  }
}
async function share(which: 'invite' | 'open') {
  if (!box.value) return
  const data =
    which === 'invite'
      ? {
          title: `Titip surat untuk ${box.value.to}`,
          text: `Yuk titip surat untuk ${box.value.to} di kotak "${box.value.title}". Isinya rahasia sampai kotaknya dibuka.`,
          url: box.value.inviteUrl,
        }
      : {
          title: `Kotak bareng untuk ${box.value.to}`,
          text: 'Teman-temanmu mengumpulkan surat untukmu di satu kotak. Ketuk untuk membuka.',
          url: box.value.url,
        }
  try {
    await navigator.share(data)
  } catch {
    // Dibatalkan user.
  }
}

async function run(
  action: () => Promise<OrganizerBox | undefined>,
  where: MessageAt,
  done?: string,
) {
  if (!local.value || busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  messageAt.value = where
  const ticket = ++latest
  try {
    const next = await action()
    now.value = Date.now()
    if (next && ticket === latest) box.value = next
    if (done) notice.value = done
  } catch (problem) {
    if (problem instanceof LetterApiError && problem.code === 'box_not_found') {
      await gone()
      return
    }
    // Penerima keburu membuka kotaknya (kontrak 0.4.2): jadwalnya tidak bisa diubah lagi.
    const closed = problem instanceof LetterApiError && problem.code === 'box_closed'
    error.value = closed
      ? `${box.value?.to ?? 'Penerima'} sudah membuka kotaknya, jadi jadwalnya tidak bisa diubah lagi.`
      : errorMessage(problem)
    // Bagian jadwal hilang begitu kotaknya dimuat ulang sebagai terbuka, jadi pesannya di atas.
    if (closed) {
      messageAt.value = 'top'
      void load()
    }
  } finally {
    busy.value = false
  }
}

function openNow() {
  if (!box.value) return
  const question = `Buka kotak sekarang? ${box.value.to} langsung bisa membacanya, dan titipan baru tidak diterima lagi.`
  if (!window.confirm(question)) return
  void run(
    () => api.update(id, local.value!.editToken, { openNow: true }),
    'link',
    `Kotak sudah terbuka. Kirim link buka ke ${box.value.to}.`,
  )
}

// Ubah jadwal: tanggal tertentu, atau kembali dibuka manual. Selama penerima belum membukanya,
// kotak yang sudah terbuka juga bisa dijadwal ulang (kontrak 0.4.2): kotaknya tersegel lagi dan
// titipan diterima lagi sampai jadwal baru. Jadi jadwal yang salah tidak terkunci.
const reschedulable = computed(() => !!box.value && !box.value.openedAt)
const editing = ref(false)
const scheduleInput = ref('')
const scheduleRangeNow = computed(() =>
  scheduleRange(box.value ? Date.parse(box.value.createdAt) : Date.now(), now.value),
)
function startEditing() {
  if (!box.value) return
  const current = Date.parse(box.value.opensAt)
  scheduleInput.value = toLocalInput(
    box.value.scheduled && current > Date.now()
      ? current
      : Math.min(scheduleRangeNow.value.max, Date.now() + 24 * 60 * 60 * 1000),
  )
  editing.value = true
}
function saveSchedule() {
  const date = fromLocalInput(scheduleInput.value)
  const { min, max } = scheduleRangeNow.value
  if (!date || date.getTime() < min || date.getTime() > max) {
    notice.value = ''
    messageAt.value = 'schedule'
    error.value = `Pilih waktu antara 10 menit lagi dan ${formatWhen(max)}.`
    return
  }
  editing.value = false
  void run(
    () => api.update(id, local.value!.editToken, { opensAt: date.toISOString() }),
    'schedule',
    open.value
      ? `Kotak tersegel lagi dan terbuka sendiri ${formatWhen(date)}. Teman-teman bisa menitip lagi sampai saat itu.`
      : `Kotak terbuka sendiri ${formatWhen(date)}.`,
  )
}
function makeManual() {
  editing.value = false
  void run(
    () => api.update(id, local.value!.editToken, { opensAt: null }),
    'schedule',
    open.value
      ? 'Kotak tersegel lagi. Kotak dibuka saat kamu menekan Buka sekarang.'
      : 'Kotak dibuka saat kamu menekan Buka sekarang.',
  )
}

function removeEntry(entry: OrganizerBox['letters'][number]) {
  if (!window.confirm(`Hapus surat dari ${entry.from}? Suratnya tidak bisa dikembalikan.`)) return
  void run(
    async () => {
      try {
        await api.removeLetter(id, local.value!.editToken, entry.id)
      } catch (problem) {
        // Pengirimnya sudah menariknya lebih dulu: cukup muat ulang daftarnya.
        if (!(problem instanceof LetterApiError && problem.code === 'box_not_found')) throw problem
      }
      return api.get(id, local.value!.editToken)
    },
    'entries',
    `Surat dari ${entry.from} sudah tidak ada di kotak.`,
  )
}

async function removeBox() {
  if (!box.value || !local.value) return
  const question = `Hapus kotak "${box.value.title}" beserta ${box.value.usage.letters} suratnya? Link titip dan link buka langsung mati.`
  if (!window.confirm(question)) return
  busy.value = true
  error.value = ''
  notice.value = ''
  messageAt.value = 'bottom'
  try {
    const title = box.value.title
    await api.remove(id, local.value.editToken)
    await forgetBox(id)
    // Kotak surat memberi tahu kotaknya sudah terhapus, bukan diam-diam kembali ke sana.
    await navigateTo({ path: '/kotak', query: { dihapus: title } }, { replace: true })
  } catch (problem) {
    error.value = errorMessage(problem)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 sm:px-6" data-testid="box-manage">
    <header class="py-4">
      <NuxtLink
        to="/kotak"
        class="inline-flex min-h-11 items-center gap-1 text-body text-ink-muted hover:text-ink"
      >
        <Icon name="chevron-left" :size="14" /> Kotak surat
      </NuxtLink>
    </header>

    <main v-if="state === 'ready' && box" class="grid flex-1 gap-10 pb-12 lg:grid-cols-[1fr_360px]">
      <div class="max-w-xl min-w-0">
        <p class="text-body text-ink-muted">Kotak bareng untuk {{ box.to }}</p>
        <h1
          class="mt-1 text-[32px] leading-tight font-bold tracking-[-0.03em] text-balance [overflow-wrap:anywhere]"
          data-testid="box-manage-title"
        >
          {{ box.title }}
        </h1>
        <p class="mt-2 text-pretty text-ink-muted" data-testid="box-manage-status">
          <template v-if="open">
            Sudah terbuka untuk {{ box.to
            }}<template v-if="box.openedAt">
              dan sudah dibuka {{ formatWhen(box.openedAt) }}</template
            ><template v-else>, tapi dia belum membukanya</template>. Kotak ini dihapus
            {{ formatWhen(box.expiresAt) }}.
          </template>
          <template v-else-if="box.scheduled">
            Terbuka sendiri {{ formatWhen(box.opensAt) }}. Sebelum itu, teman-teman bisa terus
            menitip.
          </template>
          <template v-else>
            Kamu yang membukanya. Kalau belum kamu buka, kotaknya terbuka sendiri
            {{ formatWhen(box.opensAt) }}. Sebelum itu, teman-teman bisa terus menitip.
          </template>
        </p>

        <BoxMessage v-if="messageAt === 'top'" :notice="notice" :error="error" />

        <!-- Setelah kotaknya terbuka, link titip tidak menerima surat lagi (409 box_closed). -->
        <section v-if="open" class="mt-8" aria-labelledby="invite-title">
          <h2 id="invite-title" class="text-[19px] font-bold tracking-[-0.02em]">
            Titipan sudah ditutup
          </h2>
          <p class="mt-1 text-caption text-ink-muted">
            Kotaknya sudah terbuka, jadi link titip tidak menerima surat baru lagi.<template
              v-if="reschedulable"
            >
              Masih mau menerima titipan? Jadwalkan ulang di bagian Kapan dibuka.</template
            >
          </p>
        </section>
        <section v-else class="mt-8" aria-labelledby="invite-title">
          <h2 id="invite-title" class="text-[19px] font-bold tracking-[-0.02em]">
            Ajak teman menitip surat
          </h2>
          <p class="mt-1 text-caption text-ink-muted">
            Bagikan ke grup. Siapa pun yang punya link ini bisa menitip surat sampai kotaknya
            dibuka, tanpa bisa membaca surat teman lain.
          </p>
          <div class="mt-3 flex gap-2">
            <input
              :value="box.inviteUrl"
              readonly
              aria-label="Link titip"
              class="h-11 min-w-0 flex-1 rounded-control bg-panel px-3 text-body inset-ring inset-ring-line"
              data-testid="box-invite-url"
              @focus="($event.target as HTMLInputElement).select()"
            />
            <button
              type="button"
              class="h-11 shrink-0 rounded-control px-4 text-body font-semibold inset-ring inset-ring-line hover:bg-panel"
              @click="copy('invite')"
            >
              {{ copied === 'invite' ? 'Tersalin' : 'Salin' }}
            </button>
          </div>
          <div class="mt-2 flex flex-wrap gap-2">
            <button
              v-if="canShare"
              type="button"
              class="inline-flex h-11 items-center rounded-control bg-ink px-4 text-body font-semibold text-white hover:bg-ink/90"
              @click="share('invite')"
            >
              Bagikan link titip
            </button>
            <NuxtLink
              :to="`/letter/new?titip=${box.invite}`"
              class="inline-flex h-11 items-center rounded-control px-4 text-body font-semibold inset-ring inset-ring-line hover:bg-panel"
              data-testid="box-manage-write"
            >
              Tulis suratmu juga
            </NuxtLink>
          </div>
        </section>

        <section class="mt-8 border-t border-line-soft pt-6" aria-labelledby="open-title">
          <h2 id="open-title" class="text-[19px] font-bold tracking-[-0.02em]">
            Link untuk {{ box.to }}
          </h2>
          <p class="mt-1 text-caption text-ink-muted">
            <template v-if="open">
              {{ box.to }} bisa membacanya sekarang. Foto di dalamnya dihapus 7 hari setelah dia
              membuka surat pertama.
            </template>
            <template v-else>
              Kirim kapan saja. Sebelum kotaknya dibuka, {{ box.to }} hanya melihat kotak tersegel
              dan jumlah suratnya. Foto di dalamnya dihapus 7 hari setelah dia membuka surat
              pertama.
            </template>
          </p>
          <div class="mt-3 flex gap-2">
            <input
              :value="box.url"
              readonly
              :aria-label="`Link untuk ${box.to}`"
              class="h-11 min-w-0 flex-1 rounded-control bg-panel px-3 text-body inset-ring inset-ring-line"
              data-testid="box-open-url"
              @focus="($event.target as HTMLInputElement).select()"
            />
            <button
              type="button"
              class="h-11 shrink-0 rounded-control px-4 text-body font-semibold inset-ring inset-ring-line hover:bg-panel"
              @click="copy('open')"
            >
              {{ copied === 'open' ? 'Tersalin' : 'Salin' }}
            </button>
          </div>
          <div class="mt-2 flex flex-wrap gap-2">
            <button
              v-if="canShare"
              type="button"
              class="inline-flex h-11 items-center rounded-control px-4 text-body font-semibold inset-ring inset-ring-line hover:bg-panel"
              @click="share('open')"
            >
              Bagikan ke {{ box.to }}
            </button>
            <a
              :href="box.url"
              target="_blank"
              rel="noopener"
              class="inline-flex h-11 items-center rounded-control px-4 text-body font-semibold inset-ring inset-ring-line hover:bg-panel"
              >Lihat seperti {{ box.to }}</a
            >
          </div>
          <BoxMessage v-if="messageAt === 'link'" :notice="notice" :error="error" />
        </section>

        <section
          v-if="reschedulable"
          class="mt-8 border-t border-line-soft pt-6"
          aria-labelledby="schedule-title"
          data-testid="box-schedule-section"
        >
          <h2 id="schedule-title" class="text-[19px] font-bold tracking-[-0.02em]">Kapan dibuka</h2>
          <p v-if="open" class="mt-1 text-caption text-ink-muted">
            Sudah terbuka, tapi {{ box.to }} belum membukanya. Kalau waktunya salah, jadwalkan
            ulang: kotaknya tersegel lagi untuk {{ box.to }}, dan teman-teman bisa menitip lagi
            sampai jadwal baru.
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button
              v-if="!open"
              type="button"
              class="inline-flex h-11 items-center rounded-control bg-ink px-4 text-body font-semibold text-white hover:bg-ink/90 disabled:opacity-60"
              :disabled="busy"
              data-testid="box-open-now"
              @click="openNow"
            >
              Buka sekarang
            </button>
            <!-- Di kotak yang sudah terbuka, jadwal ulang jadi tombol utama (Buka sekarang hilang). -->
            <button
              type="button"
              class="inline-flex h-11 items-center rounded-control px-4 text-body font-semibold disabled:opacity-60"
              :class="
                open
                  ? 'bg-ink text-white hover:bg-ink/90'
                  : 'inset-ring inset-ring-line hover:bg-panel'
              "
              :disabled="busy"
              data-testid="box-schedule"
              @click="startEditing"
            >
              {{ open ? 'Jadwalkan ulang' : box.scheduled ? 'Ubah jadwal' : 'Jadwalkan' }}
            </button>
            <button
              v-if="box.scheduled"
              type="button"
              class="inline-flex h-11 items-center rounded-control px-4 text-body font-semibold text-ink-muted underline underline-offset-2 hover:text-ink disabled:opacity-60"
              :disabled="busy"
              @click="makeManual"
            >
              Buka manual saja
            </button>
          </div>
          <form
            v-if="editing"
            class="mt-3 flex flex-wrap items-end gap-2"
            @submit.prevent="saveSchedule"
          >
            <label class="min-w-0 flex-1">
              <span class="block text-caption text-ink-muted">Kotak terbuka sendiri pada</span>
              <input
                v-model="scheduleInput"
                type="datetime-local"
                :min="toLocalInput(scheduleRangeNow.min)"
                :max="toLocalInput(scheduleRangeNow.max)"
                class="mt-1 h-11 w-full rounded-control bg-surface px-3 text-body inset-ring inset-ring-line"
                data-testid="box-schedule-input"
              />
            </label>
            <button
              type="submit"
              class="h-11 rounded-control bg-ink px-4 text-body font-semibold text-white"
            >
              Simpan jadwal
            </button>
          </form>
          <BoxMessage v-if="messageAt === 'schedule'" :notice="notice" :error="error" />
        </section>

        <section class="mt-8 border-t border-line-soft pt-6" aria-labelledby="entries-title">
          <h2 id="entries-title" class="text-[19px] font-bold tracking-[-0.02em]">
            Titipan ({{ box.usage.letters }})
          </h2>
          <p class="mt-1 text-caption text-ink-muted" data-testid="box-room">
            <template v-if="!open && !room.letters">
              Kotaknya sudah penuh ({{ box.limits.letters }} surat). Hapus titipan kalau mau memberi
              tempat untuk surat lain.
            </template>
            <template v-else-if="!open && !room.photos">
              Fotonya sudah penuh ({{ box.limits.photos }} foto). Masih muat
              {{ room.letters }} surat, asal tanpa foto.
            </template>
            <template v-else-if="!open">
              Masih muat {{ room.letters }} surat dan {{ room.photos }} foto.
            </template>
            Isinya rahasia, jadi yang terlihat di sini hanya nama pengirimnya.
          </p>
          <ul
            v-if="box.letters.length"
            class="mt-3 divide-y divide-line-soft rounded-[16px] bg-surface shadow-raised"
            data-testid="box-entries"
          >
            <li
              v-for="entry in box.letters"
              :key="entry.id"
              class="flex items-center gap-3 px-4 py-2.5"
              data-testid="box-entry"
            >
              <span class="min-w-0 flex-1">
                <span class="block truncate text-body font-semibold">Dari {{ entry.from }}</span>
                <span class="block text-caption text-ink-muted">
                  {{ formatDay(entry.publishedAt)
                  }}<template v-if="entry.photos">, {{ entry.photos }} foto</template>
                </span>
              </span>
              <button
                type="button"
                class="-mr-2 inline-flex min-h-11 shrink-0 items-center px-2 text-caption font-semibold text-ink-muted underline underline-offset-2 hover:text-ink disabled:opacity-50"
                :disabled="busy"
                @click="removeEntry(entry)"
              >
                Hapus
              </button>
            </li>
          </ul>
          <p v-else class="mt-3 text-body text-ink-muted">
            Belum ada titipan. Bagikan link titip ke teman-teman, atau tulis suratmu sendiri.
          </p>
          <BoxMessage v-if="messageAt === 'entries'" :notice="notice" :error="error" />
        </section>

        <button
          type="button"
          class="mt-8 inline-flex min-h-11 items-center text-caption text-ink-muted underline underline-offset-2 hover:text-ink"
          data-testid="box-delete"
          @click="removeBox"
        >
          Hapus kotak ini
        </button>
        <BoxMessage v-if="messageAt === 'bottom'" :notice="notice" :error="error" />
      </div>

      <figure class="order-first flex flex-col items-center lg:order-none lg:sticky lg:top-6" inert>
        <GlassFolder
          :label="box.title"
          :meta="`${box.usage.letters} surat`"
          :art="box.design"
          :seed="folderSeed(box.slug)"
          :files="files"
          :width="folderWidth"
          sealed
          :sealed-text="
            open
              ? box.openedAt
                ? 'Sudah dibuka'
                : 'Sudah terbuka'
              : box.scheduled
                ? `Dibuka ${formatDay(box.opensAt)}`
                : 'Belum dibuka'
          "
        />
      </figure>
    </main>

    <main
      v-else-if="state !== 'loading'"
      class="flex flex-1 flex-col items-center justify-center pb-16 text-center"
      data-testid="box-manage-missing"
    >
      <h1 class="text-title">
        {{
          state === 'elsewhere'
            ? 'Kotak ini tidak tercatat di browser ini'
            : state === 'missing'
              ? 'Kotak ini sudah tidak ada'
              : 'Kotak belum bisa dimuat'
        }}
      </h1>
      <p class="mt-2 max-w-sm text-pretty text-ink-muted">
        <template v-if="state === 'elsewhere'">
          Kotak bareng hanya bisa dikelola dari browser yang dipakai untuk membuatnya. Buka link ini
          di browser itu, atau lewat Kotak surat di sana.
        </template>
        <template v-else-if="state === 'missing'">
          Mungkin sudah lewat 30 hari sejak kotaknya terbuka, atau sudah kamu hapus.
        </template>
        <template v-else>{{ error }}</template>
      </p>
      <div class="mt-6 flex flex-wrap justify-center gap-2">
        <button
          v-if="state === 'error'"
          type="button"
          class="inline-flex h-11 items-center rounded-control bg-ink px-6 text-body font-semibold text-white"
          @click="load()"
        >
          Coba lagi
        </button>
        <NuxtLink
          to="/kotak"
          class="inline-flex h-11 items-center rounded-control px-6 text-body font-semibold"
          :class="state === 'error' ? 'inset-ring inset-ring-line' : 'bg-ink text-white'"
        >
          Buka Kotak surat
        </NuxtLink>
      </div>
    </main>
  </div>
</template>
