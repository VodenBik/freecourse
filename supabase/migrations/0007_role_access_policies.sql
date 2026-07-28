alter table public.courses
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

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
$$;

create or replace function private.can_read_course(p_course_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select private.current_user_role() = 'admin'
    or private.is_course_teacher(p_course_id)
    or exists (
      select 1
      from public.courses course
      where course.id = p_course_id
        and course.is_active
        and private.is_student_enrolled_in_course(course.id, auth.uid())
    )
$$;

create or replace function private.can_manage_course(p_course_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select private.current_user_role() = 'admin'
    or private.is_course_teacher(p_course_id)
$$;

create or replace function private.course_id_for_lesson(p_lesson_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select module.course_id
  from public.lessons lesson
  join public.modules module on module.id = lesson.module_id
  where lesson.id = p_lesson_id
$$;

create or replace function private.course_id_for_assignment(p_assignment_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select private.course_id_for_lesson(assignment.lesson_id)
  from public.assignments assignment
  where assignment.id = p_assignment_id
$$;

create or replace function private.can_read_lesson(p_lesson_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select private.can_read_course(private.course_id_for_lesson(p_lesson_id))
$$;

create or replace function private.can_manage_lesson(p_lesson_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select private.can_manage_course(private.course_id_for_lesson(p_lesson_id))
$$;

create or replace function private.can_read_assignment(p_assignment_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select private.can_read_course(private.course_id_for_assignment(p_assignment_id))
$$;

create or replace function private.can_manage_assignment(p_assignment_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select private.can_manage_course(private.course_id_for_assignment(p_assignment_id))
$$;

create or replace function private.can_read_submission(p_submission_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select private.current_user_role() = 'admin'
    or exists (
      select 1
      from public.assignment_submissions submission
      where submission.id = p_submission_id
        and submission.student_id = auth.uid()
    )
    or exists (
      select 1
      from public.assignment_submissions submission
      where submission.id = p_submission_id
        and private.can_manage_assignment(submission.assignment_id)
    )
$$;

create or replace function private.can_review_submission(p_submission_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select private.current_user_role() = 'admin'
    or exists (
      select 1
      from public.assignment_submissions submission
      where submission.id = p_submission_id
        and private.can_manage_assignment(submission.assignment_id)
    )
$$;

create or replace function private.can_read_profile(p_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_profile_id = auth.uid()
    or private.current_user_role() = 'admin'
    or (
      private.current_user_role() = 'teacher'
      and exists (
        select 1
        from public.profiles student
        where student.id = p_profile_id
          and student.role = 'student'
          and exists (
            select 1
            from public.course_staff staff
            where staff.profile_id = auth.uid()
              and staff.role = 'teacher'
              and private.is_student_enrolled_in_course(staff.course_id, student.id)
          )
      )
    )
$$;

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
    if new.is_active is distinct from old.is_active
      or new.access_mode is distinct from old.access_mode
      or new.access_starts_at is distinct from old.access_starts_at
      or new.access_ends_at is distinct from old.access_ends_at
      or new.language is distinct from old.language
      or new.created_by is distinct from old.created_by then
      raise exception 'Only administrators can change course access, archive state, or language.';
    end if;
    return new;
  end if;

  raise exception 'Not allowed to update this course.';
end;
$$;

drop trigger if exists enforce_course_update_role_trigger on public.courses;
create trigger enforce_course_update_role_trigger
  before update on public.courses
  for each row execute function public.enforce_course_update_role();

drop policy if exists "read courses for authenticated" on public.courses;
drop policy if exists "staff manage courses" on public.courses;
create policy "read courses by role access" on public.courses
  for select using (private.can_read_course(id));
create policy "admin and teacher insert courses" on public.courses
  for insert with check (private.current_user_role() in ('admin', 'teacher'));
create policy "admin or assigned teacher update courses" on public.courses
  for update using (private.can_manage_course(id))
  with check (private.can_manage_course(id));
create policy "admin delete courses" on public.courses
  for delete using (private.current_user_role() = 'admin');

drop policy if exists "profiles read own or staff" on public.profiles;
create policy "profiles read by role access" on public.profiles
  for select using (private.can_read_profile(id));

drop policy if exists "course staff read staff" on public.course_staff;
drop policy if exists "course staff admin manage" on public.course_staff;
create policy "course staff read by role access" on public.course_staff
  for select using (
    private.current_user_role() = 'admin'
    or profile_id = auth.uid()
  );
create policy "admin manage course staff" on public.course_staff
  for all using (private.current_user_role() = 'admin')
  with check (private.current_user_role() = 'admin');
create policy "teacher self assign new course staff" on public.course_staff
  for insert with check (
    private.current_user_role() = 'teacher'
    and profile_id = auth.uid()
    and role = 'teacher'
    and exists (
      select 1
      from public.courses course
      where course.id = course_staff.course_id
        and course.created_by = auth.uid()
    )
  );

drop policy if exists "enrollments read own or staff" on public.course_enrollments;
create policy "enrollments read by role access" on public.course_enrollments
  for select using (
    private.current_user_role() = 'admin'
    or student_id = auth.uid()
    or private.is_course_teacher(course_id)
    or (
      group_id is not null
      and exists (
        select 1
        from public.group_members member
        where member.group_id = course_enrollments.group_id
          and member.student_id = auth.uid()
      )
    )
  );

drop policy if exists "course groups read authenticated" on public.course_groups;
create policy "course groups read by role access" on public.course_groups
  for select using (
    private.current_user_role() = 'admin'
    or private.is_course_teacher(course_id)
    or exists (
      select 1
      from public.group_members member
      where member.group_id = course_groups.group_id
        and member.student_id = auth.uid()
    )
  );

drop policy if exists "course streams read authenticated" on public.course_streams;
create policy "course streams read by role access" on public.course_streams
  for select using (
    private.current_user_role() = 'admin'
    or private.is_course_teacher(course_id)
  );

drop policy if exists "groups read for staff" on public.groups;
create policy "groups read by role access" on public.groups
  for select using (
    private.current_user_role() in ('admin', 'curator')
    or exists (
      select 1
      from public.course_groups course_group
      where course_group.group_id = groups.id
        and private.is_course_teacher(course_group.course_id)
    )
    or exists (
      select 1
      from public.group_members member
      where member.group_id = groups.id
        and member.student_id = auth.uid()
    )
  );

drop policy if exists "group members read own or staff" on public.group_members;
create policy "group members read by role access" on public.group_members
  for select using (
    student_id = auth.uid()
    or private.current_user_role() in ('admin', 'curator')
    or exists (
      select 1
      from public.course_groups course_group
      where course_group.group_id = group_members.group_id
        and private.is_course_teacher(course_group.course_id)
    )
    or exists (
      select 1
      from public.course_enrollments enrollment
      where enrollment.group_id = group_members.group_id
        and private.is_course_teacher(enrollment.course_id)
    )
  );

drop policy if exists "read modules for authenticated" on public.modules;
create policy "read modules by course access" on public.modules
  for select using (private.can_read_course(course_id));

drop policy if exists "read lessons for authenticated" on public.lessons;
create policy "read lessons by course access" on public.lessons
  for select using (private.can_read_lesson(id));

drop policy if exists "read assignments for authenticated" on public.assignments;
create policy "read assignments by course access" on public.assignments
  for select using (private.can_read_assignment(id));

drop policy if exists "lesson access read authenticated" on public.lesson_access;
create policy "lesson access read by lesson access" on public.lesson_access
  for select using (private.can_read_lesson(lesson_id));

drop policy if exists "lesson progress own or staff" on public.lesson_progress;
create policy "lesson progress read by role access" on public.lesson_progress
  for select using (
    student_id = auth.uid()
    or private.current_user_role() = 'admin'
    or private.can_manage_lesson(lesson_id)
  );

drop policy if exists "students read own submissions" on public.assignment_submissions;
drop policy if exists "students insert own submissions" on public.assignment_submissions;
drop policy if exists "students update own draft submissions" on public.assignment_submissions;
create policy "read submissions by role access" on public.assignment_submissions
  for select using (private.can_read_submission(id));
create policy "students insert own accessible submissions" on public.assignment_submissions
  for insert with check (
    student_id = auth.uid()
    and private.can_read_assignment(assignment_id)
  );
create policy "students update own accessible submissions" on public.assignment_submissions
  for update using (
    student_id = auth.uid()
    and private.can_read_assignment(assignment_id)
  )
  with check (
    student_id = auth.uid()
    and private.can_read_assignment(assignment_id)
  );
create policy "staff review accessible submissions" on public.assignment_submissions
  for update using (private.can_review_submission(id))
  with check (private.can_review_submission(id));

drop policy if exists "read grades own or staff" on public.grades;
drop policy if exists "staff manage grades" on public.grades;
create policy "read grades by submission access" on public.grades
  for select using (private.can_read_submission(submission_id));
create policy "staff manage grades by submission access" on public.grades
  for all using (private.can_review_submission(submission_id))
  with check (private.can_review_submission(submission_id));

drop policy if exists "read comments own or staff" on public.comments;
drop policy if exists "staff write comments" on public.comments;
create policy "read comments by submission access" on public.comments
  for select using (private.can_read_submission(submission_id));
create policy "staff write comments by submission access" on public.comments
  for all using (private.can_review_submission(submission_id))
  with check (private.can_review_submission(submission_id));

drop policy if exists "authenticated can read lesson files" on storage.objects;
create policy "read lesson material files by course access" on storage.objects
  for select using (
    bucket_id = 'lesson-materials'
    and exists (
      select 1
      from public.lesson_materials material
      where material.file_path = storage.objects.name
        and private.can_read_lesson(material.lesson_id)
    )
  );

drop policy if exists "staff can upload lesson files" on storage.objects;
drop policy if exists "staff can update lesson files" on storage.objects;
create policy "write lesson material files by course access" on storage.objects
  for insert with check (
    bucket_id = 'lesson-materials'
    and (
      private.current_user_role() = 'admin'
      or private.can_manage_lesson(((storage.foldername(name))[1])::uuid)
    )
  );
create policy "update lesson material files by course access" on storage.objects
  for update using (
    bucket_id = 'lesson-materials'
    and (
      private.current_user_role() = 'admin'
      or private.can_manage_lesson(((storage.foldername(name))[1])::uuid)
    )
  );
create policy "delete lesson material files by course access" on storage.objects
  for delete using (
    bucket_id = 'lesson-materials'
    and (
      private.current_user_role() = 'admin'
      or private.can_manage_lesson(((storage.foldername(name))[1])::uuid)
    )
  );
