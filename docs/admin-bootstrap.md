# First administrator

Newly registered users receive the `student` role. Assign the first administrator manually after the user has registered and confirmed their email address.

## Assign the role

1. Register through the FreeCourse interface using your real email address.
2. Confirm the email address.
3. Sign in once so the application creates a row in `public.profiles`.
4. Open the Supabase SQL Editor and run:

```sql
update public.profiles
set role = 'admin'
where email = 'admin@example.com';
```

You can also target the profile by UUID:

```sql
update public.profiles
set role = 'admin'
where id = '<USER_UUID>';
```

5. Sign out and sign in again.

The first administrator can then assign administrator, coordinator, and teacher roles from the Users section.
