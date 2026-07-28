# FreeCourse

FreeCourse is a free and open-source learning management system for creating and delivering online courses. It provides the core learning features commonly associated with platforms such as GetCourse, without subscription fees or vendor lock-in.

## Overview

FreeCourse is a self-hosted platform for independent educators, schools, training teams, and organizations that need to publish structured courses, enroll students, review homework, and track learning progress.

## Features

- Course creation and management
- Modules and lessons
- Video links, text, PDF, and DOCX materials
- Student registration and authentication
- Administrator, coordinator, teacher, and student roles
- Groups and learning cohorts
- Individual and group course enrollment
- Homework assignments
- Text and file submissions
- Multiple-file uploads
- Submission review
- Scores and teacher comments
- Lesson access rules
- Progress tracking
- Notifications
- Platform settings
- English and Russian interface
- Supabase database, authentication, and private storage
- Responsive interface

## Roles

- **Administrator** manages users, roles, courses, groups, access rules, reviews, statistics, and organization settings.
- **Coordinator** manages assigned learning groups and operational course work.
- **Teacher** manages assigned courses, lessons, materials, enrollments, and submission reviews.
- **Student** accesses assigned courses, studies lessons, submits homework, and reviews feedback.

## Technology stack

- Next.js 16
- React 19
- TypeScript
- Supabase
- PostgreSQL
- Supabase Auth
- Supabase Storage
- Lucide React
- Vercel-compatible deployment

## Requirements

- Node.js
- npm
- Supabase account

## Local setup

```bash
git clone https://github.com/VodenBik/freecourse.git
cd freecourse
npm install
```

Create the local environment file on Windows CMD:

```cmd
copy .env.example .env.local
```

On macOS or Linux:

```bash
cp .env.example .env.local
```

Fill in the environment variables, then start the development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Supabase setup

1. Create a Supabase project.
2. Run every SQL file in `supabase/migrations` in filename order.
3. Enable email authentication.
4. Add the project values to `.env.local`.
5. Register the first user through FreeCourse.
6. Assign the first administrator by following [docs/admin-bootstrap.md](docs/admin-bootstrap.md).
7. Confirm that the private `lesson-materials` and `assignment-submissions` buckets exist after the storage migrations run.

FreeCourse does not include preconfigured users, courses, student records, or personal data.

## First administrator

Register the first user through the application, then follow
[docs/admin-bootstrap.md](docs/admin-bootstrap.md) to assign the administrator role.
The instructions use placeholders and must be completed with identifiers from your own
Supabase project.

## Environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=<SUPABASE_PROJECT_URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

The anon key is intended for browser use. Data access must be protected by Row Level Security.
FreeCourse requires your own Supabase project and is not connected to the project owner's
Supabase instance.

## Localization

The interface supports English and Russian through one shared component system and translation dictionary. English is the default and fallback language. A user's manual selection is stored in the browser under `freecourse-locale`; no browser, operating-system, IP, or region detection is used.

Add new system strings in English first, then provide the complete Russian translation.

## Empty initial state

FreeCourse starts without users, courses, enrollments, lessons, homework submissions, or
organization details. Create the first account after configuring your own Supabase project,
then bootstrap its administrator role as described above.

## Deployment

1. Push the repository to your Git provider.
2. Import the repository into Vercel.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Deploy the project.
5. Configure the deployed URL in Supabase Auth redirect settings.
6. Verify authentication, private storage access, and RLS policies before production use.

## Security notes

- Never commit `.env.local`.
- The anon key is a client-side key; it is not a replacement for RLS.
- Never expose a Supabase service role key in the browser.
- Review Auth settings, RLS policies, storage policies, and function privileges before production deployment.

## GetCourse positioning

FreeCourse can be used as a free, self-hosted alternative to GetCourse for course delivery, lessons, homework, student management, and learning progress tracking.

It does not currently include the full CRM, payment processing, sales funnels, e-mail marketing, or webinar infrastructure available in large commercial platforms.

## License

FreeCourse is licensed under the GNU Affero General Public License v3.0.

You may use, modify, and distribute the software under the terms of the AGPL-3.0 license. If you modify FreeCourse and make it available to users over a network, you must also make the corresponding source code of your modified version available under the same license.

See the full license text in [LICENSE](LICENSE).
