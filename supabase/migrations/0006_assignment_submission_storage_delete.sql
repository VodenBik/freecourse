drop policy if exists "students can read own submission files" on storage.objects;
drop policy if exists "staff can update submission files" on storage.objects;

create policy "read assignment submission files by owner or course staff" on storage.objects
  for select using (
    bucket_id = 'assignment-submissions'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or private.current_user_role() = 'admin'
      or exists (
        select 1
        from public.assignments assignment
        join public.lessons lesson on lesson.id = assignment.lesson_id
        join public.modules course_module on course_module.id = lesson.module_id
        join public.course_staff staff on staff.course_id = course_module.course_id
        where assignment.id::text = (storage.foldername(name))[2]
          and staff.profile_id = auth.uid()
          and staff.role = 'teacher'
      )
    )
  );

create policy "students can delete own submission files" on storage.objects
  for delete using (
    bucket_id = 'assignment-submissions'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
