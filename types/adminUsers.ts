export interface AdminUserListItem {
  id: number;
  email: string;
  name: string | null;
  profile_name: string | null;
  created_at: string | null;
  is_moderator: boolean;
  can_approve_submissions: boolean;
  email_verified: boolean;
  tier_name: string;
  tier_display_name: string;
  subscription_status: string;
  billing_period: string;
  profile_exists: boolean;
}

export interface AdminUsersListResponse {
  items: AdminUserListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface BenefitOverrideResponse {
  id: number;
  feature_key: string;
  override_type: "set" | "revoke";
  value: unknown;
  expires_at: string | null;
  note: string | null;
  created_by_admin_id: number | null;
  created_at: string | null;
}

export interface AdminAuditLogResponse {
  id: number;
  actor_admin_id: number;
  actor_admin_email: string | null;
  target_user_id: number;
  action_type: string;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  note: string | null;
  created_at: string | null;
}

export interface AdminUserDetailResponse {
  user: {
    id: number;
    email: string;
    name: string | null;
    is_moderator: boolean;
    can_approve_submissions: boolean;
    email_verified: boolean;
    marketing_opt_in: boolean;
    has_seen_welcome: boolean;
    has_seen_search_tour: boolean;
    has_seen_profile_tour: boolean;
    created_at: string | null;
  };
  profile: Record<string, unknown> | null;
  subscription: {
    id: number;
    tier_id: number;
    tier_name: string;
    tier_display_name: string;
    status: string;
    billing_period: string;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    canceled_at: string | null;
    trial_end: string | null;
  } | null;
  usage: {
    monthly: {
      ai_searches: number;
      total_searches: number;
      scene_partner_sessions: number;
      craft_coach_sessions: number;
    };
    all_time: {
      ai_searches: number;
      total_searches: number;
      scene_partner_sessions: number;
      craft_coach_sessions: number;
    };
  };
  effective_benefits: Record<string, unknown>;
  benefit_overrides: BenefitOverrideResponse[];
  audit_logs: AdminAuditLogResponse[];
}

export interface PricingTier {
  id: number;
  name: string;
  display_name: string;
}
