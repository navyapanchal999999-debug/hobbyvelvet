create type public.app_role as enum ('admin', 'user');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  dob date,
  gender text check (gender in ('boy','girl')),
  avatar_path text,
  notification_tone integer not null default 1 check (notification_tone between 1 and 10),
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "Signed-in users can view profiles" on public.profiles for select to authenticated using (true);
create policy "Users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "Users view own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create or replace function public.master_user_id()
returns uuid language sql stable security definer set search_path = public
as $$ select user_id from public.user_roles where role = 'admin' limit 1 $$;
grant execute on function public.master_user_id() to authenticated;

create table public.user_credentials (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  chat_pin text not null unique,
  hobby_pin text unique,
  password text not null,
  created_at timestamptz not null default now()
);
grant all on public.user_credentials to service_role;
alter table public.user_credentials enable row level security;

create table public.pin_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  created_at timestamptz not null default now()
);
create index pin_attempts_ip_idx on public.pin_attempts (ip, created_at);
grant all on public.pin_attempts to service_role;
alter table public.pin_attempts enable row level security;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text','image','video','audio')),
  body text,
  media_path text,
  created_at timestamptz not null default now()
);
create index messages_pair_idx on public.messages (sender_id, recipient_id, created_at);
create index messages_recipient_idx on public.messages (recipient_id, created_at);
grant select, insert, delete on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;
create policy "Participants read messages" on public.messages for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);
create policy "Send as yourself" on public.messages for insert to authenticated
  with check (auth.uid() = sender_id and sender_id <> recipient_id);
create policy "Participants delete messages" on public.messages for delete to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

alter publication supabase_realtime add table public.messages;

create policy "Chat media read" on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and auth.uid()::text = any (string_to_array((storage.foldername(name))[1], '_')));
create policy "Chat media upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media' and auth.uid()::text = any (string_to_array((storage.foldername(name))[1], '_')));
create policy "Chat media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'chat-media' and auth.uid()::text = any (string_to_array((storage.foldername(name))[1], '_')));

create policy "Avatars read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars');
create policy "Avatars master upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.has_role(auth.uid(), 'admin'));
create policy "Avatars master delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.has_role(auth.uid(), 'admin'));