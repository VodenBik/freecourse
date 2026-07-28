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
    if new.id is distinct from old.id
      or old.student_id is distinct from auth.uid()
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
