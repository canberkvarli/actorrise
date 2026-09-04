"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { IconLoader2, IconPhoto, IconEdit, IconX, IconTrash, IconUpload } from "@tabler/icons-react";
import { PhotoEditor } from "./PhotoEditor";
import { FieldLabel } from "./FieldHint";
import { CreditsInline } from "./CreditsInline";
import { ProfileCallSheet, type CallSheetSlot } from "./ProfileCallSheet";
import { ProfilePayoff } from "./ProfilePayoff";
import { MasksSketch, SpotlightSketch, StageDoorSketch } from "@/components/brand/sketches";
import { useProfileFormData, type FullProfileResponse } from "@/hooks/useDashboardData";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  LOCATIONS,
  EXPERIENCE_LEVELS,
  GENDERS,
  AGE_RANGES,
  BUILD_OPTIONS,
  UNION_STATUSES,
  CHARACTER_TYPES,
  PREFERRED_GENRES,
  ACTOR_TYPE_IDS,
  ACTOR_TYPE_LABELS,
  TRAINING_BACKGROUND_OPTIONS,
  ETHNICITY_OPTIONS,
  HEIGHT_FEET,
  HEIGHT_INCHES,
} from "@/lib/profileOptions";

function parseHeight(h: string | undefined): { feet: string; inches: string } {
  if (!h || !h.trim()) return { feet: "__none__", inches: "__none__" };
  const m = h.trim().match(/^(\d+)'(\d+)"?$/);
  if (!m) return { feet: "__none__", inches: "__none__" };
  return { feet: m[1], inches: m[2] };
}

const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  age_range: z.string().optional(),
  gender: z.string().optional(),
  ethnicity: z.string().optional(),
  height: z.string().optional(),
  build: z.string().optional(),
  location: z.string().optional(),
  experience_level: z.string().optional(),
  type: z.string().optional(),
  training_background: z.string().optional(),
  union_status: z.string().optional(),
  preferred_genres: z.array(z.string()),
  overdone_alert_sensitivity: z.number().min(0).max(1),
  profile_bias_enabled: z.boolean(),
  headshot_url: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

/**
 * "Basic Info / Acting Info / Preferences" named the database, not the actor.
 * These name what the actor is doing in each one.
 */
const TAB_RAIL = [
  { value: "basic", label: "Who you are" },
  { value: "acting", label: "How you work" },
  { value: "preferences", label: "What you see" },
] as const;

/** Fields rise in together on a tab change rather than appearing all at once. */
const RISE = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};
const RISE_LIST = { show: { transition: { staggerChildren: 0.045 } } };

function Field({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      variants={RISE}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={`space-y-2 ${className}`}
    >
      {children}
    </motion.div>
  );
}

function SectionHead({
  sketch: Sketch,
  title,
  aside,
}: {
  sketch: typeof MasksSketch;
  title: string;
  aside: string;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-border/60 px-6 py-5">
      <Sketch size={40} className="shrink-0 text-muted-foreground/55" />
      <div className="min-w-0">
        <h2 className="font-brand text-xl font-medium text-foreground">{title}</h2>
        <p className="stage-direction mt-0.5 text-xs text-muted-foreground/70">{aside}</p>
      </div>
    </div>
  );
}

/** The quiet rule that separates "we need this" from "this helps". */
function GroupRule({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground/70">
        {children}
      </span>
      <span className="h-px flex-1 bg-border/70" />
    </div>
  );
}

export function ActorProfileForm() {
  const queryClient = useQueryClient();
  const { user, refreshUser } = useAuth();
  // A drama teacher should not be asked for her union status. Educators get the
  // short version of this page: name, market, school and a photo. Students keep
  // the full actor profile — they are actors, they just have a teacher.
  const isEducator = user?.account_type === "educator";
  // organization lives on `users`, not on ActorProfile, so it saves through the
  // onboarding PATCH rather than the profile PUT the rest of this form uses.
  const [organization, setOrganization] = useState("");
  const [organizationLoaded, setOrganizationLoaded] = useState(false);
  useEffect(() => {
    // Populate once, from the auth user. Guarded so a background refreshUser()
    // can't overwrite what they are in the middle of typing.
    if (organizationLoaded || !user) return;
    setOrganization(user.organization || "");
    setOrganizationLoaded(true);
  }, [user, organizationLoaded]);
  const saveOrganization = useCallback(async () => {
    if (!organizationLoaded) return;
    if ((user?.organization || "") === organization.trim()) return;
    try {
      await api.patch("/api/auth/onboarding", { organization: organization.trim() });
      await refreshUser();
    } catch {
      toast.error("Couldn't save that. Try again?");
    }
  }, [organization, organizationLoaded, user?.organization, refreshUser]);

  const { data: cachedProfile, isLoading: isQueryLoading, isFetching: isQueryFetching } = useProfileFormData();
  // Show skeleton only on very first load (no cached data at all). Revisits render instantly.
  const isFetching = isQueryLoading && !cachedProfile;
  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saving" | "saved" | null>(null);
  const [headshotPreview, setHeadshotPreview] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [imageToEdit, setImageToEdit] = useState<string | null>(null);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  const [hasInitialized, setHasInitialized] = useState(false);
  // Gate first paint so the server render and the first client render match:
  // React Query's cache can be warm on the client but empty on the server, which
  // would otherwise flip the skeleton/loaded branch and trip a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  /** Actor types - multi-select; when non-empty we save type as array */
  const [actorTypes, setActorTypes] = useState<string[]>([]);
  const hasPopulatedRef = useRef(false);
  const saveAbortRef = useRef<AbortController | null>(null);
  const saveStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const {
    register,
    formState: { errors },
    setValue,
    watch,
    getValues,
    reset,
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      preferred_genres: [],
      overdone_alert_sensitivity: 0.5,
      profile_bias_enabled: true,
    },
  });

  const profileBiasEnabled = watch("profile_bias_enabled");
  const preferredGenres = watch("preferred_genres");

  // Watch individual fields to track changes for auto-save
  const name = watch("name");
  const ageRange = watch("age_range");
  const gender = watch("gender");
  const ethnicity = watch("ethnicity");
  const height = watch("height");
  const build = watch("build");
  const location = watch("location");
  const experienceLevel = watch("experience_level");
  const type = watch("type");
  const trainingBackground = watch("training_background");
  const unionStatus = watch("union_status");
  const preferredGenresValue = watch("preferred_genres");
  const overdoneSensitivity = watch("overdone_alert_sensitivity");
  const profileBias = watch("profile_bias_enabled");
  const headshotUrl = watch("headshot_url");
  
  type PreviousValues = {
    name: string | undefined;
    ageRange: string | undefined;
    gender: string | undefined;
    ethnicity: string | undefined;
    height: string | undefined;
    build: string | undefined;
    location: string | undefined;
    experienceLevel: string | undefined;
    type: string | undefined;
    actorTypes: string[];
    trainingBackground: string | undefined;
    unionStatus: string | undefined;
    preferredGenres: string[];
    overdoneSensitivity: number;
    profileBias: boolean;
    headshotUrl: string | undefined;
  };
  const prevValuesRef = useRef<PreviousValues>({
    name: "",
    ageRange: "",
    gender: "",
    ethnicity: undefined,
    height: undefined,
    build: undefined,
    location: "",
    experienceLevel: "",
    type: "",
    actorTypes: [],
    trainingBackground: undefined,
    unionStatus: "",
    preferredGenres: [],
    overdoneSensitivity: 0.5,
    profileBias: true,
    headshotUrl: undefined,
  });

  // Calculate profile completion percentage - matches backend calculation
  const completionPercentage = useMemo(() => {
    // An educator is never shown the casting fields, so scoring her against them
    // would peg her at ~30% forever with no way to fix it.
    if (isEducator) {
      const filled = [name, location].filter(Boolean).length;
      return Math.round((filled / 2) * 100);
    }
    const hasType = type || actorTypes.length > 0;
    const requiredFields = [
      name,
      ageRange,
      gender,
      location,
      experienceLevel,
      hasType,
      unionStatus,
    ];
    // Headshot is intentionally excluded — it is a bonus, not part of completion,
    // so a full casting profile reads 100% without a photo (matches backend).
    const optionalFields = [
      ethnicity,
      height,
      build,
      trainingBackground,
    ];

    const requiredCount = requiredFields.filter(Boolean).length;
    const optionalCount = optionalFields.filter(Boolean).length;

    // Required fields are 70% of completion, optional are 30% - matches backend
    const percentage = (requiredCount / 7) * 70 + (optionalCount / 4) * 30;
    return Math.min(100, Math.round(percentage * 10) / 10); // Round to 1 decimal like backend
  }, [
    isEducator,
    name,
    ageRange,
    gender,
    location,
    experienceLevel,
    type,
    unionStatus,
    actorTypes,
    ethnicity,
    height,
    build,
    trainingBackground,
  ]);

  const heightParsed = useMemo(() => parseHeight(height), [height]);

  /**
   * The profile, phrased as a casting breakdown.
   *
   * Split over two lines: who you read as, then how you work. The order is the
   * order a breakdown is written in, not the order the form asks in — the point
   * is that it reads like something, so a gap in it reads like a gap.
   */
  const actorTypeText = useMemo(
    () => actorTypes.map((id) => ACTOR_TYPE_LABELS[id] || id).join(", "),
    [actorTypes],
  );
  const experienceLabel = useMemo(
    () => EXPERIENCE_LEVELS.find((l) => l.id === experienceLevel)?.label || "",
    [experienceLevel],
  );

  const callSheet = useMemo(() => {
    if (isEducator) {
      return {
        primary: [
          { key: "location", value: location, blank: "market", tab: "basic", fieldId: "location" },
          { key: "organization", value: organization, blank: "school or studio", tab: "basic", fieldId: "organization" },
        ] as CallSheetSlot[],
        secondary: [] as CallSheetSlot[],
      };
    }
    const primary: CallSheetSlot[] = [
      { key: "age_range", value: ageRange, blank: "age range", tab: "basic", fieldId: "age_range" },
      { key: "gender", value: gender, blank: "gender", tab: "basic", fieldId: "gender" },
      { key: "union_status", value: unionStatus, blank: "union status", tab: "acting", fieldId: "union_status" },
      { key: "location", value: location, blank: "market", tab: "basic", fieldId: "location" },
    ];
    const secondary: CallSheetSlot[] = [
      { key: "type", value: actorTypeText, blank: "what you act in", tab: "acting", fieldId: "actor-types" },
      { key: "experience_level", value: experienceLabel, blank: "experience", tab: "acting", fieldId: "experience_level" },
    ];
    return { primary, secondary };
  }, [isEducator, organization, ageRange, gender, unionStatus, location, actorTypeText, experienceLabel]);

  /**
   * Only the fields the recommender actually reads. Height and name do not
   * change which monologue suits you, and putting `name` in here would fire a
   * request per keystroke.
   */
  const payoffSignature = [
    ageRange,
    gender,
    experienceLevel,
    actorTypes.join(","),
    typeof type === "string" ? type : "",
    (preferredGenresValue || []).join(","),
  ].join("|");
  const payoffReady = Boolean(ageRange && (actorTypes.length > 0 || experienceLevel));
  const payoffBecause = [ageRange, gender?.toLowerCase(), actorTypeText.toLowerCase()].filter(
    Boolean,
  ) as string[];

  /**
   * The slider used to read "Overdone Alert Sensitivity: 0.7", which tells an
   * actor nothing. Say what 0.7 does.
   */
  const overdoneCopy = useMemo(() => {
    const v = Number(overdoneSensitivity ?? 0.5);
    if (v <= 0.3) return "Only the pieces everyone in the room has already heard.";
    if (v <= 0.6) return "The well-worn ones, before you get attached to them.";
    return "Anything a reader might recognise, so you can go somewhere else.";
  }, [overdoneSensitivity]);

  /** A blank on the call sheet is a shortcut to the field that fills it. */
  const jumpToField = useCallback((tab: string, fieldId: string) => {
    setActiveTab(tab);
    // Radix mounts the tab panel on the next frame, so the element does not
    // exist yet at this point in the handler.
    requestAnimationFrame(() => {
      const el = document.getElementById(fieldId);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // preventScroll: scrollIntoView above already owns the scroll, and focus
      // would otherwise fight it with an instant jump.
      (el as HTMLElement).focus({ preventScroll: true });
    });
  }, []);

  // Populate form from React Query cached data — runs only once per mount
  useEffect(() => {
    if (hasPopulatedRef.current || !cachedProfile) return;
    hasPopulatedRef.current = true;
    const profile = cachedProfile;

    const rawType = profile.type;
    let typeValue = "";
    if (rawType) {
      if (Array.isArray(rawType)) {
        const allTypes = rawType.map((t: unknown) => String(t));
        const actorTypeIds = ACTOR_TYPE_IDS as readonly string[];
        const actorTypeValues = allTypes.filter((t) => actorTypeIds.includes(t));
        const characterType = allTypes.find((t) => !actorTypeIds.includes(t));
        setActorTypes(actorTypeValues);
        typeValue = characterType || "";
      } else {
        setActorTypes([]);
        typeValue = String(rawType);
      }
    } else {
      setActorTypes([]);
    }

    const formData = {
      name: profile.name || "",
      age_range: profile.age_range || "",
      gender: profile.gender || "",
      ethnicity: profile.ethnicity || "",
      height: profile.height || "",
      build: profile.build || "",
      location: profile.location || "",
      experience_level: profile.experience_level || "",
      type: typeValue,
      training_background: profile.training_background || "",
      union_status: profile.union_status || "",
      preferred_genres: Array.isArray(profile.preferred_genres) ? profile.preferred_genres : [],
      overdone_alert_sensitivity: profile.overdone_alert_sensitivity ?? 0.5,
      profile_bias_enabled: profile.profile_bias_enabled ?? true,
      headshot_url: profile.headshot_url || "",
    };
    reset(formData, { keepDefaultValues: false, keepDirty: false, keepErrors: false });

    if (profile.headshot_url) {
      const cleanUrl = profile.headshot_url.trim().split('?')[0].split('#')[0];
      setHeadshotPreview(cleanUrl);
    } else {
      setHeadshotPreview(null);
    }

    const actorTypeIds = ACTOR_TYPE_IDS as readonly string[];
    const loadedActorTypes = Array.isArray(rawType)
      ? rawType.map((t: unknown) => String(t)).filter((t) => actorTypeIds.includes(t))
      : [];
    prevValuesRef.current = {
      name: profile.name || "",
      ageRange: profile.age_range || "",
      gender: profile.gender || "",
      ethnicity: profile.ethnicity || "",
      height: profile.height || "",
      build: profile.build || "",
      location: profile.location || "",
      experienceLevel: profile.experience_level || "",
      type: typeValue,
      actorTypes: loadedActorTypes,
      trainingBackground: profile.training_background || "",
      unionStatus: profile.union_status || "",
      preferredGenres: Array.isArray(profile.preferred_genres) ? profile.preferred_genres : [],
      overdoneSensitivity: profile.overdone_alert_sensitivity ?? 0.5,
      profileBias: profile.profile_bias_enabled ?? true,
      headshotUrl: profile.headshot_url || "",
    };

    // Mark initialized after React flushes form values
    setTimeout(() => setHasInitialized(true), 30);
  }, [cachedProfile, reset]);


  // Build save payload from current form + actorTypes state
  const buildSaveData = useCallback(() => {
    const data = getValues();
    type SaveData = {
      name: string | null;
      age_range: string | null;
      gender: string | null;
      ethnicity: string | null;
      height: string | null;
      build: string | null;
      location: string | null;
      experience_level: string | null;
      type: string | string[] | null;
      training_background: string | null;
      union_status: string | null;
      preferred_genres: string[];
      overdone_alert_sensitivity: number;
      profile_bias_enabled: boolean;
      headshot_url: string | null;
    };
    const saveData: SaveData = {
      name: data.name?.trim() || null,
      age_range: data.age_range?.trim() || null,
      gender: data.gender?.trim() || null,
      location: data.location?.trim() || null,
      experience_level: data.experience_level?.trim() || null,
      union_status: data.union_status?.trim() || null,
      type: null,
      ethnicity: data.ethnicity?.trim() || null,
      height: data.height?.trim() || null,
      build: data.build?.trim() || null,
      training_background: data.training_background?.trim() || null,
      headshot_url: data.headshot_url?.trim() || null,
      preferred_genres: Array.isArray(data.preferred_genres) ? data.preferred_genres : [],
      overdone_alert_sensitivity: Number(data.overdone_alert_sensitivity ?? 0.5),
      profile_bias_enabled: Boolean(data.profile_bias_enabled ?? true),
    };
    // Actor types + character type
    if (actorTypes.length > 0) {
      const charType = data.type?.trim();
      saveData.type = charType && !actorTypes.includes(charType) ? [...actorTypes, charType] : actorTypes;
    } else if (data.type && data.type.trim()) {
      saveData.type = data.type.trim();
    }
    return saveData;
  }, [getValues, actorTypes]);

  // Auto-save: fires immediately on change, cancels previous in-flight request
  useEffect(() => {
    if (!hasInitialized || isQueryLoading) return;

    const currentValues = {
      name, ageRange, gender, ethnicity, height, build, location,
      experienceLevel, type, actorTypes, trainingBackground, unionStatus,
      preferredGenres: preferredGenresValue, overdoneSensitivity, profileBias, headshotUrl,
    };

    const prevValues = prevValuesRef.current;
    const hasChanged = Object.keys(currentValues).some((key) => {
      const typedKey = key as keyof typeof currentValues;
      return JSON.stringify(prevValues[typedKey as keyof PreviousValues]) !== JSON.stringify(currentValues[typedKey]);
    });

    if (!hasChanged) return;
    prevValuesRef.current = currentValues;

    // Cancel previous in-flight save
    if (saveAbortRef.current) saveAbortRef.current.abort();
    const abort = new AbortController();
    saveAbortRef.current = abort;

    const saveData = buildSaveData();

    // Optimistically update caches BEFORE the API call so navigation sees fresh data
    queryClient.setQueryData<FullProfileResponse>(["profile-form"], (old) =>
      old ? { ...old, ...saveData } : old
    );

    // Optimistically compute and set profile-stats so dashboard shows correct % instantly
    const filled = (v: unknown) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0);
    const reqFields = [saveData.name, saveData.age_range, saveData.gender, saveData.location, saveData.experience_level, saveData.type, saveData.union_status];
    // Headshot excluded from completion (bonus, not required) — matches backend.
    const optFields = [saveData.ethnicity, saveData.height, saveData.build, saveData.training_background];
    const reqCount = reqFields.filter(filled).length;
    const optCount = optFields.filter(filled).length;
    const pct = Math.min(100, Math.round(((reqCount / 7) * 70 + (optCount / 4) * 30) * 10) / 10);
    queryClient.setQueryData(["profile-stats"], () => ({
      completion_percentage: pct,
      has_headshot: Boolean(filled(saveData.headshot_url)),
      preferred_genres_count: saveData.preferred_genres?.length ?? 0,
      profile_bias_enabled: saveData.profile_bias_enabled ?? true,
    }));

    setSaveStatus("saving");

    // Fire-and-forget: the fetch completes even if the component unmounts
    api.post("/api/profile", saveData)
      .then(() => {
        if (abort.signal.aborted) return;
        setSaveStatus("saved");
        queryClient.invalidateQueries({ queryKey: ["profile"], refetchType: "all" });
        queryClient.invalidateQueries({ queryKey: ["profile-stats"], refetchType: "all" });
        queryClient.invalidateQueries({ queryKey: ["recommendations"], refetchType: "all" });
        if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current);
        saveStatusTimeoutRef.current = setTimeout(() => setSaveStatus(null), 3000);
      })
      .catch((err: unknown) => {
        if (abort.signal.aborted) return;
        console.error("❌ Save error:", err);
        const error = err as { response?: { data?: { detail?: string | Array<{ msg?: string } | string> | Record<string, unknown> } } };
        let errorMessage = "Failed to save profile";
        if (error.response?.data?.detail) {
          if (typeof error.response.data.detail === 'string') {
            errorMessage = error.response.data.detail;
          } else if (Array.isArray(error.response.data.detail)) {
            errorMessage = error.response.data.detail.map((e) =>
              typeof e === 'string' ? e : (typeof e === 'object' && e !== null && 'msg' in e ? String(e.msg) : JSON.stringify(e))
            ).join(', ');
          } else {
            errorMessage = JSON.stringify(error.response.data.detail);
          }
        }
        toast.error(errorMessage);
        setSaveStatus(null);
      });

    return () => {
      if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current);
    };
  }, [
    name, ageRange, gender, ethnicity, height, build, location,
    experienceLevel, type, actorTypes, trainingBackground, unionStatus,
    preferredGenresValue, overdoneSensitivity, profileBias, headshotUrl,
    hasInitialized, isQueryLoading, buildSaveData, queryClient
  ]);

  const handleHeadshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      console.log("File selected:", file.name, file.type, file.size);
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error("Please upload an image file");
        return;
      }
      
      // Validate file size
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size must be less than 5MB");
        return;
      }
      
      // Check minimum file size (very small files might be corrupted)
      if (file.size < 100) {
        toast.error("Image file is too small. Please upload a valid image.");
        return;
      }
      
      const reader = new FileReader();
      
      reader.onloadend = () => {
        const base64String = reader.result as string;
        if (!base64String || base64String.length < 100) {
          toast.error("Failed to read image file. Please try again.");
          return;
        }
        
        // Validate the base64 string
        if (!base64String.startsWith("data:image/")) {
          toast.error("Invalid image format. Please try uploading again.");
          return;
        }
        
        console.log("Image loaded successfully, size:", base64String.length);
        setImageToEdit(base64String);
        setShowEditor(true);
      };
      
      reader.onerror = () => {
        console.error("FileReader error:", reader.error);
        toast.error("Failed to read image file. Please try again.");
      };
      
      reader.readAsDataURL(file);
    }
    
    // Reset the input so the same file can be selected again
    e.target.value = '';
  };

  const handlePhotoClick = () => {
    if (headshotPreview) {
      setShowPhotoViewer(true);
    }
  };

  const handleEditPhoto = () => {
    if (headshotPreview) {
      setShowPhotoViewer(false);
      setImageToEdit(headshotPreview);
      setShowEditor(true);
    }
  };

  const handleReplacePhoto = () => {
    // Trigger file input
    const fileInput = document.getElementById("headshot-replace-modal") as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  };

  const handleSaveEditedPhoto = async (croppedImage: string) => {
    // If it's a base64 image (data URL), upload it to Supabase
    if (croppedImage.startsWith("data:image")) {
      try {
        setIsLoading(true);
        type HeadshotResponse = {
          headshot_url: string;
        };
        const response = await api.post<HeadshotResponse>("/api/profile/headshot", {
          image: croppedImage,
        });
          let uploadedUrl = response.data.headshot_url;
          // Clean the URL - remove trailing query params, fragments, and whitespace
          uploadedUrl = uploadedUrl.trim().split('?')[0].split('#')[0];
          console.log("Uploaded headshot URL (cleaned):", uploadedUrl);
          // Invalidate cache after headshot upload
          queryClient.invalidateQueries({ queryKey: ["profile"] });
          queryClient.invalidateQueries({ queryKey: ["profile-stats"] });
          
          // Set both preview and form value
        setHeadshotPreview(uploadedUrl);
          setValue("headshot_url", uploadedUrl, { shouldDirty: false });
        
        // Update prevValuesRef to prevent auto-save from triggering
        prevValuesRef.current.headshotUrl = uploadedUrl;
        
        // Force a re-render by updating state
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Close editor immediately after successful upload
        setShowEditor(false);
        setImageToEdit(null);
        toast.success("Headshot uploaded successfully!");
      } catch (err: unknown) {
        const error = err as { response?: { data?: { detail?: string | Array<{ msg?: string } | string> | Record<string, unknown> } } };
        let errorMessage = "Failed to upload headshot";
        if (error.response?.data?.detail) {
          if (typeof error.response.data.detail === 'string') {
            errorMessage = error.response.data.detail;
          } else if (Array.isArray(error.response.data.detail)) {
            errorMessage = error.response.data.detail.map((e) => 
              typeof e === 'string' ? e : (typeof e === 'object' && e !== null && 'msg' in e ? String(e.msg) : JSON.stringify(e))
            ).join(', ');
          } else {
            errorMessage = String(error.response.data.detail);
          }
        }
        toast.error(errorMessage);
        // Still show the image locally even if upload fails
        setHeadshotPreview(croppedImage);
        setValue("headshot_url", croppedImage);
        prevValuesRef.current.headshotUrl = croppedImage;
      } finally {
        setIsLoading(false);
      }
    } else {
      // Already a URL, just use it
      setHeadshotPreview(croppedImage);
      setValue("headshot_url", croppedImage);
      prevValuesRef.current.headshotUrl = croppedImage;
      
      // Close editor
    setShowEditor(false);
    setImageToEdit(null);
    }
  };

  const handleCancelEdit = () => {
    setShowEditor(false);
    setImageToEdit(null);
  };

  const handleDeletePhoto = async () => {
    if (!confirm("Are you sure you want to delete your headshot?")) {
      return;
    }

    try {
      setIsLoading(true);
      setShowPhotoViewer(false);
      
      // Use PUT method and send only headshot_url: null
      // The backend uses exclude_unset=True, so we need to explicitly set it
      const saveData: { headshot_url: null } = {
        headshot_url: null, // Explicitly set to null to delete
      };
       await api.put("/api/profile", saveData);
       setValue("headshot_url", "", { shouldDirty: false });
       setHeadshotPreview(null);
       prevValuesRef.current.headshotUrl = "";
       toast.success("Headshot deleted successfully");
     } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string | Array<{ msg?: string } | string> | Record<string, unknown> } } };
      let errorMessage = "Failed to delete headshot";
      if (error.response?.data?.detail) {
        if (typeof error.response.data.detail === 'string') {
          errorMessage = error.response.data.detail;
        } else if (Array.isArray(error.response.data.detail)) {
          errorMessage = error.response.data.detail.map((e) => 
            typeof e === 'string' ? e : (typeof e === 'object' && e !== null && 'msg' in e ? String(e.msg) : JSON.stringify(e))
          ).join(', ');
        } else {
          errorMessage = String(error.response.data.detail);
        }
      }
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleGenre = (genre: string) => {
    const current = preferredGenres || [];
    if (current.includes(genre)) {
      setValue("preferred_genres", current.filter((g) => g !== genre));
    } else {
      setValue("preferred_genres", [...current, genre]);
    }
  };

  if (!mounted || isFetching) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-4 w-32 mb-4" />
            <Skeleton className="h-2 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-6">
        {/* Headshot beside the casting line, not in a card of its own below it.
            That is the shape of an actual breakdown — photo, then the facts —
            and it saves a full card of vertical space for an optional field. */}
        <div className="flex flex-row items-start gap-4 sm:gap-6">
          <motion.div
            id="profile-headshot"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="shrink-0"
          >
              <div className="flex flex-col gap-2">
                <div className="flex-shrink-0">
                  {headshotPreview ? (
                    <button
                      type="button"
                      onClick={handlePhotoClick}
                      className="relative w-24 h-36 sm:w-32 sm:h-48 rounded-md overflow-hidden border-2 border-border bg-muted shadow-sm hover:shadow-md hover:border-primary/60 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 group"
                      aria-label="View headshot"
                    >
                      <img
                        src={headshotPreview}
                        alt="Headshot preview"
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const placeholder = e.currentTarget.nextElementSibling as HTMLElement;
                          if (placeholder) placeholder.style.display = 'flex';
                        }}
                      />
                      <div className="absolute inset-0 hidden items-center justify-center bg-muted">
                        <IconPhoto className="h-8 w-8 text-muted-foreground" />
                      </div>
                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-200" />
                    </button>
                  ) : (
                    <label
                      htmlFor="headshot"
                      className="flex flex-col items-center justify-center w-24 h-36 sm:w-32 sm:h-48 rounded-md border-2 border-dashed border-border bg-muted/30 hover:bg-muted/50 hover:border-primary/50 transition-all duration-200 cursor-pointer group"
                    >
                      <IconPhoto className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors mb-2" />
                      <span className="text-xs text-muted-foreground group-hover:text-foreground text-center px-2">
                        Upload
                      </span>
                      <Input 
                        id="headshot" 
                        type="file"
                        accept="image/*"
                        onChange={handleHeadshotChange}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
                {/* One line, not a paragraph. The frame already says "photo". */}
                <p className="stage-direction w-24 text-[11px] leading-snug text-muted-foreground/70 sm:w-32">
                  {headshotPreview ? "(tap to replace.)" : "(optional.)"}
                </p>
              </div>
          </motion.div>

          <div className="min-w-0 flex-1">
            <ProfileCallSheet
              name={name}
              primary={callSheet.primary}
              secondary={callSheet.secondary}
              completion={completionPercentage}
              saveStatus={saveStatus}
              onJump={jumpToField}
            />
          </div>
        </div>

        {/* Tabs for organized sections */}
        <div id="profile-tabs">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* A rail, not a segmented control. The grey pill made three equal
              buttons look like a toolbar; these are the acts of one document. */}
          {/* Educators only have the first act, and a rail of one is not a rail.
              Not rendered rather than CSS-hidden, so the casting tabs can't be
              reached by keyboard either. */}
          {!isEducator && (
          <TabsList className="grid w-full grid-cols-3 gap-0 rounded-none border-b border-border bg-transparent p-0">
            {TAB_RAIL.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                id={t.value === "preferences" ? "profile-preferences" : undefined}
                className="relative rounded-none px-2 pb-3 pt-2 text-[13px] font-medium leading-tight text-muted-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none sm:text-sm"
              >
                {t.label}
                {activeTab === t.value && (
                  // layoutId, so the underline slides between tabs instead of
                  // blinking out and back in somewhere else.
                  <motion.span
                    layoutId="profile-tab-underline"
                    className="absolute inset-x-0 -bottom-px h-0.5 bg-primary"
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          )}

          <div>
            <TabsContent value="basic" className="mt-6">
              <motion.div initial="hidden" animate="show" variants={RISE_LIST}>
                  <Card className="overflow-hidden">
                    <SectionHead
                      sketch={MasksSketch}
                      title="Who you are"
                      aside={
                        isEducator
                          ? "(so I know who I'm setting up, and where.)"
                          : "(what a casting office reads before you open your mouth.)"
                      }
                    />
                    <CardContent className="space-y-6 pt-6">
                      <GroupRule>Needed to match you</GroupRule>
                      <Field className="max-w-sm">
                        <FieldLabel
                          htmlFor="name"
                          hint="Your stage name is fine. It shows on the callboard if you have that on, nowhere else."
                        >
                          Name
                        </FieldLabel>
                        <Input
                          id="name"
                          {...register("name")}
                        />
                        {errors.name && (
                          <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-sm text-destructive"
                          >
                            {errors.name.message}
                          </motion.p>
                        )}
                      </Field>

                      {!isEducator && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field>
                          <FieldLabel
                            htmlFor="age_range"
                            hint="Casting reads you by range, not birthday. This filters every search you run."
                          >
                            Age range
                          </FieldLabel>
                        <Select
                          value={watch("age_range") || undefined}
                          onValueChange={(v) => setValue("age_range", v)}
                        >
                          <SelectTrigger id="age_range">
                            <SelectValue placeholder="Select age range" />
                          </SelectTrigger>
                          <SelectContent>
                            {AGE_RANGES.map((r) => (
                              <SelectItem key={r} value={r}>{r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                          {errors.age_range && (
                            <motion.p
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="text-sm text-destructive"
                            >
                              {errors.age_range.message}
                            </motion.p>
                          )}
                        </Field>

                        <Field>
                          <FieldLabel
                            htmlFor="gender"
                            hint="Only used to match characters written for a gender. Pick Other and say your own if none of these fit."
                          >
                            Gender identity
                          </FieldLabel>
                        <Select
                          value={watch("gender")?.startsWith("Other") ? "Other" : watch("gender") || undefined}
                          onValueChange={(v) => setValue("gender", v)}
                        >
                          <SelectTrigger id="gender">
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                          <SelectContent>
                            {GENDERS.map((g) => (
                              <SelectItem key={g} value={g}>{g}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {(watch("gender") === "Other" || watch("gender")?.startsWith("Other:")) && (
                          <Input
                            placeholder="Please specify"
                            className="mt-2"
                            value={watch("gender")?.startsWith("Other:") ? watch("gender")?.slice(7).trim() : ""}
                            onChange={(e) => setValue("gender", e.target.value ? `Other: ${e.target.value}` : "Other")}
                          />
                        )}
                          {errors.gender && (
                            <motion.p
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="text-sm text-destructive"
                            >
                              {errors.gender.message}
                            </motion.p>
                          )}
                        </Field>
                      </div>
                      )}

                      {/* Location counts toward completion, so like union status
                          it belongs above the rule, not under "optional". */}
                      <Field>
                        <FieldLabel
                          htmlFor="location"
                          hint="Your market, not your address. It decides which theatres and auditions I put in front of you."
                        >
                          Location / market
                        </FieldLabel>
                        <Select
                          value={watch("location")?.startsWith("Other") ? "Other" : watch("location") || undefined}
                          onValueChange={(v) => setValue("location", v)}
                        >
                          <SelectTrigger id="location">
                            <SelectValue placeholder="Select location" />
                          </SelectTrigger>
                          <SelectContent>
                            {LOCATIONS.map((loc) => (
                              <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {(watch("location") === "Other" || watch("location")?.startsWith("Other:")) && (
                          <Input
                            placeholder="Please specify"
                            className="mt-2"
                            value={watch("location")?.startsWith("Other:") ? watch("location")?.slice(7).trim() : ""}
                            onChange={(e) => setValue("location", e.target.value ? `Other: ${e.target.value}` : "Other")}
                          />
                        )}
                        {errors.location && (
                          <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-sm text-destructive"
                          >
                            {errors.location.message}
                          </motion.p>
                        )}
                      </Field>

                      {isEducator && (
                        <Field>
                          <FieldLabel
                            htmlFor="organization"
                            hint="School, studio or company. It's how I keep your students grouped with you."
                          >
                            School or studio
                          </FieldLabel>
                          <Input
                            id="organization"
                            value={organization}
                            onChange={(e) => setOrganization(e.target.value)}
                            onBlur={saveOrganization}
                            maxLength={280}
                            className="max-w-sm"
                          />
                        </Field>
                      )}

                      {!isEducator && (
                      <>
                      <GroupRule>Optional, sharpens the picks</GroupRule>
                      <Field>
                        <FieldLabel
                          htmlFor="ethnicity"
                          hint="Only for roles written for a specific background. Never shown to anyone, and leaving it blank costs you nothing."
                        >
                          Ethnicity
                        </FieldLabel>
                        <Select
                          value={watch("ethnicity")?.startsWith("Other") ? "Other" : watch("ethnicity") || "__none__"}
                          onValueChange={(v) => setValue("ethnicity", v === "__none__" ? "" : v)}
                        >
                          <SelectTrigger id="ethnicity">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Select</SelectItem>
                            {ETHNICITY_OPTIONS.map((e) => (
                              <SelectItem key={e} value={e}>{e}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {(watch("ethnicity") === "Other" || watch("ethnicity")?.startsWith("Other:")) && (
                          <Input
                            placeholder="Please specify"
                            className="mt-2"
                            value={watch("ethnicity")?.startsWith("Other:") ? watch("ethnicity")?.slice(7).trim() : ""}
                            onChange={(e) => setValue("ethnicity", e.target.value ? `Other: ${e.target.value}` : "Other")}
                          />
                        )}
                      </Field>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field>
                          <FieldLabel
                            htmlFor="height-feet"
                            hint="Comes up for roles with a physical requirement. It never filters a monologue out."
                          >
                            Height
                          </FieldLabel>
                          <div className="flex gap-2">
                            <Select
                              value={heightParsed.feet === "__none__" ? "__none__" : heightParsed.feet}
                              onValueChange={(v) => {
                                if (v === "__none__") {
                                  setValue("height", "");
                                } else {
                                  const inVal = heightParsed.inches === "__none__" ? "0" : heightParsed.inches;
                                  setValue("height", `${v}'${inVal}"`);
                                }
                              }}
                            >
                              <SelectTrigger id="height-feet" className="flex-1 min-w-0">
                                <SelectValue placeholder="Ft" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">-</SelectItem>
                                {HEIGHT_FEET.map((ft) => (
                                  <SelectItem key={ft} value={String(ft)}>{ft}'</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={heightParsed.inches === "__none__" ? "__none__" : heightParsed.inches}
                              onValueChange={(v) => {
                                if (v === "__none__") {
                                  if (heightParsed.feet === "__none__") {
                                    setValue("height", "");
                                  } else {
                                    setValue("height", `${heightParsed.feet}'0"`);
                                  }
                                } else {
                                  const ftVal = heightParsed.feet === "__none__" ? "5" : heightParsed.feet;
                                  setValue("height", `${ftVal}'${v}"`);
                                }
                              }}
                            >
                              <SelectTrigger id="height-inches" className="flex-1 min-w-0">
                                <SelectValue placeholder="In" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">-</SelectItem>
                                {HEIGHT_INCHES.map((inVal) => (
                                  <SelectItem key={inVal} value={String(inVal)}>{inVal}"</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </Field>

                        <Field>
                          <FieldLabel
                            htmlFor="build"
                            hint="Same as height: it shapes role suggestions, not which speeches you can play."
                          >
                            Build
                          </FieldLabel>
                          <Select
                            value={watch("build")?.startsWith("Other") ? "Other" : watch("build") || "__none__"}
                            onValueChange={(v) => setValue("build", v === "__none__" ? "" : v)}
                          >
                            <SelectTrigger id="build">
                              <SelectValue placeholder="Select build" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Select build</SelectItem>
                              {BUILD_OPTIONS.map((b) => (
                                <SelectItem key={b} value={b}>{b}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {(watch("build") === "Other" || watch("build")?.startsWith("Other:")) && (
                            <Input
                              placeholder="Please specify"
                              className="mt-2"
                              value={watch("build")?.startsWith("Other:") ? watch("build")?.slice(7).trim() : ""}
                              onChange={(e) => setValue("build", e.target.value ? `Other: ${e.target.value}` : "Other")}
                            />
                          )}
                        </Field>
                      </div>
                      </>
                      )}

                    </CardContent>
                  </Card>
                </motion.div>
              </TabsContent>

            <TabsContent value="acting" className="mt-6">
              <motion.div initial="hidden" animate="show" variants={RISE_LIST}>
                  <Card className="overflow-hidden">
                    <SectionHead
                      sketch={StageDoorSketch}
                      title="How you work"
                      aside="(where you came up, and what you walk into.)"
                    />
                    <CardContent className="space-y-6 pt-6">
                      <GroupRule>Needed to match you</GroupRule>
                      <Field>
                        <FieldLabel
                          hint="Theater pulls from plays. Film & TV pulls from scripts. Pick both if you do both, and you get both."
                        >
                          What you act in
                        </FieldLabel>
                        <p className="text-xs text-muted-foreground">Pick every one that applies.</p>
                        <div id="actor-types" tabIndex={-1} className="flex flex-wrap gap-2 pt-1">
                          {ACTOR_TYPE_IDS.filter((id) => id !== "other").map((id) => {
                            const isSelected = actorTypes.includes(id);
                            return (
                              <motion.button
                                key={id}
                                type="button"
                                whileTap={{ scale: 0.96 }}
                                aria-pressed={isSelected}
                                onClick={() => {
                                  setActorTypes((prev) =>
                                    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                                  );
                                }}
                                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                                  isSelected
                                    ? "border-primary bg-primary/10 text-foreground"
                                    : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
                                }`}
                              >
                                {ACTOR_TYPE_LABELS[id] || id}
                              </motion.button>
                            );
                          })}
                        </div>
                      </Field>
                      <Field>
                        <FieldLabel
                          htmlFor="experience_level"
                          hint={
                            <>
                              <strong>Student</strong> — studying, or just starting.<br />
                              <strong>Emerging</strong> — some credits, building it.<br />
                              <strong>Professional</strong> — established, working.
                            </>
                          }
                        >
                          Experience level
                        </FieldLabel>
                        <Select
                          value={watch("experience_level") || undefined}
                          onValueChange={(v) => setValue("experience_level", v)}
                        >
                          <SelectTrigger id="experience_level">
                            <SelectValue placeholder="Select experience level" />
                          </SelectTrigger>
                          <SelectContent>
                            {EXPERIENCE_LEVELS.map((l) => (
                              <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errors.experience_level && (
                          <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-sm text-destructive"
                          >
                            {errors.experience_level.message}
                          </motion.p>
                        )}
                      </Field>

                      {/* Union status sat under "Optional" while counting toward
                          completion, so the form asked for it and then told you
                          it didn't matter. It counts; it goes above the rule. */}
                      <Field>
                        <FieldLabel
                          htmlFor="union_status"
                          hint={
                            <>
                              <strong>Non-union</strong> — not a member of anything.<br />
                              <strong>SAG-E</strong> — eligible to join SAG-AFTRA, not in yet.<br />
                              <strong>SAG</strong> — full SAG-AFTRA member.
                            </>
                          }
                        >
                          Union status
                        </FieldLabel>
                        <Select
                          value={watch("union_status")?.startsWith("Other") ? "Other" : watch("union_status") || undefined}
                          onValueChange={(v) => setValue("union_status", v)}
                        >
                          <SelectTrigger id="union_status">
                            <SelectValue placeholder="Select union status" />
                          </SelectTrigger>
                          <SelectContent>
                            {UNION_STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {(watch("union_status") === "Other" || watch("union_status")?.startsWith("Other:")) && (
                          <Input
                            placeholder="Please specify"
                            className="mt-2"
                            value={watch("union_status")?.startsWith("Other:") ? watch("union_status")?.slice(7).trim() : ""}
                            onChange={(e) => setValue("union_status", e.target.value ? `Other: ${e.target.value}` : "Other")}
                          />
                        )}
                        {errors.union_status && (
                          <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-sm text-destructive"
                          >
                            {errors.union_status.message}
                          </motion.p>
                        )}
                      </Field>

                      {/* Credits sit with the career questions, not on a page
                          of their own. Three of them and the payoff block below
                          stops guessing from dropdowns and reads the lane off
                          what you have actually been cast in. */}
                      <Field>
                        <FieldLabel hint="Three is enough to see a pattern. The full résumé, with company, director and a PDF, lives on the résumé page.">
                          What you&apos;ve been cast in
                        </FieldLabel>
                        <p className="text-xs text-muted-foreground">
                          Three and I can tell you what lane you read as.
                        </p>
                        <div className="pt-1">
                          <CreditsInline />
                        </div>
                      </Field>

                      <GroupRule>Optional, sharpens the picks</GroupRule>
                      <Field>
                        <FieldLabel
                          htmlFor="type"
                          hint="The lane you actually get cast in. Optional, but of everything here it moves the picks the most."
                        >
                          Character type
                        </FieldLabel>
                        <Select
                          value={typeof watch("type") === "string" && watch("type")?.startsWith("Other") ? "Other" : watch("type") || "__none__"}
                          onValueChange={(v) => setValue("type", v === "__none__" ? "" : v)}
                        >
                          <SelectTrigger id="type">
                            <SelectValue placeholder="Select character type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {CHARACTER_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {(watch("type") === "Other" || (typeof watch("type") === "string" && watch("type")?.startsWith("Other:"))) && (
                          <Input
                            placeholder="Please specify"
                            className="mt-2"
                            value={typeof watch("type") === "string" && watch("type")?.startsWith("Other:") ? (watch("type") as string)?.slice(7).trim() : ""}
                            onChange={(e) => setValue("type", e.target.value ? `Other: ${e.target.value}` : "Other")}
                          />
                        )}
                        {errors.type && (
                          <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-sm text-destructive"
                          >
                            {errors.type.message}
                          </motion.p>
                        )}
                      </Field>

                      <Field>
                        <FieldLabel
                          htmlFor="training_background"
                          hint="Meisner, Method, Chekhov, none of the above. It shapes how rehearsal notes are written for you, not what search returns."
                        >
                          Training background
                        </FieldLabel>
                        <Select
                          value={watch("training_background")?.startsWith("Other") ? "Other" : watch("training_background") || "__none__"}
                          onValueChange={(v) => setValue("training_background", v === "__none__" ? "" : v)}
                        >
                          <SelectTrigger id="training_background">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Select</SelectItem>
                            {TRAINING_BACKGROUND_OPTIONS.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {(watch("training_background") === "Other" || watch("training_background")?.startsWith("Other:")) && (
                          <Input
                            placeholder="Please specify"
                            className="mt-2"
                            value={watch("training_background")?.startsWith("Other:") ? watch("training_background")?.slice(7).trim() : ""}
                            onChange={(e) => setValue("training_background", e.target.value ? `Other: ${e.target.value}` : "Other")}
                          />
                        )}
                      </Field>
                    </CardContent>
                  </Card>
                </motion.div>
              </TabsContent>

            <TabsContent value="preferences" className="mt-6">
              <motion.div initial="hidden" animate="show" variants={RISE_LIST}>
                  <Card className="overflow-hidden">
                    <SectionHead
                      sketch={SpotlightSketch}
                      title="What you see"
                      aside="(how hard the search leans on all of the above.)"
                    />
                    <CardContent className="space-y-6 pt-6">
                      <Field>
                        <div className="flex items-start justify-between gap-6 rounded-lg border border-border/60 bg-muted/40 p-4">
                          <div className="min-w-0">
                            <Label htmlFor="profile_bias" className="text-sm font-medium">
                              Use my profile when I search
                            </Label>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Results get weighted toward your range, type and market.
                              Turn it off and you search the whole library flat.
                            </p>
                          </div>
                          <Switch
                            id="profile_bias"
                            checked={profileBiasEnabled}
                            onCheckedChange={(checked) => setValue("profile_bias_enabled", checked)}
                          />
                        </div>
                      </Field>

                      <Field>
                        <FieldLabel hint="Not a filter. These float to the top; nothing gets hidden because it isn't on the list.">
                          Genres you gravitate to
                        </FieldLabel>
                        {/* Chips, like the actor types above — the form asked the
                            same kind of question two different ways. */}
                        <div className="flex flex-wrap gap-2 pt-1">
                          {PREFERRED_GENRES.map((genre) => {
                            const on = preferredGenres?.includes(genre);
                            return (
                              <motion.button
                                key={genre}
                                type="button"
                                whileTap={{ scale: 0.96 }}
                                aria-pressed={on}
                                onClick={() => toggleGenre(genre)}
                                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                                  on
                                    ? "border-primary bg-primary/10 text-foreground"
                                    : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
                                }`}
                              >
                                {genre}
                              </motion.button>
                            );
                          })}
                        </div>
                      </Field>

                      <Separator />

                      <Field>
                        <FieldLabel
                          htmlFor="sensitivity"
                          hint="Every piece carries a score for how often it gets used in auditions. This decides at what point I warn you."
                        >
                          Warn me about overdone pieces
                        </FieldLabel>
                        <p className="text-sm text-muted-foreground">
                          {overdoneCopy}
                        </p>
                        {/* The default range control paints a bright white track,
                            which on this page is the lightest thing on screen and
                            pulls the eye off the copy above it. */}
                        <input
                          id="sensitivity"
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          aria-valuetext={overdoneCopy}
                          {...register("overdone_alert_sensitivity", { valueAsNumber: true })}
                          className="w-full cursor-pointer appearance-none bg-transparent focus:outline-none [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[var(--primary)] [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-border [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-border [&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--primary)]"
                        />
                        <div className="flex justify-between text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70">
                          <span>only the warhorses</span>
                          <span>anything familiar</span>
                        </div>
                      </Field>
                    </CardContent>
                  </Card>
                </motion.div>
              </TabsContent>
          </div>
        </Tabs>
        </div>

        <ProfilePayoff
          signature={payoffSignature}
          ready={payoffReady}
          because={payoffBecause}
        />
      </div>
      {/* Photo Viewer Modal */}
      {showPhotoViewer && headshotPreview && (
        <div 
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setShowPhotoViewer(false)}
        >
          <div 
            className="relative max-w-4xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setShowPhotoViewer(false)}
              className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-white rounded-sm"
              aria-label="Close viewer"
            >
              <IconX className="h-8 w-8" />
            </button>

            {/* Photo Display */}
            <div className="relative w-full bg-black rounded-lg overflow-hidden flex items-center justify-center" style={{ minHeight: '60vh' }}>
              <img
                src={headshotPreview}
                alt="Headshot"
                className="max-w-full max-h-[70vh] object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const placeholder = e.currentTarget.nextElementSibling as HTMLElement;
                  if (placeholder) placeholder.style.display = 'flex';
                }}
              />
              <div className="absolute inset-0 hidden items-center justify-center bg-muted">
                <IconPhoto className="h-24 w-24 text-muted-foreground" />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex items-center justify-center gap-4">
              <Button
                onClick={handleEditPhoto}
                className="flex items-center gap-2"
                size="lg"
              >
                <IconEdit className="h-5 w-5" />
                Edit Photo
              </Button>
              <Button
                onClick={handleReplacePhoto}
                variant="outline"
                className="flex items-center gap-2"
                size="lg"
              >
                <IconUpload className="h-5 w-5" />
                Replace Photo
              </Button>
              <Input 
                id="headshot-replace-modal" 
                type="file"
                accept="image/*"
                onChange={(e) => {
                  handleHeadshotChange(e);
                  setShowPhotoViewer(false);
                }}
                className="hidden"
              />
              <Button
                onClick={handleDeletePhoto}
                variant="destructive"
                className="flex items-center gap-2"
                size="lg"
                disabled={isLoading}
              >
                {isLoading ? (
                  <IconLoader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <IconTrash className="h-5 w-5" />
                )}
                Delete Photo
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Editor */}
      {showEditor && imageToEdit && (
        <PhotoEditor
          image={imageToEdit}
          onSave={handleSaveEditedPhoto}
          onCancel={handleCancelEdit}
          aspectRatio={2 / 3}
        />
      )}
    </TooltipProvider>
  );
}
