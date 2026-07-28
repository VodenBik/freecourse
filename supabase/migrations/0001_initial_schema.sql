create extension if not exists "pgcrypto";

create type public.user_role as enum ('admin', 'curator', 'teacher', 'student');
create type public.course_language as enum ('ru', 'en');
create type public.access_mode as enum (
  'all_open',
  'gradual',
  'after_submission',
  'after_review',
  'manual',
  'time_limited'
);
create type public.material_type as enum ('video', 'pdf', 'docx', 'text');
create type public.submission_status as enum (
  'not_submitted',
  'submitted',
  'in_review',
  'accepted',
  'needs_revision',
  'overdue'
);
create type public.access_target_type as enum ('student', 'group', 'stream');
create type public.notification_channel as enum ('internal', 'email', 'telegram', 'sms');

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name public.user_role not null unique,
  title text not null
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text unique,
  phone text,
  telegram text,
  school_id text unique,
  role public.user_role not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.streams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at date,
  ends_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  stream_id uuid references public.streams(id) on delete set null,
  curator_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  language public.course_language not null default 'ru',
  is_active boolean not null default true,
  access_mode public.access_mode not null default 'manual',
  access_starts_at timestamptz,
  access_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules(id) on delete cascade,
  title text not null,
  description text not null default '',
  content text not null default '',
  sort_order integer not null default 0,
  is_open_by_default boolean not null default false,
  has_assignment boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lesson_materials (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  title text not null,
  material_type public.material_type not null,
  file_path text not null,
  file_size bigint not null default 0,
  is_downloadable boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  title text not null,
  description text not null,
  due_at timestamptz,
  allow_text_answer boolean not null default true,
  allow_file_upload boolean not null default false,
  allow_multiple_files boolean not null default false,
  max_score integer not null default 100 check (max_score between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  text_answer text not null default '',
  file_paths text[] not null default '{}',
  status public.submission_status not null default 'submitted',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (assignment_id, student_id)
);

create table public.grades (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.assignment_submissions(id) on delete cascade,
  reviewer_id uuid references public.profiles(id) on delete set null,
  score integer not null check (score between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.assignment_submissions(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (group_id, student_id)
);

create table public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  stream_id uuid references public.streams(id) on delete cascade,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (student_id is not null)::int +
    (group_id is not null)::int +
    (stream_id is not null)::int = 1
  )
);

create table public.lesson_access (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  target_type public.access_target_type not null,
  target_id uuid not null,
  is_open boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  unique (lesson_id, target_type, target_id)
);

create table public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_id, student_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  channel public.notification_channel not null default 'internal',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.course_groups (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  unique (course_id, group_id)
);

create table public.course_streams (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  stream_id uuid not null references public.streams(id) on delete cascade,
  unique (course_id, stream_id)
);

create table public.course_staff (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.user_role not null,
  unique (course_id, profile_id)
);

create schema if not exists private;

create or replace function private.current_user_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger streams_updated_at before update on public.streams
  for each row execute function public.set_updated_at();
create trigger groups_updated_at before update on public.groups
  for each row execute function public.set_updated_at();
create trigger courses_updated_at before update on public.courses
  for each row execute function public.set_updated_at();
create trigger modules_updated_at before update on public.modules
  for each row execute function public.set_updated_at();
create trigger lessons_updated_at before update on public.lessons
  for each row execute function public.set_updated_at();
create trigger lesson_materials_updated_at before update on public.lesson_materials
  for each row execute function public.set_updated_at();
create trigger assignments_updated_at before update on public.assignments
  for each row execute function public.set_updated_at();
create trigger grades_updated_at before update on public.grades
  for each row execute function public.set_updated_at();
create trigger lesson_progress_updated_at before update on public.lesson_progress
  for each row execute function public.set_updated_at();

alter table public.roles enable row level security;
alter table public.profiles enable row level security;
alter table public.streams enable row level security;
alter table public.groups enable row level security;
alter table public.courses enable row level security;
alter table public.modules enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_materials enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_submissions enable row level security;
alter table public.grades enable row level security;
alter table public.comments enable row level security;
alter table public.group_members enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.lesson_access enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.notifications enable row level security;
alter table public.settings enable row level security;
alter table public.course_groups enable row level security;
alter table public.course_streams enable row level security;
alter table public.course_staff enable row level security;

create policy "profiles read own or staff" on public.profiles
  for select using (id = auth.uid() or private.current_user_role() in ('admin', 'teacher', 'curator'));
create policy "profiles update own limited" on public.profiles
  for update using (id = auth.uid() or private.current_user_role() = 'admin');
create policy "profiles insert admin" on public.profiles
  for insert with check (private.current_user_role() = 'admin' or id = auth.uid());

create policy "admin all roles" on public.roles for all using (private.current_user_role() = 'admin');
create policy "read courses for authenticated" on public.courses for select using (auth.role() = 'authenticated');
create policy "staff manage courses" on public.courses for all using (private.current_user_role() = 'admin');
create policy "read modules for authenticated" on public.modules for select using (auth.role() = 'authenticated');
create policy "staff manage modules" on public.modules for all using (private.current_user_role() in ('admin', 'teacher'));
create policy "read lessons for authenticated" on public.lessons for select using (auth.role() = 'authenticated');
create policy "staff manage lessons" on public.lessons for all using (private.current_user_role() in ('admin', 'teacher'));
create policy "read materials for authenticated" on public.lesson_materials for select using (auth.role() = 'authenticated');
create policy "staff manage materials" on public.lesson_materials for all using (private.current_user_role() in ('admin', 'teacher'));
create policy "read assignments for authenticated" on public.assignments for select using (auth.role() = 'authenticated');
create policy "staff manage assignments" on public.assignments for all using (private.current_user_role() in ('admin', 'teacher'));

create policy "students read own submissions" on public.assignment_submissions
  for select using (student_id = auth.uid() or private.current_user_role() in ('admin', 'teacher', 'curator'));
create policy "students insert own submissions" on public.assignment_submissions
  for insert with check (student_id = auth.uid());
create policy "students update own draft submissions" on public.assignment_submissions
  for update using (student_id = auth.uid() or private.current_user_role() in ('admin', 'teacher', 'curator'));

create policy "read grades own or staff" on public.grades
  for select using (
    private.current_user_role() in ('admin', 'teacher', 'curator')
    or exists (
      select 1 from public.assignment_submissions s
      where s.id = submission_id and s.student_id = auth.uid()
    )
  );
create policy "staff manage grades" on public.grades
  for all using (private.current_user_role() in ('admin', 'teacher', 'curator'));

create policy "read comments own or staff" on public.comments
  for select using (
    private.current_user_role() in ('admin', 'teacher', 'curator')
    or exists (
      select 1 from public.assignment_submissions s
      where s.id = submission_id and s.student_id = auth.uid()
    )
  );
create policy "staff write comments" on public.comments
  for all using (private.current_user_role() in ('admin', 'teacher', 'curator'));

create policy "groups read for staff" on public.groups
  for select using (private.current_user_role() in ('admin', 'teacher', 'curator'));
create policy "groups admin manage" on public.groups
  for all using (private.current_user_role() = 'admin');
create policy "streams read for staff" on public.streams
  for select using (private.current_user_role() in ('admin', 'teacher', 'curator'));
create policy "streams admin manage" on public.streams
  for all using (private.current_user_role() = 'admin');
create policy "group members read own or staff" on public.group_members
  for select using (student_id = auth.uid() or private.current_user_role() in ('admin', 'teacher', 'curator'));
create policy "group members admin manage" on public.group_members
  for all using (private.current_user_role() = 'admin');

create policy "enrollments read own or staff" on public.course_enrollments
  for select using (student_id = auth.uid() or private.current_user_role() in ('admin', 'teacher', 'curator'));
create policy "enrollments admin manage" on public.course_enrollments
  for all using (private.current_user_role() = 'admin');
create policy "lesson access read authenticated" on public.lesson_access
  for select using (auth.role() = 'authenticated');
create policy "lesson access admin manage" on public.lesson_access
  for all using (private.current_user_role() = 'admin');
create policy "lesson progress own or staff" on public.lesson_progress
  for select using (student_id = auth.uid() or private.current_user_role() in ('admin', 'teacher', 'curator'));
create policy "lesson progress own insert" on public.lesson_progress
  for insert with check (student_id = auth.uid());
create policy "lesson progress own update" on public.lesson_progress
  for update using (student_id = auth.uid() or private.current_user_role() in ('admin', 'teacher', 'curator'));

create policy "notifications own" on public.notifications
  for select using (profile_id = auth.uid() or private.current_user_role() = 'admin');
create policy "notifications staff insert" on public.notifications
  for insert with check (private.current_user_role() in ('admin', 'teacher', 'curator'));
create policy "notifications own update" on public.notifications
  for update using (profile_id = auth.uid() or private.current_user_role() = 'admin');

create policy "settings admin all" on public.settings for all using (private.current_user_role() = 'admin');
create policy "course groups read authenticated" on public.course_groups for select using (auth.role() = 'authenticated');
create policy "course groups admin manage" on public.course_groups for all using (private.current_user_role() = 'admin');
create policy "course streams read authenticated" on public.course_streams for select using (auth.role() = 'authenticated');
create policy "course streams admin manage" on public.course_streams for all using (private.current_user_role() = 'admin');
create policy "course staff read staff" on public.course_staff
  for select using (profile_id = auth.uid() or private.current_user_role() in ('admin', 'curator', 'teacher'));
create policy "course staff admin manage" on public.course_staff for all using (private.current_user_role() = 'admin');

insert into public.roles (name, title) values
  ('admin', 'Администратор'),
  ('curator', 'Куратор'),
  ('teacher', 'Преподаватель'),
  ('student', 'Ученик')
on conflict (name) do nothing;

insert into storage.buckets (id, name, public)
values ('lesson-materials', 'lesson-materials', false)
on conflict (id) do nothing;

create policy "authenticated can read lesson files" on storage.objects
  for select using (bucket_id = 'lesson-materials' and auth.role() = 'authenticated');
create policy "staff can upload lesson files" on storage.objects
  for insert with check (
    bucket_id = 'lesson-materials'
    and private.current_user_role() in ('admin', 'teacher')
  );
create policy "staff can update lesson files" on storage.objects
  for update using (
    bucket_id = 'lesson-materials'
    and private.current_user_role() in ('admin', 'teacher')
  );
