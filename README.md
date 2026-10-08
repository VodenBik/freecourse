# FreeCourse

Free and open-source self-hosted LMS for courses, lessons, homework, student management, and learning progress tracking.

FreeCourse is an early `v0.1.0` release for independent educators, schools, and training teams. It is self-hosted: you provide the Supabase project, email provider, and deployment environment.

## Features

- Admin, Teacher, and Student roles
- Courses, modules, lessons, and lesson materials
- Text, video URLs, and PDF/DOC/DOCX lesson materials
- Assignments/homework with text and file submissions
- Teacher feedback and grading
- Student enrollment and learning-progress tracking
- English and Russian UI (English is the default and fallback)
- Supabase Auth, PostgreSQL, private Storage, and Row Level Security (RLS)
- Teacher access scoped to their own courses and students; student access scoped to enrolled courses

FreeCourse does **not** include CRM, payments, sales funnels, newsletters, webinars, AI features, enterprise SSO, or hosted SaaS service.

## Tech stack

- Next.js 16, React 19, TypeScript
- Supabase: PostgreSQL, Auth, and Storage
- Node.js and npm

## Requirements

- Node.js 20.9 or newer and npm
- A blank Supabase project
- An SMTP provider for reliable production Auth email delivery (Supabase's built-in SMTP is suitable only for limited development testing)

## Installation

```bash
git clone https://github.com/VodenBik/freecourse.git
cd freecourse
npm ci
```

Create a local environment file:

```bash
# macOS/Linux
cp .env.example .env.local
```

```cmd
:: Windows CMD
copy .env.example .env.local
```

Fill `.env.local` with values from **your** Supabase project:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
```

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are used by the browser. `SUPABASE_SERVICE_ROLE_KEY` is used only by the server-side admin invitation route. Never prefix it with `NEXT_PUBLIC_`, expose it to the browser, or commit a real value. Set `NEXT_PUBLIC_SITE_URL` to the deployed HTTPS origin before deployment.

## Supabase setup

1. Create a blank Supabase project. Do not reuse another application's project.
2. Apply every migration in `supabase/migrations` in filename order, from `0001_initial_schema.sql` through `0016_submission_returning_read_policy.sql`.

   With the Supabase CLI, authenticate, link your project, then apply the checked-in migration history:

   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   npx supabase migration list
   ```

   Alternatively, execute the SQL files in filename order in the Supabase SQL Editor. Do not edit an applied migration; add a new migration for every schema change.
3. In **Authentication → Providers**, enable Email/password authentication and email confirmation.
4. In **Authentication → URL Configuration**, set the Site URL to your application origin and add these Redirect URLs:

   ```text
   http://localhost:3000/auth/callback
   http://localhost:3000/reset-password
   ```

   Add the equivalent HTTPS URLs for every deployed environment before using it. Registration uses `/auth/callback`; invitations and password recovery use `/reset-password`.
5. The migrations create these private Storage buckets and policies; do not make them public:

   - `lesson-materials`
   - `assignment-submissions`
6. Add the project URL, anon key, site URL, and server-only service-role key to `.env.local`.

### Authentication email

Supabase's built-in SMTP has delivery restrictions and rate limits, so use it only for limited development testing. Configure Custom SMTP in **Authentication → Email → SMTP Settings** before production. Any SMTP provider can be used; Brevo is one supported example. Keep provider credentials only in Supabase's SMTP configuration, never in the repository or browser environment. Disable provider link tracking if it rewrites Supabase Auth URLs.

Keep email confirmation enabled. Configure sensible Auth rate limits instead of disabling abuse protection.

### First administrator

New registrations receive the safe `student` role. After the first user confirms their email and signs in once, bootstrap the administrator according to [docs/admin-bootstrap.md](docs/admin-bootstrap.md). This is an installation-only SQL step; the application has no "make me admin" endpoint.

After signing in again, the first admin can invite Teacher and Student users from the UI. The invitation flow sends an email; invited users choose their own password and keep the role assigned by the admin.

## Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Validation

Run these checks before contributing or deploying:

```bash
npm run test
npm run typecheck
npm run lint
npx eslint src tests --max-warnings 0
npm run build
npm audit --omit=dev
```

## Roles and security

- **Admin** manages users, roles, courses, enrollment, review, and progress.
- **Teacher** creates and manages only their own courses, learning hierarchy, enrolled students, and submissions.
- **Student** sees only active courses they are enrolled in, submits their own homework, and sees their own results and progress.

RLS policies enforce database access independently of UI visibility. Both application Storage buckets are private and access-controlled. The service-role key remains server-only. `curator` remains in the database for compatibility but is not a completed public product role.

## Deployment

Deploy the Next.js application to any compatible Node.js host. Vercel is one option, but no hosted FreeCourse demo is provided by this repository.

Set all four environment variables from `.env.example` in the deployment's server environment. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Then add the deployed HTTPS origin's `/auth/callback` and `/reset-password` URLs to Supabase Auth Redirect URLs, set that origin as `NEXT_PUBLIC_SITE_URL`, and run the validation commands above.

## Project status

`v0.1.0` is an early self-hosted release. The supported core flow is Admin → Teacher/Student invitation → Course → Lesson → Homework → Submission → Review/Grade → Progress. Deployment operations, SMTP provider accounts, and backups remain the operator's responsibility.

## License

FreeCourse is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).

## Security and contributions

See [SECURITY.md](SECURITY.md) for vulnerability reporting and [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow.
