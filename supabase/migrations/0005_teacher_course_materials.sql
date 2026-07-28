alter table public.lesson_materials
  alter column file_path drop not null,
  add column if not exists external_url text,
  add column if not exists content text;

create or replace function private.is_course_teacher(p_course_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.course_staff staff
    where staff.course_id = p_course_id
      and staff.profile_id = auth.uid()
      and staff.role = 'teacher'
  )
$$;

create or replace function private.can_manage_module(p_module_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select private.current_user_role() = 'admin'
    or exists (
      select 1
      from public.modules module
      where module.id = p_module_id
        and private.is_course_teacher(module.course_id)
    )
$$;

create or replace function private.can_manage_lesson(p_lesson_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select private.current_user_role() = 'admin'
    or exists (
      select 1
      from public.lessons lesson
      join public.modules module on module.id = lesson.module_id
      where lesson.id = p_lesson_id
        and private.is_course_teacher(module.course_id)
    )
$$;

create or replace function private.can_manage_assignment(p_assignment_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select private.current_user_role() = 'admin'
    or exists (
      select 1
      from public.assignments assignment
      where assignment.id = p_assignment_id
        and private.can_manage_lesson(assignment.lesson_id)
    )
$$;

create or replace function private.can_read_lesson(p_lesson_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select private.current_user_role() in ('admin', 'curator')
    or private.can_manage_lesson(p_lesson_id)
    or exists (
      select 1
      from public.lessons lesson
      join public.modules module on module.id = lesson.module_id
      join public.courses course on course.id = module.course_id
      left join public.course_enrollments direct_enrollment
        on direct_enrollment.course_id = course.id
        and direct_enrollment.student_id = auth.uid()
      left join public.course_enrollments group_enrollment
        on group_enrollment.course_id = course.id
        and group_enrollment.group_id in (
          select member.group_id
          from public.group_members member
          where member.student_id = auth.uid()
        )
      left join public.course_groups course_group
        on course_group.course_id = course.id
        and course_group.group_id in (
          select member.group_id
          from public.group_members member
          where member.student_id = auth.uid()
        )
      where lesson.id = p_lesson_id
        and (
          lesson.is_open_by_default
          or exists (
            select 1
            from public.lesson_access access
            where access.lesson_id = lesson.id
              and access.is_open
              and (
                (access.target_type = 'student' and access.target_id = auth.uid())
                or (
                  access.target_type = 'group'
                  and access.target_id in (
                    select member.group_id
                    from public.group_members member
                    where member.student_id = auth.uid()
                  )
                )
              )
          )
        )
        and (
          direct_enrollment.id is not null
          or group_enrollment.id is not null
          or course_group.id is not null
        )
    )
$$;

drop policy if exists "read modules for authenticated" on public.modules;
drop policy if exists "staff manage modules" on public.modules;
create policy "read modules for authenticated" on public.modules
  for select using (auth.role() = 'authenticated');
create policy "admin or assigned teacher manage modules" on public.modules
  for all using (private.current_user_role() = 'admin' or private.is_course_teacher(course_id))
  with check (private.current_user_role() = 'admin' or private.is_course_teacher(course_id));

drop policy if exists "read lessons for authenticated" on public.lessons;
drop policy if exists "staff manage lessons" on public.lessons;
create policy "read lessons for authenticated" on public.lessons
  for select using (auth.role() = 'authenticated');
create policy "admin or assigned teacher manage lessons" on public.lessons
  for all using (private.can_manage_lesson(id))
  with check (private.can_manage_module(module_id));

drop policy if exists "read materials for authenticated" on public.lesson_materials;
drop policy if exists "staff manage materials" on public.lesson_materials;
create policy "read available lesson materials" on public.lesson_materials
  for select using (private.can_read_lesson(lesson_id));
create policy "admin or assigned teacher insert materials" on public.lesson_materials
  for insert with check (private.can_manage_lesson(lesson_id));
create policy "admin or assigned teacher update materials" on public.lesson_materials
  for update using (private.can_manage_lesson(lesson_id))
  with check (private.can_manage_lesson(lesson_id));
create policy "admin or assigned teacher delete materials" on public.lesson_materials
  for delete using (private.can_manage_lesson(lesson_id));

drop policy if exists "staff manage assignments" on public.assignments;
create policy "admin or assigned teacher insert assignments" on public.assignments
  for insert with check (private.can_manage_lesson(lesson_id));
create policy "admin or assigned teacher update assignments" on public.assignments
  for update using (private.can_manage_assignment(id))
  with check (private.can_manage_lesson(lesson_id));
create policy "admin or assigned teacher delete assignments" on public.assignments
  for delete using (private.can_manage_assignment(id));
