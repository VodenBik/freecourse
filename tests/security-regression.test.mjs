import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/0014_stage1_security_hardening.sql", import.meta.url),
  "utf8",
);
const atomicCourseCreation = readFileSync(
  new URL("../supabase/migrations/0015_atomic_course_creation.sql", import.meta.url),
  "utf8",
);
const submissionReturningPolicy = readFileSync(
  new URL("../supabase/migrations/0016_submission_returning_read_policy.sql", import.meta.url),
  "utf8",
);
const initialSchema = readFileSync(
  new URL("../supabase/migrations/0001_initial_schema.sql", import.meta.url),
  "utf8",
);
const submissionStorage = readFileSync(
  new URL("../supabase/migrations/0002_assignment_submission_storage.sql", import.meta.url),
  "utf8",
);
const submissionStorageAccess = readFileSync(
  new URL("../supabase/migrations/0006_assignment_submission_storage_delete.sql", import.meta.url),
  "utf8",
);
const roleAccess = readFileSync(
  new URL("../supabase/migrations/0007_role_access_policies.sql", import.meta.url),
  "utf8",
);
const adminPanel = readFileSync(
  new URL("../src/components/admin/admin-panel.tsx", import.meta.url),
  "utf8",
);
const studentDashboard = readFileSync(
  new URL("../src/components/dashboard/student-dashboard.tsx", import.meta.url),
  "utf8",
);
const schoolApi = readFileSync(new URL("../src/lib/school-api.ts", import.meta.url), "utf8");
const invitationRoute = readFileSync(
  new URL("../src/app/api/admin/invitations/route.ts", import.meta.url),
  "utf8",
);
const providers = readFileSync(new URL("../src/components/providers.tsx", import.meta.url), "utf8");
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

test("self-created profiles are forced to the student role", () => {
  assert.match(migration, /new\.role is distinct from 'student'/);
  assert.match(migration, /role = 'student'/);
  assert.match(migration, /new\.school_id is not null/);
  assert.match(migration, /auth\.jwt\(\) ->> 'role'/);
  assert.match(migration, /= 'service_role'/);
});

test("self profile updates cannot change administrative fields", () => {
  for (const field of ["role", "school_id", "email", "created_at"]) {
    assert.match(migration, new RegExp(`new\\.${field} is distinct from old\\.${field}`));
  }
  assert.match(migration, /private\.current_user_role\(\) = 'admin'/);
});

test("lesson access is enforced by course, time window, target, and mode", () => {
  for (const fragment of [
    "course.is_active",
    "course.access_starts_at",
    "course.access_ends_at",
    "access.target_type = 'student'",
    "access.target_type = 'group'",
    "access.target_type = 'stream'",
    "course.access_mode = 'after_submission'",
    "course.access_mode = 'after_review'",
  ]) {
    assert.ok(migration.includes(fragment), `missing lesson access guard: ${fragment}`);
  }
  assert.match(migration, /private\.can_read_lesson\(assignment\.lesson_id\)/);
  assert.match(roleAccess, /material\.file_path = storage\.objects\.name/);
  assert.match(roleAccess, /private\.can_read_lesson\(material\.lesson_id\)/);
});

test("accepted work and reviewed work without revision are immutable", () => {
  assert.match(migration, /old\.status = 'accepted'/);
  assert.match(migration, /old\.reviewed_at is not null and old\.status <> 'needs_revision'/);
  assert.match(migration, /new\.status := 'in_review'/);
  assert.match(studentDashboard, /submission\.status !== "accepted"/);
  assert.match(studentDashboard, /submission\.status === "needs_revision"/);
});

test("submission Storage validates ownership, assignment, type, size, and state", () => {
  assert.match(migration, /file_size_limit = 20971520/);
  assert.match(migration, /allowed_mime_types = array/);
  assert.match(migration, /array_length\(storage\.foldername\(name\), 1\) = 2/);
  assert.match(migration, /assignment\.allow_file_upload/);
  assert.match(migration, /submission\.status = 'accepted'/);
  assert.match(migration, /private\.can_manage_assignment/);
  assert.match(migration, /drop policy if exists "students can read own submission files"/);
  assert.match(migration, /drop policy if exists "staff can update submission files"/);
  assert.match(migration, /read assignment files by owner or course staff/);
  assert.match(migration, /update assignment files by submission state or course staff/);
});

test("progress and curator access are scoped", () => {
  assert.match(migration, /teachers update assigned lesson progress/);
  assert.match(migration, /private\.can_manage_lesson\(lesson_id\)/);
  assert.match(migration, /private\.can_curate_lesson_progress/);
  assert.match(migration, /study_group\.curator_id = auth\.uid\(\)/);
  assert.match(migration, /private\.is_student_in_group/);
  assert.match(migration, /private\.is_teacher_for_group/);
  assert.match(migration, /private\.is_teacher_for_stream/);
  assert.match(adminPanel, /profile\?\.role === "curator"/);
  assert.match(adminPanel, /tab\.id === "stats"/);
});

test("submission, grade, and teacher access remain scoped by RLS", () => {
  assert.match(roleAccess, /submission\.student_id = auth\.uid\(\)/);
  assert.match(roleAccess, /private\.can_manage_assignment\(submission\.assignment_id\)/);
  assert.match(roleAccess, /read grades by submission access/);
  assert.match(roleAccess, /private\.can_read_submission\(submission_id\)/);
  assert.match(roleAccess, /private\.is_course_teacher\(p_course_id\)/);
  assert.match(roleAccess, /admin manage course staff/);
});

test("submission reads use row-scoped access so INSERT RETURNING is safe", () => {
  assert.match(submissionReturningPolicy, /student_id = auth\.uid\(\)/);
  assert.match(submissionReturningPolicy, /private\.current_user_role\(\) = 'admin'/);
  assert.match(submissionReturningPolicy, /private\.can_manage_assignment\(assignment_id\)/);
  assert.doesNotMatch(submissionReturningPolicy, /using \(true\)|with check \(true\)/i);
  assert.doesNotMatch(submissionReturningPolicy, /private\.can_read_submission\(id\)/);
});

test("both application buckets remain private", () => {
  assert.match(
    initialSchema,
    /values \('lesson-materials', 'lesson-materials', false\)/,
  );
  assert.match(
    submissionStorage,
    /values \('assignment-submissions', 'assignment-submissions', false\)/,
  );
  assert.match(submissionStorageAccess, /staff\.profile_id = auth\.uid\(\)/);
  assert.match(migration, /set public = false/);
});

test("Storage cleanup has rollback and replacement guards", () => {
  assert.match(schoolApi, /Could not roll back the material upload/);
  assert.match(schoolApi, /Could not delete the replaced material file/);
  assert.match(schoolApi, /Could not delete lesson material files/);
});

test("teacher enrollment has no profile-update bypass and validates active owned courses", () => {
  const enrollmentFunction = migration.match(
    /create or replace function public\.teacher_enroll_student_to_course[\s\S]*?\n\$\$;/,
  )?.[0] ?? "";
  assert.ok(enrollmentFunction, "stage 1 enrollment RPC must be present");
  assert.doesNotMatch(enrollmentFunction, /update public\.profiles/i);
  assert.match(enrollmentFunction, /private\.can_manage_course\(p_course_id\)/);
  assert.match(enrollmentFunction, /course\.is_active/);
  assert.match(enrollmentFunction, /profile\.role = 'student'/);
  assert.match(enrollmentFunction, /on conflict do nothing/);
  assert.match(migration, /course_enrollments_direct_student_unique/);
});

test("course creation is atomic, caller-owned, and restricted to teachers or admins", () => {
  assert.match(atomicCourseCreation, /create_course_for_current_user/);
  assert.match(atomicCourseCreation, /v_caller uuid := auth\.uid\(\)/);
  assert.match(atomicCourseCreation, /v_role not in \('admin', 'teacher'\)/);
  assert.match(atomicCourseCreation, /created_by[\s\S]*v_caller/);
  assert.match(atomicCourseCreation, /insert into public\.course_staff/);
  assert.match(atomicCourseCreation, /security definer/);
  assert.match(atomicCourseCreation, /set search_path = public, pg_temp/);
  assert.match(atomicCourseCreation, /revoke execute[\s\S]*from public, anon/);
  assert.match(atomicCourseCreation, /grant execute[\s\S]*to authenticated/);
  assert.doesNotMatch(atomicCourseCreation, /p_created_by|p_teacher_id|p_owner_id/);
  assert.match(schoolApi, /rpc\("create_course_for_current_user"/);
  assert.doesNotMatch(schoolApi, /creatorTeacherId/);
});

test("admin invitations stay server-only and permit only teachers and students", () => {
  assert.match(invitationRoute, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(invitationRoute, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(invitationRoute, /supportedInviteRoles = \["teacher", "student"\]/);
  assert.match(invitationRoute, /auth\.getUser\(token\)/);
  assert.match(invitationRoute, /callerProfile\?\.role !== "admin"/);
  assert.match(invitationRoute, /inviteUserByEmail/);
  assert.match(providers, /fetch\("\/api\/admin\/invitations"/);
});

test("progress uses the authenticated user rather than a client supplied student id", () => {
  assert.match(schoolApi, /setCurrentStudentLessonProgress/);
  assert.match(schoolApi, /supabase\.auth\.getUser\(\)/);
  assert.match(schoolApi, /student_id: userData\.user\.id/);
  assert.match(providers, /setLessonProgress: \(lessonId: string, completed: boolean\)/);
  assert.match(providers, /setCurrentStudentLessonProgress\(supabase, lessonId, completed\)/);
});

test("curator is retained for database compatibility but not claimed as a finished product role", () => {
  assert.doesNotMatch(readme, /Administrator, coordinator, teacher, and student roles/);
  assert.doesNotMatch(readme, /\*\*Coordinator\*\* manages assigned learning groups/);
  assert.match(providers, /role: "teacher" \| "student"/);
});
