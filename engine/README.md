# Corrupt Solutions | SaaS Engine

Welcome to your new business infrastructure. This project was scaffolded and deployed via the **Corrupt Engine**.

## 🏗️ Stack
- **Frontend**: Vercel
- **Database**: Supabase
- **Payments**: Stripe

## 🚀 Getting Started

### 1. Development
Run the local dev server to preview your site:
```bash
python3 dev.py
```

### 2. Configuration
Your API connections are managed via Environment Variables:
- **Vercel**: Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the Vercel dashboard.
- **Supabase**: Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` using `supabase secrets set`.

### 3. Management
- **Events**: Manage your schedule in the `admin.html` dashboard or directly in the Supabase `events` table.
- **Users**: View your customers in the `profiles` table.
- **Billing**: Manage subscriptions through the Stripe Customer Portal.

---
**Powered by Corrupt Solutions.** 💠
