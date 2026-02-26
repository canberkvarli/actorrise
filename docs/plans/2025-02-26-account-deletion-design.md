# Account Deletion Feature Design

Date: 2025-02-26
Status: Approved

## Overview

Add account deletion functionality to the Settings page, allowing users to permanently delete their account and all associated data. This satisfies GDPR/CCPA requirements and aligns with the privacy policy statement that users can "delete your account and profile from within the Service."

## Goals

- Provide a safe, clear account deletion flow in Settings
- Handle active Stripe subscriptions properly (cancel immediately)
- Permanently delete all user data per legal requirements
- Prevent accidental deletions through confirmation safeguards

## Non-Goals

- Data retention for regulatory purposes (handled by Stripe for billing records)
- Grace period or delayed deletion
- Data export before deletion (users can contact support if needed)

## UX Design

### Settings Page Addition

Add a "Danger Zone" card at the bottom of `/settings` page:

- Red border styling (`border-red-200` / `dark:border-red-900`)
- Warning icon
- Title: "Delete Account"
- Description: "Permanently delete your account and all associated data. This action cannot be undone."
- Destructive button: "Delete Account" (red styling)

### Deletion Confirmation Modal

Multi-step confirmation dialog:

1. **Warning Header**: "Are you sure you want to delete your account?"
2. **Consequences List**:
   - All your scripts, scenes, and bookmarks will be permanently deleted
   - Your subscription will be canceled immediately (no refund for remaining period)
   - You will lose access to all ActorRise features immediately
   - This action cannot be undone
3. **Required Checkboxes** (both must be checked to proceed):
   - "I understand my subscription will be canceled immediately and I will lose access"
   - "I understand all my data will be permanently deleted"
4. **Final confirmation input**: Type "DELETE" to confirm
5. **Action Buttons**:
   - "Cancel" (secondary, left)
   - "Permanently Delete Account" (destructive, disabled until all checks pass)

### Post-Deletion Flow

1. Show loading state during deletion ("Deleting your account...")
2. Sign out user via Supabase
3. Redirect to homepage
4. Show toast/notification: "Your account has been successfully deleted."

## Technical Design

### API Endpoint

**POST** `/api/account/delete`

Protected endpoint requiring authentication.

**Flow:**
1. Verify user authentication
2. Cancel Stripe subscription if active (using `stripe.Subscription.delete`)
3. Delete user data in order:
   - Headshot from Supabase Storage (`delete_headshot()`)
   - Line deliveries and rehearsal sessions
   - Scene favorites, monologue favorites
   - User scripts (with scene unlinking)
   - Search history
   - Actor profile
   - Usage metrics
   - Billing history records
   - User subscription record
   - User record
4. Return success response

**Error Handling:**
- If Stripe cancellation fails, log error but continue with data deletion
- Any failure during data deletion should rollback and return 500

### Frontend Components

1. **Settings Page Updates** (`app/(platform)/settings/page.tsx`):
   - Add Danger Zone card at bottom
   - Import new `DeleteAccountModal` component

2. **DeleteAccountModal** (`components/settings/DeleteAccountModal.tsx`):
   - Modal with confirmation flow
   - State management for checkboxes
   - DELETE text input validation
   - API call to `/api/account/delete`
   - Error handling with user-friendly messages

### Data Deletion Details

Based on existing `wipe_users_make_superuser.py` script:

```
RehearsalSession (user_id)
SceneFavorite (user_id)
MonologueFavorite (user_id)
UserScript (user_id) → also unlink Scene records referencing these scripts
SearchHistory (user_id)
ActorProfile (user_id) → includes headshot deletion
UsageMetrics (user_id)
BillingHistory (user_id)
UserSubscription (user_id)
User (id)
```

### Stripe Integration

When user has an active subscription:

1. Get `stripe_subscription_id` from `UserSubscription` record
2. Call `stripe.Subscription.delete(stripe_subscription_id)` to cancel immediately
3. Stripe webhook will handle the `customer.subscription.deleted` event as usual

**Note:** No refund is issued for remaining billing period per standard SaaS practice.

### Security Considerations

- Authentication required (401 if not logged in)
- Rate limiting: Max 3 deletion attempts per user per hour
- Audit logging: Log deletion events with user ID and timestamp
- CSRF protection via existing Bearer token authentication

## Testing Strategy

### Unit Tests (Backend)

- Test deletion with free tier user (no Stripe customer)
- Test deletion with active subscription (Stripe cancellation + data deletion)
- Test deletion with canceled subscription (already inactive, just delete data)
- Test error handling when Stripe API fails

### Integration Tests

- Full flow: authenticated request → Stripe cancel → data deleted → 200 response
- Verify all related records are deleted from database
- Verify headshot removed from Supabase Storage

### E2E Tests

- Settings page displays Danger Zone correctly
- Modal opens on delete button click
- Checkboxes and DELETE input validation works
- Successful deletion signs out user and redirects to homepage

## Open Questions

None - design approved.

## Related Files

- `app/(platform)/settings/page.tsx`
- `backend/app/api/auth.py`
- `backend/app/api/subscriptions.py`
- `backend/scripts/wipe_users_make_superuser.py`
- `backend/app/services/storage.py`
- `app/(marketing)/privacy/page.tsx` (already mentions deletion capability)

## Timeline

Implementation: 1-2 hours
Testing: 1 hour
Total: Half day
