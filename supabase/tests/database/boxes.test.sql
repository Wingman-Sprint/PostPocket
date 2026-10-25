-- Uji kotak bareng (migrasi boxes). Jalankan: supabase test db
-- now() tetap sama sepanjang transaksi test, jadi "Buka sekarang" langsung membuat kotaknya
-- terbuka (opens_at = now()).
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

delete from public.letter_events;
delete from vault.secrets where name = 'project_url';

-- Kotak manual (A) dan terjadwal besok (B).
create temp table box_a as select * from public.create_box(
  'KotakAAAAA', 'UndanganAAAA', decode(repeat('ab', 32), 'hex'), 'Ultah Rani', 'Rani', 'par-avion', null);
create temp table box_b as select * from public.create_box(
  'KotakBBBBB', 'UndanganBBBB', decode(repeat('ab', 32), 'hex'), 'Wisuda', 'Bima', 'laut',
  now() + interval '1 day');

-- 1-3: kotak manual dan terjadwal
select is(
  (select scheduled::text || ':' || (opens_at = now() + interval '30 days') || ':'
    || (expires_at = opens_at + interval '30 days') from box_a),
  'false:true:true', 'kotak manual: opens_at = batas 30 hari, expires_at = opens_at + 30 hari');
select is((select scheduled from box_b), true, 'kotak terjadwal: scheduled');
select is((select count(*)::integer from public.letter_events where kind = 'box_created'), 2,
  'membuat kotak mencatat box_created');

-- 4-6: bentuk dijaga
select throws_ok($$
  select public.create_box('KotakCCCCC', 'UndanganCCCC', decode(repeat('ab', 32), 'hex'), 'X', 'Y',
    'laut', now() - interval '1 minute')
$$, 'P0001', 'invalid_box', 'opensAt yang sudah lewat ditolak');
select throws_ok($$
  select public.create_box('KotakCCCCC', 'UndanganCCCC', decode(repeat('ab', 32), 'hex'), 'X', 'Y',
    'laut', now() + interval '31 days')
$$, 'P0001', 'invalid_box', 'opensAt lebih dari 30 hari ditolak');
select throws_ok($$
  select public.create_box('KotakCCCCC', 'UndanganCCCC', decode(repeat('ab', 32), 'hex'), ' Spasi',
    'Y', 'laut', null)
$$, '23514', null, 'judul yang belum dipangkas ditolak database');

-- Dua titipan ke kotak A: masing-masing satu foto dan satu cover.
select public.create_letter(
  ('00000000-0000-4000-8000-0000000000e' || n)::uuid, '{}', '{"version":1,"elements":[]}',
  decode(repeat('ab', 32), 'hex'), null,
  jsonb_build_array(
    jsonb_build_object('kind', 'photo', 'key', 'p1', 'storage_path', '00000000-0000-4000-8000-0000000000e' || n || '/p.jpg',
      'mime', 'image/jpeg', 'size', 1, 'width', 1, 'height', 1),
    jsonb_build_object('kind', 'cover', 'key', null, 'storage_path', '00000000-0000-4000-8000-0000000000e' || n || '/c.jpg',
      'mime', 'image/jpeg', 'size', 1, 'width', 1, 'height', 1)),
  (select id from box_a), 'Teman ' || n)
from generate_series(1, 2) n;

-- 7-8: titipan selalu punya nama pengirim, dan bukan balasan
select throws_ok($$
  insert into public.letters (design, content, edit_token_hash, box_id)
  select '{}', '{}', decode(repeat('ab', 32), 'hex'), id from box_a
$$, '23514', null, 'box_id tanpa from_name ditolak');
select throws_ok($$
  select public.create_letter(gen_random_uuid(), '{}', '{}', decode(repeat('ab', 32), 'hex'),
    '00000000-0000-4000-8000-0000000000e1', '[]', (select id from box_a), 'Balas')
$$, '23514', null, 'titipan tidak boleh berupa balasan');

-- 9-11: publish titipan memakai masa berlaku kotak, dan dicatat box_letter, bukan created
select is(
  (select expires_at from public.publish_letter('00000000-0000-4000-8000-0000000000e1', 'TitipAAA01', '{}')),
  (select expires_at from box_a), 'expires_at titipan = expires_at kotak');
select is((select count(*)::integer from public.letter_events where kind = 'box_letter'), 1,
  'publish titipan mencatat box_letter');
select is((select count(*)::integer from public.letter_events where kind = 'created'), 0,
  'titipan tidak dihitung created');

-- 12: batas kotak (di sini 2 foto) menolak titipan kedua
select throws_ok($$
  select public.publish_letter('00000000-0000-4000-8000-0000000000e2', 'TitipAAA02', '{}', 20, 2)
$$, 'P0001', 'box_full', 'titipan yang melewati batas foto ditolak');
select throws_ok($$
  select public.publish_letter('00000000-0000-4000-8000-0000000000e2', 'TitipAAA02', '{}', 1, 40)
$$, 'P0001', 'box_full', 'titipan yang melewati batas surat ditolak');
select is(
  (select status from public.publish_letter('00000000-0000-4000-8000-0000000000e2', 'TitipAAA02', '{}')),
  'sent', 'titipan yang masih muat terbit');

-- 15: surat titipan tidak bisa dibuka lewat /l/{slug}
select is((select count(*)::integer from public.open_letter('TitipAAA01')), 0,
  'open_letter tidak mengenal surat titipan');

-- 16-17: ubah jadwal menggeser masa berlaku kotak dan titipannya
select is(
  (select opens_at from public.update_box((select id from box_a),
    jsonb_build_object('opensAt', now() + interval '2 days', 'title', 'Ultah ke-20 Rani'))),
  now() + interval '2 days', 'jadwal baru dipakai');
select is(
  (select array_agg(distinct expires_at) from public.letters where box_id = (select id from box_a)),
  array[now() + interval '32 days'], 'expires_at titipan ikut bergeser');

-- 18-19: jadwal di luar jendela dan openNow + opensAt bersamaan ditolak
select throws_ok($$
  select public.update_box((select id from box_a), jsonb_build_object('opensAt', now() + interval '40 days'))
$$, 'P0001', 'invalid_box', 'jadwal lewat 30 hari setelah kotak dibuat ditolak');
select throws_ok($$
  select public.update_box((select id from box_a), '{"openNow": true, "opensAt": null}')
$$, 'P0001', 'invalid_box', 'openNow dan opensAt tidak boleh bersamaan');

-- 20: kembali ke manual
select is(
  (select scheduled::text || ':' || (opens_at = created_at + interval '30 days')
    from public.update_box((select id from box_a), '{"opensAt": null}')),
  'false:true', 'opensAt null kembali ke manual');

-- 21: sebelum opens_at, open_box tidak mengubah apa pun
select is((select opened_at from public.open_box('KotakAAAAA')), null,
  'kotak yang belum waktunya tidak bisa dibuka');

-- 22-23: Buka sekarang memakai jam server, lalu kotak tertutup untuk titipan. Selama penerima
-- belum membukanya, pembuat masih bisa mengubahnya.
select is((select opens_at from public.update_box((select id from box_a), '{"openNow": true}')), now(),
  'openNow mengisi opens_at dengan waktu server');
select is((select title from public.update_box((select id from box_a), '{"title": "Ultah Rani"}')),
  'Ultah Rani', 'kotak yang terbuka tapi belum dibuka penerima masih bisa diubah');

-- 24: titipan yang terbit setelah kotak terbuka ditolak
select public.create_letter('00000000-0000-4000-8000-0000000000e3', '{}', '{}',
  decode(repeat('ab', 32), 'hex'), null, '[]', (select id from box_a), 'Telat');
select throws_ok($$
  select public.publish_letter('00000000-0000-4000-8000-0000000000e3', 'TitipAAA03', '{}')
$$, 'P0001', 'box_closed', 'publish setelah kotak terbuka ditolak');

-- 25-27: open_box mengisi jadwal hapus foto kotak dan titipannya, dicatat box_opened
select is(
  (select photos_expire_at from public.open_box('KotakAAAAA')),
  now() + interval '7 days', 'open_box menjadwalkan hapus foto 7 hari lagi');
select is(
  (select array_agg(distinct photos_expire_at) from public.letters
    where box_id = (select id from box_a) and status = 'sent'),
  array[now() + interval '7 days'], 'jadwal hapus foto ikut ke semua titipan');
select is(
  (select array_agg(kind order by kind) from public.letter_events where kind in ('opened', 'box_opened')),
  array['box_opened'], 'membuka kotak dicatat box_opened, bukan opened per surat');

-- 28: setelah penerima membukanya, kotak tidak bisa diubah lagi
select throws_ok($$
  select public.update_box((select id from box_a), '{"title": "Telat"}')
$$, 'P0001', 'box_closed', 'kotak yang sudah dibuka penerima tidak bisa diubah');

-- 29-31: jadwal yang salah: kotak B dibuka sekarang, lalu dijadwal ulang sebelum penerima
-- membukanya. Kotaknya tersegel lagi dan titipan diterima lagi.
select public.update_box((select id from box_b), '{"openNow": true}');
select is(
  (select (opens_at = now() + interval '3 days')::text || ':' || scheduled
    from public.update_box((select id from box_b), jsonb_build_object('opensAt', now() + interval '3 days'))),
  'true:true', 'kotak yang terbuka tapi belum dibuka penerima bisa dijadwal ulang');
select is((select opened_at from public.open_box('KotakBBBBB')), null,
  'kotak yang dijadwal ulang tersegel lagi untuk penerima');
select public.create_letter('00000000-0000-4000-8000-0000000000e4', '{}', '{}',
  decode(repeat('ab', 32), 'hex'), null, '[]', (select id from box_b), 'Susulan');
select is(
  (select status from public.publish_letter('00000000-0000-4000-8000-0000000000e4', 'TitipBBB01', '{}')),
  'sent', 'titipan diterima lagi setelah kotak dijadwal ulang');

-- 32: kotak tidak bisa dihapus selama masih ada titipan
select throws_ok($$ delete from public.boxes where id = (select id from box_a) $$, '23503', null,
  'kotak dengan titipan tidak bisa dihapus langsung');

-- 33: run_cleanup mengisi photos_deleted_at kotak begitu foto semua titipannya terhapus
update public.letters set photos_expire_at = now() - interval '1 minute', opened_at = now() - interval '2 minutes',
  photos_deleted_at = now() where box_id = (select id from box_a) and status = 'sent';
update public.boxes set opened_at = now() - interval '2 minutes', photos_expire_at = now() - interval '1 minute',
  opens_at = now() - interval '3 minutes', expires_at = now() - interval '3 minutes' + interval '30 days',
  created_at = now() - interval '1 hour'
  where id = (select id from box_a);
select public.run_cleanup();
select isnt((select photos_deleted_at from public.boxes where id = (select id from box_a)), null,
  'photos_deleted_at kotak terisi setelah foto titipan terhapus');

-- 34: tertutup untuk klien
set local role anon;
select throws_ok($$ select public.create_box('KotakDDDDD', 'UndanganDDDD',
  decode(repeat('ab', 32), 'hex'), 'X', 'Y', 'laut', null) $$, '42501', null,
  'anon tidak bisa memanggil create_box');
reset role;

select * from finish();
rollback;
