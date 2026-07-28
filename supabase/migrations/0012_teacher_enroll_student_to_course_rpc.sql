drop function if exists public.teacher_enroll_student_by_identifier(uuid, text);

create or replace function public.teacher_enroll_student_to_course(
  p_course_id uuid,
  p_email text,
  p_full_name text,
  p_school_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_email text;
  v_full_name text;
  v_school_id text;
  v_current_full_name text;
  v_current_school_id text;
begin
  if not private.can_manage_course(p_course_id) then
    raise exception 'Not allowed to manage this course.';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  v_full_name := trim(coalesce(p_full_name, ''));
  v_school_id := nullif(trim(coalesce(p_school_id, '')), '');

  if v_email = '' then
    raise exception 'Email is required.';
  end if;

  if v_full_name = '' then
    raise exception 'Student full name is required.';
  end if;

  select profile.id, profile.full_name, profile.school_id
    into v_student_id, v_current_full_name, v_current_school_id
  from public.profiles profile
  where profile.role = 'student'
    and (
      lower(profile.email) = v_email
      or (
        v_school_id is not null
        and profile.school_id = v_school_id
      )
    )
  order by case when lower(profile.email) = v_email then 0 else 1 end
  limit 1;

  if v_student_id is null then
    raise exception 'No student with this email exists yet. An administrator must create the user first.';
  end if;

  update public.profiles
  set
    full_name = case
      when trim(coalesce(v_current_full_name, '')) = ''
        or lower(trim(v_current_full_name)) in ('тестовый ученик', 'test student')
        then v_full_name
      else full_name
    end,
    school_id = case
      when v_school_id is not null
        and (
          v_current_school_id is null
          or trim(v_current_school_id) = ''
        )
        and not exists (
          select 1
          from public.profiles other_profile
          where other_profile.school_id = v_school_id
            and other_profile.id <> v_student_id
        )
        then v_school_id
      else school_id
    end,
    updated_at = now()
  where id = v_student_id
    and role = 'student';

  if not exists (
    select 1
    from public.course_enrollments enrollment
    where enrollment.course_id = p_course_id
      and enrollment.student_id = v_student_id
  ) then
    insert into public.course_enrollments (course_id, student_id)
    values (p_course_id, v_student_id);
  end if;

  notify pgrst, 'reload schema';

  return v_student_id;
end;
$$;
