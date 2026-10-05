-- Stage 1 security hardening.
-- Existing migrations remain unchanged.

create or replace function private.enforce_profile_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;

  if private.current_user_role() = 'admin' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.id is distinct from auth.uid()
      or new.role is distinct from 'student'::public.user_role
      or new.school_id is not null
      or lower(coalesce(new.email, '')) is distinct from lower(coalesce((
        select auth_user.email from auth.users auth_user where auth_user.id = auth.uid()
      ), '')) then
      raise exception 'A user may create only their own student profile.';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.id is distinct from auth.uid()
      or new.id is distinct from old.id
      or new.role is distinct from old.role
      or new.school_id is distinct from old.school_id
      or new.email is distinct from old.email
      or new.created_at is distinct from old.created_at then
      raise exception 'A user may update only personal profile fields.';
    end if;
    return new;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_profile_permissions() from public, anon, authenticated;

drop trigger if exists enforce_profile_permissions_trigger on public.profiles;
create trigger enforce_profile_permissions_trigger
  before insert or update on public.profiles
  for each row execute function private.enforce_profile_permissions();

drop policy if exists "profiles update own limited" on public.profiles;
drop policy if exists "profiles insert admin" on public.profiles;

create policy "profiles insert self as student or admin" on public.profiles
  for insert to authenticated
  with check (
    private.current_user_role() = 'admin'
    or (id = auth.uid() and role = 'student' and school_id is null)
  );

create policy "profiles update self or admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or private.current_user_role() = 'admin')
  with check (id = auth.uid() or private.current_user_role() = 'admin');

-- Teachers may enroll an already registered student, but enrollment must never
-- require a teacher to update that student's profile.  Keeping the RPC limited
-- to enrollment avoids a bypass around enforce_profile_permissions.
create unique index if not exists course_enrollments_direct_student_unique
  on public.course_enrollments (course_id, student_id)
  where student_id is not null;

create or replace function public.teacher_enroll_student_to_course(
  p_course_id uuid,
  p_email text,
  p_full_name text,
  p_school_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student_id uuid;
  v_email text;
begin
  if not private.can_manage_course(p_course_id) then
    raise exception 'Not allowed to manage this course.';
  end if;

  if not exists (
    select 1
    from public.courses course
    where course.id = p_course_id and course.is_active
  ) then
    raise exception 'The course is not active.';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    raise exception 'Student email is required.';
  end if;

  select profile.id
    into v_student_id
  from public.profiles profile
  where profile.role = 'student'
    and lower(profile.email) = v_email
  limit 1;

  if v_student_id is null then
    raise exception 'No student with this email exists yet. Invite the student first.';
  end if;

  insert into public.course_enrollments (course_id, student_id)
  values (p_course_id, v_student_id)
  on conflict do nothing;

  return v_student_id;
end;
$$;

alter function public.teacher_enroll_student_to_course(uuid, text, text, text)
  set search_path = public, pg_temp;
revoke execute on function public.teacher_enroll_student_to_course(uuid, text, text, text)
  from public, anon;
grant execute on function public.teacher_enroll_student_to_course(uuid, text, text, text)
  to authenticated;

create or replace function private.is_time_window_open(
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select (p_starts_at is null or p_starts_at <= now())
    and (p_ends_at is null or p_ends_at >= now())
$$;

create or replace function private.is_student_enrolled_in_course(
  p_course_id uuid,
  p_student_id uuid
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.course_enrollments enrollment
    where enrollment.course_id = p_course_id
      and enrollment.student_id = p_student_id
      and private.is_time_window_open(enrollment.starts_at, enrollment.ends_at)
  )
  or exists (
    select 1 from public.course_groups course_group
    join public.group_members member on member.group_id = course_group.group_id
    where course_group.course_id = p_course_id and member.student_id = p_student_id
  )
  or exists (
    select 1 from public.course_enrollments enrollment
    join public.group_members member on member.group_id = enrollment.group_id
    where enrollment.course_id = p_course_id
      and member.student_id = p_student_id
      and private.is_time_window_open(enrollment.starts_at, enrollment.ends_at)
  )
  or exists (
    select 1 from public.course_enrollments enrollment
    join public.groups study_group on study_group.stream_id = enrollment.stream_id
    join public.group_members member on member.group_id = study_group.id
    where enrollment.course_id = p_course_id
      and member.student_id = p_student_id
      and private.is_time_window_open(enrollment.starts_at, enrollment.ends_at)
  )
$$;

create or replace function private.can_read_course(p_course_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select private.current_user_role() = 'admin'
    or private.is_course_teacher(p_course_id)
    or (
      private.current_user_role() = 'student'
      and exists (
        select 1 from public.courses course
        where course.id = p_course_id
          and course.is_active
          and private.is_time_window_open(course.access_starts_at, course.access_ends_at)
          and private.is_student_enrolled_in_course(course.id, auth.uid())
      )
    )
$$;

create or replace function private.has_active_lesson_access(
  p_lesson_id uuid,
  p_student_id uuid
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.lesson_access access
    where access.lesson_id = p_lesson_id
      and access.is_open
      and private.is_time_window_open(access.starts_at, access.ends_at)
      and (
        (access.target_type = 'student' and access.target_id = p_student_id)
        or (
          access.target_type = 'group'
          and exists (
            select 1 from public.group_members member
            where member.group_id = access.target_id and member.student_id = p_student_id
          )
        )
        or (
          access.target_type = 'stream'
          and exists (
            select 1 from public.groups study_group
            join public.group_members member on member.group_id = study_group.id
            where study_group.stream_id = access.target_id and member.student_id = p_student_id
          )
        )
      )
  )
$$;

create or replace function private.previous_lesson_id(p_lesson_id uuid)
returns uuid
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select ordered.previous_id
  from (
    select lesson.id,
      lag(lesson.id) over (
        order by course_module.sort_order, course_module.id, lesson.sort_order, lesson.id
      ) as previous_id
    from public.lessons lesson
    join public.modules course_module on course_module.id = lesson.module_id
    where course_module.course_id = private.course_id_for_lesson(p_lesson_id)
  ) ordered
  where ordered.id = p_lesson_id
$$;

create or replace function private.previous_lesson_requirement_met(
  p_lesson_id uuid,
  p_student_id uuid,
  p_review_required boolean
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select private.previous_lesson_id(p_lesson_id) is null
    or not exists (
      select 1 from public.assignments assignment
      where assignment.lesson_id = private.previous_lesson_id(p_lesson_id)
    )
    or exists (
      select 1 from public.assignments assignment
      join public.assignment_submissions submission on submission.assignment_id = assignment.id
      where assignment.lesson_id = private.previous_lesson_id(p_lesson_id)
        and submission.student_id = p_student_id
        and (
          (p_review_required and submission.status = 'accepted')
          or (
            not p_review_required
            and submission.status in ('submitted', 'in_review', 'accepted', 'needs_revision')
          )
        )
    )
$$;

create or replace function private.can_read_lesson(p_lesson_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select private.current_user_role() = 'admin'
    or private.can_manage_lesson(p_lesson_id)
    or (
      private.current_user_role() = 'student'
      and exists (
        select 1 from public.lessons lesson
        join public.modules course_module on course_module.id = lesson.module_id
        join public.courses course on course.id = course_module.course_id
        where lesson.id = p_lesson_id
          and private.can_read_course(course.id)
          and (
            course.access_mode = 'all_open'
            or lesson.is_open_by_default
            or private.has_active_lesson_access(lesson.id, auth.uid())
            or (
              course.access_mode = 'after_submission'
              and private.previous_lesson_requirement_met(lesson.id, auth.uid(), false)
            )
            or (
              course.access_mode = 'after_review'
              and private.previous_lesson_requirement_met(lesson.id, auth.uid(), true)
            )
          )
      )
    )
$$;

create or replace function private.can_read_assignment(p_assignment_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.assignments assignment
    where assignment.id = p_assignment_id
      and private.can_read_lesson(assignment.lesson_id)
  )
$$;

create or replace function private.enforce_student_submission_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or private.current_user_role() is distinct from 'student' then
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
    if new.id is distinct from old.id
      or old.student_id is distinct from auth.uid()
      or new.student_id is distinct from old.student_id
      or new.assignment_id is distinct from old.assignment_id then
      raise exception 'Students cannot change submission ownership.';
    end if;

    if old.status = 'accepted'
      or (old.reviewed_at is not null and old.status <> 'needs_revision') then
      raise exception 'A reviewed submission is immutable unless revision was requested.';
    end if;

    if old.status = 'needs_revision' then
      new.status := 'in_review';
      new.reviewed_at := null;
    elsif new.status is distinct from old.status
      or new.reviewed_at is distinct from old.reviewed_at then
      raise exception 'Students cannot change review fields.';
    end if;
    return new;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_student_submission_fields() from public, anon, authenticated;

create or replace function private.is_curator_for_group(p_group_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select private.current_user_role() = 'curator'
    and exists (
      select 1 from public.groups study_group
      where study_group.id = p_group_id and study_group.curator_id = auth.uid()
    )
$$;

create or replace function private.is_curator_for_student(p_student_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select private.current_user_role() = 'curator'
    and exists (
      select 1 from public.groups study_group
      join public.group_members member on member.group_id = study_group.id
      where study_group.curator_id = auth.uid() and member.student_id = p_student_id
    )
$$;

create or replace function private.is_student_in_group(
  p_group_id uuid,
  p_student_id uuid
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.group_members member
    where member.group_id = p_group_id and member.student_id = p_student_id
  )
$$;

create or replace function private.is_teacher_for_group(p_group_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select private.current_user_role() = 'teacher'
    and (
      exists (
        select 1 from public.course_groups course_group
        where course_group.group_id = p_group_id
          and private.is_course_teacher(course_group.course_id)
      )
      or exists (
        select 1 from public.course_enrollments enrollment
        where enrollment.group_id = p_group_id
          and private.is_course_teacher(enrollment.course_id)
      )
    )
$$;

create or replace function private.is_teacher_for_stream(p_stream_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select private.current_user_role() = 'teacher'
    and (
      exists (
        select 1 from public.course_streams course_stream
        where course_stream.stream_id = p_stream_id
          and private.is_course_teacher(course_stream.course_id)
      )
      or exists (
        select 1 from public.groups study_group
        join public.course_groups course_group on course_group.group_id = study_group.id
        where study_group.stream_id = p_stream_id
          and private.is_course_teacher(course_group.course_id)
      )
    )
$$;

create or replace function private.is_curator_for_stream(p_stream_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select private.current_user_role() = 'curator'
    and exists (
      select 1 from public.groups study_group
      where study_group.stream_id = p_stream_id and study_group.curator_id = auth.uid()
    )
$$;

create or replace function private.can_curate_lesson_progress(
  p_lesson_id uuid,
  p_student_id uuid
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select private.is_curator_for_student(p_student_id)
    and private.is_student_enrolled_in_course(
      private.course_id_for_lesson(p_lesson_id), p_student_id
    )
$$;

create or replace function private.can_read_profile(p_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select p_profile_id = auth.uid()
    or private.current_user_role() = 'admin'
    or (
      private.current_user_role() = 'teacher'
      and exists (
        select 1 from public.profiles student
        where student.id = p_profile_id
          and student.role = 'student'
          and exists (
            select 1 from public.course_staff staff
            where staff.profile_id = auth.uid()
              and staff.role = 'teacher'
              and private.is_student_enrolled_in_course(staff.course_id, student.id)
          )
      )
    )
    or private.is_curator_for_student(p_profile_id)
$$;

drop policy if exists "groups read by role access" on public.groups;
create policy "groups read by role access" on public.groups
  for select to authenticated
  using (
    private.current_user_role() = 'admin'
    or private.is_curator_for_group(id)
    or private.is_teacher_for_group(id)
    or private.is_student_in_group(id, auth.uid())
  );

drop policy if exists "group members read by role access" on public.group_members;
create policy "group members read by role access" on public.group_members
  for select to authenticated
  using (
    student_id = auth.uid()
    or private.current_user_role() = 'admin'
    or private.is_curator_for_group(group_id)
    or private.is_teacher_for_group(group_id)
  );

drop policy if exists "course groups read by role access" on public.course_groups;
create policy "course groups read by role access" on public.course_groups
  for select to authenticated
  using (
    private.current_user_role() = 'admin'
    or private.is_course_teacher(course_id)
    or private.is_student_in_group(group_id, auth.uid())
  );

drop policy if exists "streams read by role ownership" on public.streams;
create policy "streams read by role ownership" on public.streams
  for select to authenticated
  using (
    private.current_user_role() = 'admin'
    or private.is_curator_for_stream(id)
    or private.is_teacher_for_stream(id)
  );

drop policy if exists "lesson progress own insert" on public.lesson_progress;
drop policy if exists "lesson progress own update" on public.lesson_progress;
drop policy if exists "lesson progress read by role access" on public.lesson_progress;

create policy "lesson progress read by role access" on public.lesson_progress
  for select to authenticated
  using (
    student_id = auth.uid()
    or private.current_user_role() = 'admin'
    or (private.current_user_role() = 'teacher' and private.can_manage_lesson(lesson_id))
    or private.can_curate_lesson_progress(lesson_id, student_id)
  );

create policy "students insert own lesson progress" on public.lesson_progress
  for insert to authenticated
  with check (
    private.current_user_role() = 'student'
    and student_id = auth.uid()
    and private.can_read_lesson(lesson_id)
  );

create policy "students update own lesson progress" on public.lesson_progress
  for update to authenticated
  using (
    private.current_user_role() = 'student'
    and student_id = auth.uid()
    and private.can_read_lesson(lesson_id)
  )
  with check (
    private.current_user_role() = 'student'
    and student_id = auth.uid()
    and private.can_read_lesson(lesson_id)
  );

create policy "teachers update assigned lesson progress" on public.lesson_progress
  for update to authenticated
  using (private.current_user_role() = 'teacher' and private.can_manage_lesson(lesson_id))
  with check (private.current_user_role() = 'teacher' and private.can_manage_lesson(lesson_id));

create policy "curators update scoped lesson progress" on public.lesson_progress
  for update to authenticated
  using (private.can_curate_lesson_progress(lesson_id, student_id))
  with check (private.can_curate_lesson_progress(lesson_id, student_id));

create policy "admin update lesson progress" on public.lesson_progress
  for update to authenticated
  using (private.current_user_role() = 'admin')
  with check (private.current_user_role() = 'admin');

create or replace function private.enforce_lesson_progress_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if private.current_user_role() <> 'admin'
    and (
      new.id is distinct from old.id
      or new.lesson_id is distinct from old.lesson_id
      or new.student_id is distinct from old.student_id
      or new.created_at is distinct from old.created_at
    ) then
    raise exception 'Only progress state may be updated.';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_lesson_progress_identity() from public, anon, authenticated;

drop trigger if exists enforce_lesson_progress_identity_trigger on public.lesson_progress;
create trigger enforce_lesson_progress_identity_trigger
  before update on public.lesson_progress
  for each row execute function private.enforce_lesson_progress_identity();

update storage.buckets
set public = false,
  file_size_limit = 20971520,
  allowed_mime_types = array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/zip',
    'application/x-zip-compressed'
  ]
where id = 'assignment-submissions';

update storage.buckets
set public = false
where id = 'lesson-materials';

drop policy if exists "students can upload own submission files" on storage.objects;
drop policy if exists "students can read own submission files" on storage.objects;
drop policy if exists "staff can update submission files" on storage.objects;
drop policy if exists "students can delete own submission files" on storage.objects;

create policy "students upload validated submission files" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'assignment-submissions'
    and array_length(storage.foldername(name), 1) = 2
    and auth.uid()::text = (storage.foldername(name))[1]
    and lower(storage.extension(name)) = any (array[
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
      'txt', 'jpg', 'jpeg', 'png', 'webp', 'zip'
    ])
    and exists (
      select 1 from public.assignments assignment
      where assignment.id::text = (storage.foldername(name))[2]
        and assignment.allow_file_upload
        and private.can_read_assignment(assignment.id)
    )
    and not exists (
      select 1 from public.assignment_submissions submission
      where submission.student_id = auth.uid()
        and submission.assignment_id::text = (storage.foldername(name))[2]
        and (
          submission.status = 'accepted'
          or (submission.reviewed_at is not null and submission.status <> 'needs_revision')
        )
    )
  );

create policy "read assignment files by owner or course staff" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'assignment-submissions'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or private.current_user_role() = 'admin'
      or private.can_manage_assignment(
        case
          when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then ((storage.foldername(name))[2])::uuid
          else null
        end
      )
    )
  );

create policy "update assignment files by submission state or course staff" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'assignment-submissions'
    and (
      private.current_user_role() = 'admin'
      or private.can_manage_assignment(
        case
          when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then ((storage.foldername(name))[2])::uuid
          else null
        end
      )
      or (
        auth.uid()::text = (storage.foldername(name))[1]
        and not exists (
          select 1 from public.assignment_submissions submission
          where name = any (submission.file_paths)
            and (
              submission.student_id <> auth.uid()
              or submission.status = 'accepted'
              or (submission.reviewed_at is not null and submission.status <> 'needs_revision')
            )
        )
      )
    )
  )
  with check (
    bucket_id = 'assignment-submissions'
    and array_length(storage.foldername(name), 1) = 2
    and lower(storage.extension(name)) = any (array[
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
      'txt', 'jpg', 'jpeg', 'png', 'webp', 'zip'
    ])
    and exists (
      select 1 from public.assignments assignment
      where assignment.id::text = (storage.foldername(name))[2]
        and assignment.allow_file_upload
        and (
          private.current_user_role() = 'admin'
          or private.can_manage_assignment(assignment.id)
          or (
            auth.uid()::text = (storage.foldername(name))[1]
            and private.can_read_assignment(assignment.id)
            and not exists (
              select 1 from public.assignment_submissions submission
              where name = any (submission.file_paths)
                and (
                  submission.student_id <> auth.uid()
                  or submission.status = 'accepted'
                  or (submission.reviewed_at is not null and submission.status <> 'needs_revision')
                )
            )
          )
        )
    )
  );

create policy "delete assignment files by submission state or course staff" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'assignment-submissions'
    and (
      private.current_user_role() = 'admin'
      or private.can_manage_assignment(
        case
          when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then ((storage.foldername(name))[2])::uuid
          else null
        end
      )
      or (
        auth.uid()::text = (storage.foldername(name))[1]
        and not exists (
          select 1 from public.assignment_submissions submission
          where name = any (submission.file_paths)
            and (
              submission.student_id <> auth.uid()
              or submission.status = 'accepted'
              or (submission.reviewed_at is not null and submission.status <> 'needs_revision')
            )
        )
      )
    )
  );
