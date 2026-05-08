# Blueprint: Hardened Multi-Tenant RLS Integration

**Status:** Draft (Brainstorming Outcome)
**Goal:** Transition from application-level filtering (JS) to database-level enforcement (RLS) without breaking the Corrupt Engine workflow.

---

## 1. Identity Infrastructure (The "Who")

We need to store the relationship between a Supabase Auth user and their organization.

### New Table: `public.user_roles`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key |
| `user_id` | UUID | References `auth.users.id` |
| `org_id` | UUID | References `public.organizations.id` |
| `role` | TEXT | 'admin' or 'super_admin' |

---

## 2. JWT Injection (The "How")

To make RLS efficient, the `org_id` must be part of the user's session token. We use a Supabase Postgres function to inject this into the `app_metadata`.

### The Logic:
1. User logs in.
2. Postgres function `handle_auth_login` triggers.
3. Function looks up `user_id` in `public.user_roles`.
4. Function writes the `org_id` to the user's `auth.users.app_metadata`.
5. Every subsequent request now carries the `org_id` in the JWT, which RLS can read instantly.

---

## 3. The RLS Policies (The "Shield")

Once the `org_id` is in the JWT, we apply the following policies to all sensitive tables (`events`, `bookings`, `subscriptions`, `customers`).

### Example Policy for `events`:
```sql
-- Disable existing permissive policies
DROP POLICY IF EXISTS "Events are viewable by everyone" ON public.events;

-- Public Policy: Anyone can SEE events (for the calendar)
CREATE POLICY "Public: Events are viewable" 
ON public.events FOR SELECT 
USING (true);

-- Admin Policy: Admins can only MODIFY events belonging to their Org
CREATE POLICY "Admin: Full access to own Org" 
ON public.events FOR ALL
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin' OR
  org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid
);
```

---

## 4. Super Admin Provisioning

To ensure administrative oversight across all tenants, we will explicitly define **Super Admin** status for your primary account.

### Global Super Admin: `YOUR_SUPER_ADMIN_EMAIL`
- **Identity**: This account will be mapped in `public.user_roles` with the `role = 'super_admin'`.
- **Capability**: The RLS policies are written to recognize the `super_admin` role in the JWT and bypass the `org_id` filter, allowing for global revenue auditing, cross-tenant management, and platform-wide maintenance.

---

## 5. Corrupt CLI Workflow (Zero-Friction)

The `corrupt.py` script will be updated to handle the "First Admin" setup:

1. **Prompt**: CLI asks for the email of the primary site admin.
2. **Setup**: CLI creates the `organization` entry.
3. **Seeding**: CLI generates a temporary "Provisioning SQL" block that the user runs in Supabase once they invite their first user. This links that user's email/ID to the new `org_id` with the `admin` role.

---

## 5. Verification Plan

1. **Dry Run**: Apply the `user_roles` table and the JWT function, but don't enable RLS yet.
2. **Token Verification**: Log in as a test user and inspect the JWT to see if `org_id` is present.
3. **Toggle RLS**: Enable RLS on one non-critical table (e.g., `profiles`) and verify that JS queries still work.
4. **Final Cutover**: Roll out to `bookings` and `subscriptions`.

---

**Next Action:** Await approval of this blueprint before generating the `20260523_hardened_rls.sql` migration.
