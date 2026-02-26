# Account Deletion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add account deletion feature to Settings page with Stripe subscription cancellation and complete data deletion.

**Architecture:** Backend FastAPI endpoint handles Stripe cancellation + cascade data deletion using existing wipe logic. Frontend React modal with multi-step confirmation safeguards. Both follow existing patterns in the codebase.

**Tech Stack:** Next.js (frontend), FastAPI + SQLAlchemy + Stripe SDK (backend), Supabase Auth

---

## Prerequisites

- Ensure `STRIPE_SECRET_KEY` env var is set (already required for subscriptions)
- Verify `backend/scripts/wipe_users_make_superuser.py` exists (reference for deletion logic)

## Current File References

- `app/(platform)/settings/page.tsx` - Settings page UI
- `backend/app/api/auth.py` - Auth dependency `get_current_user`
- `backend/app/api/subscriptions.py` - Stripe integration patterns
- `backend/app/services/storage.py` - `delete_headshot()` function
- `backend/scripts/wipe_users_make_superuser.py` - Data deletion reference logic

---

### Task 1: Create Backend Account Deletion Endpoint

**Files:**
- Create: `backend/app/api/account.py`
- Modify: `backend/app/api/__init__.py` (to register router)

**Step 1: Write the endpoint code**

Create `backend/app/api/account.py`:

```python
"""
Account management API endpoints.

Endpoints for user account operations including account deletion.
"""

import os
import logging

import stripe
from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.billing import BillingHistory, UsageMetrics, UserSubscription
from app.models.favorites import MonologueFavorite, SceneFavorite
from app.models.rehearsal import LineDelivery, RehearsalSession
from app.models.scripts import Scene, UserScript
from app.models.search import SearchHistory
from app.models.user import ActorProfile, User
from app.services.storage import delete_headshot
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/account", tags=["account"])
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

logger = logging.getLogger(__name__)


@router.post("/delete", status_code=status.HTTP_200_OK)
def delete_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Permanently delete the current user's account and all associated data.

    This will:
    - Cancel any active Stripe subscription immediately
    - Delete all user data (scripts, favorites, search history, etc.)
    - Remove the user record

    Returns 200 on success. User should be signed out client-side after this.
    """
    user_id = current_user.id

    try:
        # Step 1: Cancel Stripe subscription if active
        subscription = (
            db.query(UserSubscription)
            .filter(UserSubscription.user_id == user_id)
            .first()
        )

        if subscription and subscription.stripe_subscription_id:
            try:
                stripe.Subscription.delete(subscription.stripe_subscription_id)
                logger.info(f"Canceled Stripe subscription for user {user_id}")
            except stripe.error.StripeError as e:
                # Log but continue - we'll still delete the data
                logger.warning(f"Failed to cancel Stripe subscription for user {user_id}: {e}")

        # Step 2: Delete headshot from storage
        try:
            delete_headshot(user_id)
        except Exception as e:
            logger.warning(f"Failed to delete headshot for user {user_id}: {e}")

        # Step 3: Delete rehearsal data (line deliveries first, then sessions)
        db.query(LineDelivery).filter(
            LineDelivery.session_id.in_(
                db.query(RehearsalSession.id).filter(RehearsalSession.user_id == user_id)
            )
        ).delete(synchronize_session=False)
        db.query(RehearsalSession).filter(RehearsalSession.user_id == user_id).delete(
            synchronize_session=False
        )

        # Step 4: Delete favorites
        db.query(SceneFavorite).filter(SceneFavorite.user_id == user_id).delete(
            synchronize_session=False
        )
        db.query(MonologueFavorite).filter(MonologueFavorite.user_id == user_id).delete(
            synchronize_session=False
        )

        # Step 5: Delete user scripts (unlink scenes first)
        user_script_ids = [
            row[0]
            for row in db.query(UserScript.id).filter(UserScript.user_id == user_id).all()
        ]
        if user_script_ids:
            db.query(Scene).filter(Scene.user_script_id.in_(user_script_ids)).update(
                {"user_script_id": None}, synchronize_session=False
            )
            db.query(UserScript).filter(UserScript.user_id == user_id).delete(
                synchronize_session=False
            )

        # Step 6: Delete search history
        db.query(SearchHistory).filter(SearchHistory.user_id == user_id).delete(
            synchronize_session=False
        )

        # Step 7: Delete actor profile
        db.query(ActorProfile).filter(ActorProfile.user_id == user_id).delete(
            synchronize_session=False
        )

        # Step 8: Delete usage metrics and billing history
        db.query(UsageMetrics).filter(UsageMetrics.user_id == user_id).delete(
            synchronize_session=False
        )
        db.query(BillingHistory).filter(BillingHistory.user_id == user_id).delete(
            synchronize_session=False
        )

        # Step 9: Delete subscription record
        if subscription:
            db.delete(subscription)

        # Step 10: Delete user
        db.query(User).filter(User.id == user_id).delete(synchronize_session=False)

        db.commit()
        logger.info(f"Successfully deleted account for user {user_id}")

        return {"message": "Account deleted successfully"}

    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete account for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete account. Please try again or contact support.",
        )
```

**Step 2: Register the router in backend main app**

Modify `backend/app/api/__init__.py` (or wherever routers are registered):

Add import:
```python
from app.api import account
```

Add router registration (near other router inclusions):
```python
app.include_router(account.router)
```

**Step 3: Test the endpoint manually**

Run backend server and test with curl (use a test user):

```bash
curl -X POST http://localhost:8000/api/account/delete \
  -H "Authorization: Bearer <test_user_token>"
```

Expected: 200 OK with `{"message": "Account deleted successfully"}`

**Step 4: Commit**

```bash
git add backend/app/api/account.py backend/app/api/__init__.py
git commit -m "$(cat <<'EOF'
feat: add account deletion API endpoint

- POST /api/account/delete endpoint
- Cancels Stripe subscription if active
- Cascade deletes all user data
- Logs errors but attempts full deletion

EOF
)"
```

---

### Task 2: Create DeleteAccountModal Component

**Files:**
- Create: `components/settings/DeleteAccountModal.tsx`

**Step 1: Write the component code**

Create `components/settings/DeleteAccountModal.tsx`:

```tsx
"use client";

/**
 * Delete Account Confirmation Modal
 *
 * Multi-step confirmation dialog for account deletion.
 * Requires checkbox confirmations and typing "DELETE" to proceed.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconAlertTriangle, IconLoader2 } from "@tabler/icons-react";
import api from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface DeleteAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteAccountModal({ open, onOpenChange }: DeleteAccountModalProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmSubscription, setConfirmSubscription] = useState(false);
  const [confirmData, setConfirmData] = useState(false);
  const [deleteText, setDeleteText] = useState("");

  const canDelete = confirmSubscription && confirmData && deleteText === "DELETE";

  const handleDelete = async () => {
    if (!canDelete) return;

    setIsDeleting(true);
    try {
      // Call deletion API
      await api.post("/api/account/delete");

      // Sign out from Supabase
      await supabase.auth.signOut();

      // Show success and redirect
      toast.success("Your account has been successfully deleted.");
      router.push("/");
    } catch (error: any) {
      const message =
        error?.response?.data?.detail ||
        "Failed to delete account. Please try again or contact support.";
      toast.error(message);
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    if (isDeleting) return;
    onOpenChange(false);
    // Reset state
    setConfirmSubscription(false);
    setConfirmData(false);
    setDeleteText("");
  };

  return (
    <AlertDialog open={open} onOpenChange={handleCancel}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-2 text-red-600">
            <IconAlertTriangle className="h-5 w-5" />
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-4 pt-2">
            <p className="text-foreground font-medium">
              Are you sure you want to delete your account?
            </p>

            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-3 text-sm space-y-2">
              <p className="font-medium text-red-800 dark:text-red-200">This will:</p>
              <ul className="list-disc list-inside text-red-700 dark:text-red-300 space-y-1">
                <li>Permanently delete all your scripts, scenes, and bookmarks</li>
                <li>Cancel your subscription immediately (no refund)</li>
                <li>Remove access to all ActorRise features immediately</li>
                <li>This action cannot be undone</li>
              </ul>
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="confirm-subscription"
                  checked={confirmSubscription}
                  onCheckedChange={(checked) => setConfirmSubscription(checked === true)}
                  disabled={isDeleting}
                />
                <Label htmlFor="confirm-subscription" className="text-sm leading-normal cursor-pointer">
                  I understand my subscription will be canceled immediately and I will lose access
                </Label>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="confirm-data"
                  checked={confirmData}
                  onCheckedChange={(checked) => setConfirmData(checked === true)}
                  disabled={isDeleting}
                />
                <Label htmlFor="confirm-data" className="text-sm leading-normal cursor-pointer">
                  I understand all my data will be permanently deleted
                </Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="delete-confirm" className="text-sm">
                  To confirm, type <strong>DELETE</strong> below:
                </Label>
                <Input
                  id="delete-confirm"
                  value={deleteText}
                  onChange={(e) => setDeleteText(e.target.value)}
                  placeholder="Type DELETE to confirm"
                  disabled={isDeleting}
                  className="uppercase"
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={isDeleting} onClick={handleCancel}>
            Cancel
          </AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!canDelete || isDeleting}
            className="gap-2"
          >
            {isDeleting ? (
              <>
                <IconLoader2 className="h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Permanently Delete Account"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

**Step 2: Commit**

```bash
git add components/settings/DeleteAccountModal.tsx
git commit -m "$(cat <<'EOF'
feat: add DeleteAccountModal component

- Multi-step confirmation with checkboxes
- DELETE text input requirement
- Integrates with deletion API
- Handles loading, error, and success states

EOF
)"
```

---

### Task 3: Update Settings Page

**Files:**
- Modify: `app/(platform)/settings/page.tsx`

**Step 1: Add imports and Danger Zone section**

Add imports at top:
```tsx
import { useState } from "react";
import { IconAlertTriangle } from "@tabler/icons-react";
import { DeleteAccountModal } from "@/components/settings/DeleteAccountModal";
```

Add state in component:
```tsx
export default function SettingsPage() {
  const { user } = useAuth();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  // ... rest of component
```

Add Danger Zone card before closing `</div>` of container:
```tsx
      {/* Danger Zone - Account Deletion */}
      <div className="mt-12 pt-8 border-t border-border">
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 overflow-hidden">
          <div className="px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 mt-0.5">
                <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
                  <IconAlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-medium text-foreground">Delete Account</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Permanently delete your account and all associated data. This action cannot be undone.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  className="mt-3"
                  onClick={() => setDeleteModalOpen(true)}
                >
                  Delete Account
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DeleteAccountModal open={deleteModalOpen} onOpenChange={setDeleteModalOpen} />
```

**Step 2: Test the UI**

Run dev server and navigate to `/settings`:
1. Verify Danger Zone card appears at bottom
2. Click "Delete Account" button
3. Verify modal opens with all confirmation elements

**Step 3: Commit**

```bash
git add app/(platform)/settings/page.tsx
git commit -m "$(cat <<'EOF'
feat: add Danger Zone to settings page

- Add account deletion card with warning styling
- Integrate DeleteAccountModal
- Placed at bottom of settings page

EOF
)"
```

---

### Task 4: Verify End-to-End Flow

**Step 1: Create test user**

Use signup flow or create via admin to get a test account.

**Step 2: Test free tier user deletion**

1. Log in as free tier test user
2. Navigate to Settings
3. Click "Delete Account"
4. Check both checkboxes, type "DELETE"
5. Click "Permanently Delete Account"
6. Verify:
   - Loading state shows
   - Success toast appears
   - Redirected to homepage
   - User cannot log in again (account gone)

**Step 3: Test subscribed user deletion (if Stripe test keys available)**

1. Create test user with active subscription (use Stripe test mode)
2. Navigate to Settings → Delete Account
3. Complete deletion flow
4. Verify in Stripe Dashboard:
   - Subscription is canceled
   - No future invoices scheduled

**Step 4: Commit (if any fixes needed)**

If issues found, fix and commit with descriptive message.

---

## Testing Commands

Backend API test:
```bash
cd backend
pytest tests/api/test_account.py -v  # If tests added
```

Frontend type check:
```bash
npm run type-check  # or npx tsc --noEmit
```

Lint check:
```bash
npm run lint
```

---

## Rollback Plan

If issues discovered in production:
1. Revert commits: `git revert HEAD~3..HEAD`
2. Remove Danger Zone card from settings page
3. Remove API endpoint from router registration
4. Deploy revert

---

## Post-Implementation Checklist

- [ ] Backend endpoint tested with free tier user
- [ ] Backend endpoint tested with subscribed user (Stripe test mode)
- [ ] UI verified on desktop and mobile
- [ ] Error handling tested (network failure, etc.)
- [ ] Privacy policy still accurate (already mentions this capability)
- [ ] No console errors in browser
