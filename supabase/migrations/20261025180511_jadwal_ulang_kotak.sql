-- Jadwal ulang kotak bareng (kontrak 0.4.2): pembuat kotak masih bisa mengubah kotaknya setelah
-- opens_at lewat, selama penerima belum membukanya (opened_at kosong). Jadwal yang salah jadi tidak
-- terkunci begitu kotaknya terbuka: jadwal baru menyegelnya lagi untuk penerima dan membuka lagi
-- titipan sampai jadwal itu. Setelah penerima membukanya, jadwal hapus foto sudah berjalan dan
-- perubahan tetap ditolak box_closed.
--
-- Sama seperti versi sebelumnya kecuali dua hal: syarat box_closed memakai opened_at, bukan
-- opens_at, dan "Buka sekarang" di kotak yang sudah terbuka tidak menggeser waktu bukanya.
create or replace function public.update_box(p_id uuid, p_patch jsonb)
returns setof public.boxes
language plpgsql
set search_path = ''
as $$
declare
  box public.boxes;
  opens timestamptz;
  is_scheduled boolean;
  wanted timestamptz;
begin
  select * into box from public.boxes where id = p_id and expires_at > now() for update;
  if not found then
    return;
  end if;
  if box.opened_at is not null then
    raise exception 'box_closed' using errcode = 'P0001';
  end if;
  if p_patch ? 'openNow' and p_patch ? 'opensAt' then
    raise exception 'invalid_box' using errcode = 'P0001';
  end if;

  opens := box.opens_at;
  is_scheduled := box.scheduled;
  if p_patch ? 'openNow' then
    opens := least(box.opens_at, now());
    is_scheduled := true;
  elsif p_patch ? 'opensAt' then
    if jsonb_typeof(p_patch -> 'opensAt') = 'null' then
      opens := box.created_at + interval '30 days';
      is_scheduled := false;
    else
      wanted := (p_patch ->> 'opensAt')::timestamptz;
      if wanted <= now() or wanted > box.created_at + interval '30 days' then
        raise exception 'invalid_box' using errcode = 'P0001';
      end if;
      opens := wanted;
      is_scheduled := true;
    end if;
  end if;

  update public.boxes
  set title = coalesce(p_patch ->> 'title', title),
    recipient = coalesce(p_patch ->> 'to', recipient),
    design = coalesce(p_patch ->> 'design', design),
    opens_at = opens,
    scheduled = is_scheduled,
    expires_at = opens + interval '30 days'
  where id = p_id;

  if opens is distinct from box.opens_at then
    update public.letters
    set expires_at = opens + interval '30 days'
    where box_id = p_id and status = 'sent';
  end if;

  return query select * from public.boxes where id = p_id;
end;
$$;

revoke execute on function public.update_box(uuid, jsonb) from public, anon, authenticated;
