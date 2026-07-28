insert into public.settings (key, value)
values (
  'school_public',
  jsonb_build_object(
    'name', '',
    'description', '',
    'email', '',
    'phone', '',
    'telegram', ''
  )
)
on conflict (key) do nothing;

create policy "public can read school settings"
on public.settings
for select
using (key = 'school_public');
