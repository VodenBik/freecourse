-- Preserve existing organization settings while filling any missing public
-- settings fields with empty values. Organization branding is user-managed.
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
on conflict (key) do update
set
  value = jsonb_build_object(
    'name', coalesce(public.settings.value->>'name', ''),
    'description', coalesce(public.settings.value->>'description', ''),
    'email', coalesce(public.settings.value->>'email', ''),
    'phone', coalesce(public.settings.value->>'phone', ''),
    'telegram', coalesce(public.settings.value->>'telegram', '')
  ),
  updated_at = now();
