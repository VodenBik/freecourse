insert into storage.buckets (id, name, public)
values ('assignment-submissions', 'assignment-submissions', false)
on conflict (id) do nothing;

create policy "students can upload own submission files" on storage.objects
  for insert with check (
    bucket_id = 'assignment-submissions'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "students can read own submission files" on storage.objects
  for select using (
    bucket_id = 'assignment-submissions'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or private.current_user_role() in ('admin', 'teacher', 'curator')
    )
  );

create policy "staff can update submission files" on storage.objects
  for update using (
    bucket_id = 'assignment-submissions'
    and private.current_user_role() in ('admin', 'teacher', 'curator')
  );
