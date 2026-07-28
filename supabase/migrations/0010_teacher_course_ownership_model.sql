create or replace function public.enforce_course_update_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if private.current_user_role() = 'admin' then
    return new;
  end if;

  if private.current_user_role() = 'teacher' and private.is_course_teacher(old.id) then
    if new.id is distinct from old.id
      or new.created_by is distinct from old.created_by then
      raise exception 'Teachers cannot change course id or creator.';
    end if;
    return new;
  end if;

  raise exception 'Not allowed to update this course.';
end;
$$;

drop policy if exists "admin delete courses" on public.courses;
create policy "admin or course teacher delete courses" on public.courses
  for delete using (private.can_manage_course(id));

drop policy if exists "teacher manage own course enrollments" on public.course_enrollments;
create policy "teacher manage own course enrollments" on public.course_enrollments
  for all using (private.is_course_teacher(course_id))
  with check (
    private.is_course_teacher(course_id)
    and (
      student_id is not null
      or group_id is not null
      or stream_id is not null
    )
  );

drop policy if exists "teacher manage own lesson access" on public.lesson_access;
create policy "teacher manage own lesson access" on public.lesson_access
  for all using (private.can_manage_lesson(lesson_id))
  with check (private.can_manage_lesson(lesson_id));

create or replace function public.teacher_enroll_student_by_identifier(
  p_course_id uuid,
  p_identifier text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_identifier text;
begin
  if not private.can_manage_course(p_course_id) then
    raise exception 'Not allowed to manage this course.';
  end if;

  v_identifier := trim(p_identifier);
  if v_identifier = '' then
    raise exception 'Student email or school id is required.';
  end if;

  select profile.id
    into v_student_id
  from public.profiles profile
  where profile.role = 'student'
    and (
      lower(profile.email) = lower(v_identifier)
      or profile.school_id = v_identifier
    )
  limit 1;

  if v_student_id is null then
    raise exception 'Student was not found.';
  end if;

  if not exists (
    select 1
    from public.course_enrollments enrollment
    where enrollment.course_id = p_course_id
      and enrollment.student_id = v_student_id
  ) then
    insert into public.course_enrollments (course_id, student_id)
    values (p_course_id, v_student_id);
  end if;

  return v_student_id;
end;
$$;

create or replace function public.delete_course_deep(p_course_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.can_manage_course(p_course_id) then
    raise exception 'Not allowed to delete this course.';
  end if;

  delete from public.comments
  where submission_id in (
    select submission.id
    from public.assignment_submissions submission
    join public.assignments assignment on assignment.id = submission.assignment_id
    join public.lessons lesson on lesson.id = assignment.lesson_id
    join public.modules module on module.id = lesson.module_id
    where module.course_id = p_course_id
  );

  delete from public.grades
  where submission_id in (
    select submission.id
    from public.assignment_submissions submission
    join public.assignments assignment on assignment.id = submission.assignment_id
    join public.lessons lesson on lesson.id = assignment.lesson_id
    join public.modules module on module.id = lesson.module_id
    where module.course_id = p_course_id
  );

  delete from public.assignment_submissions
  where assignment_id in (
    select assignment.id
    from public.assignments assignment
    join public.lessons lesson on lesson.id = assignment.lesson_id
    join public.modules module on module.id = lesson.module_id
    where module.course_id = p_course_id
  );

  delete from public.lesson_progress
  where lesson_id in (
    select lesson.id
    from public.lessons lesson
    join public.modules module on module.id = lesson.module_id
    where module.course_id = p_course_id
  );

  delete from public.lesson_access
  where lesson_id in (
    select lesson.id
    from public.lessons lesson
    join public.modules module on module.id = lesson.module_id
    where module.course_id = p_course_id
  );

  delete from public.courses where id = p_course_id;
end;
$$;
