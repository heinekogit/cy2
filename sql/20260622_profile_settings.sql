alter table public.users
  add column if not exists display_name text,
  add column if not exists profile_image text,
  add column if not exists home_lat double precision,
  add column if not exists home_lng double precision,
  add column if not exists home_name text;
