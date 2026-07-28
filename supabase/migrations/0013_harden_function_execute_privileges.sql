-- Prevent trigger functions from being called directly through the API and
-- limit course-management RPC functions to authenticated users.

alter function public.set_updated_at()
  set search_path = public, pg_temp;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

alter function public.enforce_course_update_role()
  set search_path = public, pg_temp;
revoke execute on function public.enforce_course_update_role() from public, anon, authenticated;

alter function public.delete_course_deep(uuid)
  set search_path = public, pg_temp;
revoke execute on function public.delete_course_deep(uuid) from public, anon;
grant execute on function public.delete_course_deep(uuid) to authenticated;

alter function public.teacher_enroll_student_to_course(uuid, text, text, text)
  set search_path = public, pg_temp;
revoke execute on function public.teacher_enroll_student_to_course(uuid, text, text, text)
  from public, anon;
grant execute on function public.teacher_enroll_student_to_course(uuid, text, text, text)
  to authenticated;

do $$
begin
  if to_regprocedure('public.teacher_enroll_student_by_identifier(uuid,text)') is not null then
    execute 'alter function public.teacher_enroll_student_by_identifier(uuid, text)
      set search_path = public, pg_temp';
    execute 'revoke execute on function public.teacher_enroll_student_by_identifier(uuid, text)
      from public, anon';
    execute 'grant execute on function public.teacher_enroll_student_by_identifier(uuid, text)
      to authenticated';
  end if;
end;
$$;
