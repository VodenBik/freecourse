-- A row returned by INSERT must be readable without querying the just-created
-- submission through a helper. This preserves the existing access scope while
-- allowing PostgREST INSERT ... RETURNING for a student's own submission.
drop policy if exists "read submissions by role access" on public.assignment_submissions;

create policy "read submissions by role access" on public.assignment_submissions
  for select to authenticated
  using (
    student_id = auth.uid()
    or private.current_user_role() = 'admin'
    or private.can_manage_assignment(assignment_id)
  );
