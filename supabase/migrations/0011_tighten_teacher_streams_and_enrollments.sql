drop policy if exists "streams read for staff" on public.streams;
create policy "streams read by role ownership" on public.streams
  for select using (
    private.current_user_role() in ('admin', 'curator')
    or exists (
      select 1
      from public.course_streams course_stream
      where course_stream.stream_id = streams.id
        and private.is_course_teacher(course_stream.course_id)
    )
    or exists (
      select 1
      from public.groups "group"
      join public.course_groups course_group on course_group.group_id = "group".id
      where "group".stream_id = streams.id
        and private.is_course_teacher(course_group.course_id)
    )
  );

drop policy if exists "enrollments read by role access" on public.course_enrollments;
drop policy if exists "enrollments admin manage" on public.course_enrollments;
drop policy if exists "teacher manage own course enrollments" on public.course_enrollments;

create policy "admin manage all course enrollments" on public.course_enrollments
  for all using (private.current_user_role() = 'admin')
  with check (private.current_user_role() = 'admin');

create policy "students read own course enrollments" on public.course_enrollments
  for select using (
    student_id = auth.uid()
    or (
      group_id is not null
      and exists (
        select 1
        from public.group_members member
        where member.group_id = course_enrollments.group_id
          and member.student_id = auth.uid()
      )
    )
    or (
      stream_id is not null
      and exists (
        select 1
        from public.groups "group"
        join public.group_members member on member.group_id = "group".id
        where "group".stream_id = course_enrollments.stream_id
          and member.student_id = auth.uid()
      )
    )
  );

create policy "teacher read own course enrollments" on public.course_enrollments
  for select using (private.is_course_teacher(course_id));

create policy "teacher insert direct student enrollments" on public.course_enrollments
  for insert with check (
    private.is_course_teacher(course_id)
    and student_id is not null
    and group_id is null
    and stream_id is null
  );

create policy "teacher delete direct student enrollments" on public.course_enrollments
  for delete using (
    private.is_course_teacher(course_id)
    and student_id is not null
    and group_id is null
    and stream_id is null
  );
