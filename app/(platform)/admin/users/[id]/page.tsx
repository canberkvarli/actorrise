"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconShield, IconSparkles } from "@tabler/icons-react";

import api from "@/lib/api";
import { AdminUserDetailResponse, PricingTier } from "@/types/adminUsers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type BenefitValueKind = "number" | "boolean" | "string";

const BENEFIT_OPTIONS: Array<{ key: string; label: string; kind: BenefitValueKind }> = [
  { key: "ai_searches_per_month", label: "AI Searches / Month", kind: "number" },
  { key: "scene_partner_sessions", label: "ScenePartner Sessions", kind: "number" },
  { key: "craft_coach_sessions", label: "CraftCoach Sessions", kind: "number" },
  { key: "bookmarks_limit", label: "Bookmarks Limit", kind: "number" },
  { key: "search_history_limit", label: "Search History Limit", kind: "number" },
  { key: "recommendations", label: "Recommendations Access", kind: "boolean" },
  { key: "advanced_analytics", label: "Advanced Analytics Access", kind: "boolean" },
];

function getTierBadgeClass(tierName: string): string {
  const name = tierName.toLowerCase();
  if (name === "free") return "bg-slate-100 text-slate-700 border-slate-300";
  if (name === "plus" || name === "pro") return "bg-amber-100 text-amber-800 border-amber-300";
  if (name === "unlimited" || name === "elite") return "bg-violet-100 text-violet-800 border-violet-300";
  return "bg-muted text-foreground border-border";
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = Number(params.id);
  const queryClient = useQueryClient();

  const [profileNote, setProfileNote] = useState("");
  const [subscriptionNote, setSubscriptionNote] = useState("");
  const [rolesNote, setRolesNote] = useState("");
  const [benefitNote, setBenefitNote] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [location, setLocation] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [unionStatus, setUnionStatus] = useState("");

  const [tierId, setTierId] = useState<number | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState("active");
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);

  const [benefitKeyPreset, setBenefitKeyPreset] = useState(BENEFIT_OPTIONS[0].key);
  const [customBenefitKey, setCustomBenefitKey] = useState("");
  const [benefitType, setBenefitType] = useState<"set" | "revoke">("set");
  const [benefitNumberValue, setBenefitNumberValue] = useState("1");
  const [benefitBooleanValue, setBenefitBooleanValue] = useState("true");
  const [benefitStringValue, setBenefitStringValue] = useState("");
  const [benefitExpiry, setBenefitExpiry] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-user-detail", userId],
    queryFn: async () => {
      const res = await api.get<AdminUserDetailResponse>(`/api/admin/users/${userId}`);
      return res.data;
    },
    enabled: Number.isFinite(userId),
  });

  // Sync form state when query data loads (React Query v5 has no onSuccess on useQuery)
  useEffect(() => {
    if (!data) return;
    setDisplayName(data.user.name || "");
    setMarketingOptIn(Boolean(data.user.marketing_opt_in));
    setLocation((data.profile?.location as string) || "");
    setExperienceLevel((data.profile?.experience_level as string) || "");
    setUnionStatus((data.profile?.union_status as string) || "");
    setTierId(data.subscription?.tier_id ?? null);
    setSubscriptionStatus(data.subscription?.status ?? "active");
    setBillingPeriod((data.subscription?.billing_period as "monthly" | "annual") ?? "monthly");
    setCancelAtPeriodEnd(Boolean(data.subscription?.cancel_at_period_end));
  }, [data]);

  const { data: tiers = [] } = useQuery({
    queryKey: ["pricing-tiers-admin"],
    queryFn: async () => {
      const res = await api.get<PricingTier[]>("/api/pricing/tiers");
      return res.data;
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-user-detail", userId] });

  const profileMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => api.patch(`/api/admin/users/${userId}/profile`, payload),
    onSuccess: () => {
      invalidate();
      toast.success("Profile updated");
      setProfileNote("");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update profile"),
  });

  const subscriptionMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      api.patch(`/api/admin/users/${userId}/subscription`, payload),
    onSuccess: () => {
      invalidate();
      toast.success("Subscription updated");
      setSubscriptionNote("");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update subscription"),
  });

  const rolesMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => api.patch(`/api/admin/users/${userId}/roles`, payload),
    onSuccess: () => {
      invalidate();
      toast.success("Roles updated");
      setRolesNote("");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update roles"),
  });

  const benefitsMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      api.patch(`/api/admin/users/${userId}/benefits`, payload),
    onSuccess: () => {
      invalidate();
      toast.success("Benefits updated");
      setBenefitNote("");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update benefits"),
  });

  const summary = useMemo(() => {
    if (!data) return null;
    const subscriptionTierName = data.subscription?.tier_name ?? "free";
    const subscriptionTierDisplay = data.subscription?.tier_display_name ?? "Free";
    const roleLabel = data.user.can_approve_submissions
      ? "Approver"
      : data.user.is_moderator
        ? "Moderator"
        : "Member";
    return {
      label: data.user.name || data.profile?.name || data.user.email,
      monthly: data.usage.monthly,
      allTime: data.usage.all_time,
      roleLabel,
      subscriptionTierName,
      subscriptionTierDisplay,
    };
  }, [data]);

  const selectedBenefitOption = useMemo(
    () => BENEFIT_OPTIONS.find((option) => option.key === benefitKeyPreset),
    [benefitKeyPreset]
  );
  const effectiveBenefitKey =
    benefitKeyPreset === "__custom__" ? customBenefitKey.trim() : benefitKeyPreset;

  if (isLoading) {
    return <p className="text-muted-foreground">Loading user...</p>;
  }

  if (isError || !data) {
    return (
      <p className="text-destructive">
        {(error as Error)?.message || "Failed to load user detail"}
      </p>
    );
  }

  const roleState = {
    is_moderator: data.user.is_moderator,
    can_approve_submissions: data.user.can_approve_submissions,
  };

  const runProfileUpdate = () => {
    if (!profileNote.trim()) {
      toast.error("Profile note is required");
      return;
    }
    profileMutation.mutate({
      name: displayName,
      marketing_opt_in: marketingOptIn,
      profile: {
        location: location || null,
        experience_level: experienceLevel || null,
        union_status: unionStatus || null,
      },
      note: profileNote.trim(),
    });
  };

  const runSubscriptionPatch = () => {
    if (!subscriptionNote.trim()) {
      toast.error("Subscription note is required");
      return;
    }
    const payload: Record<string, unknown> = {
      status: subscriptionStatus,
      billing_period: billingPeriod,
      cancel_at_period_end: cancelAtPeriodEnd,
      note: subscriptionNote.trim(),
    };
    if (tierId != null) payload.tier_id = tierId;
    subscriptionMutation.mutate(payload);
  };

  const runBenefitPatch = () => {
    if (!benefitNote.trim()) {
      toast.error("Benefit note is required");
      return;
    }
    if (!effectiveBenefitKey) {
      toast.error("Feature key is required");
      return;
    }

    let parsedValue: unknown = null;
    if (benefitType === "set") {
      const kind = selectedBenefitOption?.kind ?? "string";
      if (kind === "number") {
        const numeric = Number(benefitNumberValue);
        if (!Number.isFinite(numeric)) {
          toast.error("Benefit value must be a valid number");
          return;
        }
        parsedValue = numeric;
      } else if (kind === "boolean") {
        parsedValue = benefitBooleanValue === "true";
      } else {
        parsedValue = benefitStringValue;
      }
    }

    benefitsMutation.mutate({
      feature_key: effectiveBenefitKey,
      override_type: benefitType,
      value: benefitType === "set" ? parsedValue : null,
      expires_at: benefitExpiry ? new Date(benefitExpiry).toISOString() : null,
      note: benefitNote.trim(),
      clear_existing: true,
    });
  };

  const toggleRole = (key: keyof typeof roleState, value: boolean) => {
    if (!rolesNote.trim()) {
      toast.error("Roles note is required");
      return;
    }
    rolesMutation.mutate({ [key]: value, note: rolesNote.trim() });
  };

  const setTierQuick = (nextTierId: number) => {
    setTierId(nextTierId);
    setSubscriptionStatus("active");
    setBillingPeriod("monthly");
    setCancelAtPeriodEnd(false);
  };

  const formattedCreatedAt = data.user.created_at
    ? new Date(data.user.created_at).toLocaleString()
    : "Unknown";

  const formatBenefitValue = (value: unknown): string => {
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
    if (value == null) return "—";
    return String(value);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">{summary?.label != null ? String(summary.label) : ""}</h2>
          <p className="text-sm text-muted-foreground">{data.user.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <IconShield className="h-3 w-3" />
              {summary?.roleLabel != null ? String(summary.roleLabel) : ""}
            </Badge>
            <Badge variant="outline" className={getTierBadgeClass(summary?.subscriptionTierName ?? "free")}>
              {summary?.subscriptionTierDisplay != null ? String(summary.subscriptionTierDisplay) : ""}
            </Badge>
            <Badge variant="outline">Joined {formattedCreatedAt}</Badge>
          </div>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/users">Back to users</Link>
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-3">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="membership">Membership</TabsTrigger>
          <TabsTrigger value="benefits">Benefits</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Monthly total searches</p>
                <p className="text-2xl font-semibold">{summary?.monthly.total_searches ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Monthly AI searches</p>
                <p className="text-2xl font-semibold">{summary?.monthly.ai_searches ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">ScenePartner sessions</p>
                <p className="text-2xl font-semibold">{summary?.monthly.scene_partner_sessions ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">CraftCoach sessions</p>
                <p className="text-2xl font-semibold">{summary?.monthly.craft_coach_sessions ?? 0}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Display name</Label>
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={marketingOptIn}
                      onChange={(e) => setMarketingOptIn(e.target.checked)}
                    />
                    Marketing opt-in
                  </label>
                </div>
                <div>
                  <Label>Location</Label>
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
                </div>
                <div>
                  <Label>Experience level</Label>
                  <Input
                    value={experienceLevel}
                    onChange={(e) => setExperienceLevel(e.target.value)}
                    placeholder="Beginner / Intermediate / Advanced"
                  />
                </div>
                <div>
                  <Label>Union status</Label>
                  <Input value={unionStatus} onChange={(e) => setUnionStatus(e.target.value)} placeholder="Optional" />
                </div>
              </div>
              <Input
                value={profileNote}
                onChange={(e) => setProfileNote(e.target.value)}
                placeholder="Reason for profile update"
              />
              <Button onClick={runProfileUpdate} disabled={profileMutation.isPending}>
                {profileMutation.isPending ? "Saving..." : "Save profile changes"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="membership" className="space-y-4">
          {!data.subscription && (
            <Alert>
              <IconSparkles className="h-4 w-4" />
              <AlertTitle>No subscription row yet</AlertTitle>
              <AlertDescription>
                This user is treated as Free by default. Save changes below to create and assign membership.
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Subscription and tier</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <Label>Membership tier</Label>
                  <Select
                    value={tierId != null ? String(tierId) : undefined}
                    onValueChange={(value) => setTierId(Number(value))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select tier" />
                    </SelectTrigger>
                    <SelectContent>
                      {tiers.map((tier) => (
                        <SelectItem key={tier.id} value={String(tier.id)}>
                          {tier.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={subscriptionStatus} onValueChange={setSubscriptionStatus}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["active", "trialing", "canceled", "past_due", "unpaid", "incomplete"].map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Billing period</Label>
                  <Select value={billingPeriod} onValueChange={(v) => setBillingPeriod(v as "monthly" | "annual")}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">monthly</SelectItem>
                      <SelectItem value="annual">annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={cancelAtPeriodEnd}
                    onChange={(e) => setCancelAtPeriodEnd(e.target.checked)}
                  />
                  Cancel at period end
                </label>
                <div className="flex flex-wrap gap-2">
                  {tiers
                    .filter((tier) => ["free", "plus", "pro", "unlimited", "elite"].includes(tier.name.toLowerCase()))
                    .map((tier) => (
                      <Button
                        key={tier.id}
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setTierQuick(tier.id)}
                      >
                        Set {tier.display_name}
                      </Button>
                    ))}
                </div>
              </div>

              <Input
                value={subscriptionNote}
                onChange={(e) => setSubscriptionNote(e.target.value)}
                placeholder="Reason for membership update"
              />
              <Button onClick={runSubscriptionPatch} disabled={subscriptionMutation.isPending}>
                {subscriptionMutation.isPending ? "Saving..." : "Save membership changes"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="benefits" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Apply benefit override</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <Label>Benefit</Label>
                  <Select value={benefitKeyPreset} onValueChange={setBenefitKeyPreset}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BENEFIT_OPTIONS.map((option) => (
                        <SelectItem key={option.key} value={option.key}>
                          {option.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="__custom__">Custom key</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Override type</Label>
                  <Select value={benefitType} onValueChange={(v) => setBenefitType(v as "set" | "revoke")}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="set">Set</SelectItem>
                      <SelectItem value="revoke">Revoke</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Expires at</Label>
                  <Input type="datetime-local" className="mt-1" value={benefitExpiry} onChange={(e) => setBenefitExpiry(e.target.value)} />
                </div>
              </div>

              {benefitKeyPreset === "__custom__" && (
                <div>
                  <Label>Custom key</Label>
                  <Input
                    className="mt-1"
                    value={customBenefitKey}
                    onChange={(e) => setCustomBenefitKey(e.target.value)}
                    placeholder="e.g. can_access_beta_feature"
                  />
                </div>
              )}

              {benefitType === "set" && (
                <div>
                  <Label>Value</Label>
                  {(selectedBenefitOption?.kind ?? "string") === "number" && (
                    <Input className="mt-1" value={benefitNumberValue} onChange={(e) => setBenefitNumberValue(e.target.value)} />
                  )}
                  {(selectedBenefitOption?.kind ?? "string") === "boolean" && (
                    <Select value={benefitBooleanValue} onValueChange={setBenefitBooleanValue}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Enabled</SelectItem>
                        <SelectItem value="false">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {(selectedBenefitOption?.kind ?? "string") === "string" && (
                    <Input className="mt-1" value={benefitStringValue} onChange={(e) => setBenefitStringValue(e.target.value)} />
                  )}
                </div>
              )}

              <Input
                value={benefitNote}
                onChange={(e) => setBenefitNote(e.target.value)}
                placeholder="Reason for benefit override"
              />
              <Button onClick={runBenefitPatch} disabled={benefitsMutation.isPending}>
                {benefitsMutation.isPending ? "Saving..." : "Apply override"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Effective benefits</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2">
              {Object.entries(data.effective_benefits).map(([key, value]) => (
                <div key={key} className="rounded border px-3 py-2">
                  <p className="text-xs font-medium text-foreground">{key}</p>
                  <p className="text-sm text-muted-foreground">{formatBenefitValue(value)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permissions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Roles and permissions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                value={rolesNote}
                onChange={(e) => setRolesNote(e.target.value)}
                placeholder="Reason for permission change"
              />
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded border p-3">
                  <div className="mb-2">
                    <p className="text-sm font-medium">Moderator</p>
                    <p className="text-xs text-muted-foreground">Can access admin areas</p>
                  </div>
                  <Switch
                    checked={roleState.is_moderator}
                    onCheckedChange={(v) => toggleRole("is_moderator", v)}
                    disabled={rolesMutation.isPending}
                  />
                </div>
                <div className="rounded border p-3">
                  <div className="mb-2">
                    <p className="text-sm font-medium">Approver</p>
                    <p className="text-xs text-muted-foreground">Can approve sensitive moderation actions</p>
                  </div>
                  <Switch
                    checked={roleState.can_approve_submissions}
                    onCheckedChange={(v) => toggleRole("can_approve_submissions", v)}
                    disabled={rolesMutation.isPending}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audit timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {data.audit_logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No admin actions logged yet.</p>
              ) : (
                <ul className="space-y-2">
                  {data.audit_logs.map((log) => (
                    <li key={log.id} className="rounded border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{log.action_type}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {log.created_at ? new Date(log.created_at).toLocaleString() : "Unknown date"}
                        </span>
                        {log.actor_admin_email && (
                          <span className="text-xs text-muted-foreground">by {log.actor_admin_email}</span>
                        )}
                      </div>
                      {log.note && <p className="mt-1 text-sm">{log.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
