# Reform HER - Billing & Subscription Architecture

**Deployed: May 7, 2026**

## Overview
A zero-friction, automated billing engine utilizing Stripe, Supabase Edge Functions, and Vercel Cron. The architecture handles subscription lifecycle events, automated 7-day and 30-day renewal reminders via Resend, and passwordless Magic Links for Stripe Customer Portal management.

## Components

### 1. Database Schema (`public.subscriptions`)
- Stores mirrored subscription state from Stripe.
- **Fields**: `id`, `user_id`, `email`, `first_name`, `stripe_customer_id`, `stripe_subscription_id`, `plan_interval`, `current_period_end`, `status`, `cancel_at_period_end`.
- **RLS**: Users can only `SELECT` their own subscription row via `auth.uid() = user_id`.

### 2. Stripe Webhook (Supabase Edge Function)
- **Path**: `supabase/functions/stripe-webhook`
- **Events Monitored**: 
  - `invoice.payment_succeeded` (Upserts new subscription dates)
  - `invoice.payment_failed` (Marks as `past_due`)
  - `customer.subscription.updated` / `deleted` (Handles cancellations)
- **Security**: Requires `STRIPE_WEBHOOK_SECRET`.

### 3. Automated Reminders (Supabase Edge Function + Vercel Cron)
- **Engine**: `supabase/functions/billing-reminders`
- **Cron Trigger**: Vercel Cron pinging `/api/trigger-billing-reminders` at 08:00 AM daily.
- **Logic**:
  - Queries `subscriptions` where `status = active` and `cancel_at_period_end = false`.
  - Targets 1-month subscriptions exactly 7 days from `current_period_end`.
  - Targets 3-month subscriptions exactly 30 days from `current_period_end`.
  - Generates a Stripe Portal Session URL (Magic Link).
  - Dispatches an HTML email via the Resend API (`RESEND_API_KEY`).

## Operational Guidelines
- **Card Expirations**: Handled by Stripe's Automatic Card Updater.
- **Cancellations**: Stripe sets `cancel_at_period_end = true`. Users retain access until the exact `current_period_end` timestamp.
- **Double-Charges**: Prevented via database lookup before generating Stripe Checkout sessions.
