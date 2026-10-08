# Contributing to FreeCourse

1. Create a focused branch from the current release branch.
2. Install dependencies with `npm ci`.
3. Make the smallest change needed and add or update focused tests where practical.
4. Run:

   ```bash
   npm run test
   npm run typecheck
   npm run lint
   npx eslint src tests --max-warnings 0
   npm run build
   npm audit --omit=dev
   ```

5. Do not commit `.env.local`, credentials, test passwords, generated artifacts, or personal data.

For Supabase changes, add a new migration. Never edit a migration that has already been applied to a shared project. Keep RLS and private Storage policies at least as restrictive as the existing model.
