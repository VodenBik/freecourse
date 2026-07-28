create or replace function private.is_student_enrolled_in_course(p_course_id uuid, p_student_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.course_enrollments enrollment
    where enrollment.course_id = p_course_id
      and enrollment.student_id = p_student_id
  )
  or exists (
    select 1
    from public.course_groups course_group
    join public.group_members member on member.group_id = course_group.group_id
    where course_group.course_id = p_course_id
      and member.student_id = p_student_id
  )
  or exists (
    select 1
    from public.course_enrollments enrollment
    join public.group_members member on member.group_id = enrollment.group_id
    where enrollment.course_id = p_course_id
      and member.student_id = p_student_id
  )
  or exists (
    select 1
    from public.course_enrollments enrollment
    join public.groups study_group on study_group.stream_id = enrollment.stream_id
    join public.group_members member on member.group_id = study_group.id
    where enrollment.course_id = p_course_id
      and enrollment.stream_id is not null
      and member.student_id = p_student_id
  )
$$;

drop policy if exists "staff manage modules" on public.modules;
drop policy if exists "admin or assigned teacher manage modules" on public.modules;
create policy "admin or course teacher insert modules" on public.modules
  for insert with check (private.can_manage_course(course_id));
create policy "admin or course teacher update modules" on public.modules
  for update using (private.can_manage_course(course_id))
  with check (private.can_manage_course(course_id));
create policy "admin or course teacher delete modules" on public.modules
  for delete using (private.can_manage_course(course_id));

drop policy if exists "staff manage lessons" on public.lessons;
drop policy if exists "admin or assigned teacher manage lessons" on public.lessons;
create policy "admin or course teacher insert lessons" on public.lessons
  for insert with check (
    exists (
      select 1
      from public.modules module
      where module.id = lessons.module_id
        and private.can_manage_course(module.course_id)
    )
  );
create policy "admin or course teacher update lessons" on public.lessons
  for update using (private.can_manage_lesson(id))
  with check (
    exists (
      select 1
      from public.modules module
      where module.id = lessons.module_id
        and private.can_manage_course(module.course_id)
    )
  );
create policy "admin or course teacher delete lessons" on public.lessons
  for delete using (private.can_manage_lesson(id));

drop policy if exists "staff manage materials" on public.lesson_materials;
drop policy if exists "admin or assigned teacher insert materials" on public.lesson_materials;
drop policy if exists "admin or assigned teacher update materials" on public.lesson_materials;
drop policy if exists "admin or assigned teacher delete materials" on public.lesson_materials;
create policy "admin or course teacher insert materials" on public.lesson_materials
  for insert with check (private.can_manage_lesson(lesson_id));
create policy "admin or course teacher update materials" on public.lesson_materials
  for update using (private.can_manage_lesson(lesson_id))
  with check (private.can_manage_lesson(lesson_id));
create policy "admin or course teacher delete materials" on public.lesson_materials
  for delete using (private.can_manage_lesson(lesson_id));

drop policy if exists "staff manage assignments" on public.assignments;
drop policy if exists "admin or assigned teacher insert assignments" on public.assignments;
drop policy if exists "admin or assigned teacher update assignments" on public.assignments;
drop policy if exists "admin or assigned teacher delete assignments" on public.assignments;
create policy "admin or course teacher insert assignments" on public.assignments
  for insert with check (private.can_manage_lesson(lesson_id));
create policy "admin or course teacher update assignments" on public.assignments
  for update using (private.can_manage_assignment(id))
  with check (private.can_manage_lesson(lesson_id));
create policy "admin or course teacher delete assignments" on public.assignments
  for delete using (private.can_manage_assignment(id));

create or replace function private.enforce_student_submission_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if private.current_user_role() <> 'student' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.student_id is distinct from auth.uid() then
      raise exception 'Students can create only their own submissions.';
    end if;
    new.status := 'in_review';
    new.reviewed_at := null;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.student_id is distinct from auth.uid()
      or new.student_id is distinct from old.student_id
      or new.assignment_id is distinct from old.assignment_id
      or new.status is distinct from old.status
      or new.reviewed_at is distinct from old.reviewed_at then
      raise exception 'Students can update only answer text, files, and submitted_at.';
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_student_submission_fields_trigger on public.assignment_submissions;
create trigger enforce_student_submission_fields_trigger
  before insert or update on public.assignment_submissions
  for each row execute function private.enforce_student_submission_fields();
