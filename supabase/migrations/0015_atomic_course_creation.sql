create or replace function public.create_course_for_current_user(
  p_title text,
  p_description text default '',
  p_language public.course_language default 'ru',
  p_is_active boolean default true,
  p_access_mode public.access_mode default 'manual'
)
returns public.courses
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_role public.user_role;
  v_course public.courses%rowtype;
begin
  if v_caller is null then
    raise exception 'Authentication is required.';
  end if;

  select profile.role
    into v_role
  from public.profiles profile
  where profile.id = v_caller;

  if v_role not in ('admin', 'teacher') then
    raise exception 'Only administrators and teachers can create courses.';
  end if;

  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception 'Course title is required.';
  end if;

  insert into public.courses (
    title,
    description,
    language,
    is_active,
    access_mode,
    created_by
  )
  values (
    trim(p_title),
    coalesce(p_description, ''),
    p_language,
    coalesce(p_is_active, true),
    p_access_mode,
    v_caller
  )
  returning * into v_course;

  if v_role = 'teacher' then
    insert into public.course_staff (course_id, profile_id, role)
    values (v_course.id, v_caller, 'teacher');
  end if;

  return v_course;
end;
$$;

revoke execute on function public.create_course_for_current_user(text, text, public.course_language, boolean, public.access_mode)
  from public, anon;
grant execute on function public.create_course_for_current_user(text, text, public.course_language, boolean, public.access_mode)
  to authenticated;
