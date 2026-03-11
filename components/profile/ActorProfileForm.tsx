"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import api from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { IconLoader2, IconInfoCircle, IconPhoto, IconEdit, IconX, IconUser, IconBriefcase, IconSettings, IconSparkles, IconTrash, IconUpload } from "@tabler/icons-react";
import { PhotoEditor } from "./PhotoEditor";
import { useProfileFormData, type FullProfileResponse } from "@/hooks/useDashboardData";
import { motion } from "framer-motion";
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

export function ActorProfileForm() {
  const queryClient = useQueryClient();
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
    const optionalFields = [
      ethnicity,
      height,
      build,
      trainingBackground,
      headshotUrl,
    ];

    const requiredCount = requiredFields.filter(Boolean).length;
    const optionalCount = optionalFields.filter(Boolean).length;

    // Required fields are 70% of completion, optional are 30% - matches backend
    const percentage = (requiredCount / 7) * 70 + (optionalCount / 5) * 30;
    return Math.min(100, Math.round(percentage * 10) / 10); // Round to 1 decimal like backend
  }, [
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
    headshotUrl,
  ]);

  // Next-step nudge: which required fields are missing (for progress card when <100%)
  const requiredChecklist = useMemo(() => {
    const hasType = type || actorTypes.length > 0;
    const items: { key: string; label: string; filled: boolean }[] = [
      { key: "name", label: "Name", filled: Boolean(name?.trim()) },
      { key: "age_range", label: "Age range", filled: Boolean(ageRange) },
      { key: "gender", label: "Gender", filled: Boolean(gender) },
      { key: "location", label: "Location", filled: Boolean(location) },
      { key: "experience_level", label: "Experience level", filled: Boolean(experienceLevel) },
      { key: "type", label: "Actor type(s)", filled: Boolean(hasType) },
      { key: "union_status", label: "Union status", filled: Boolean(unionStatus) },
    ];
    const missing = items.filter((i) => !i.filled);
    return { items, missing, count: missing.length };
  }, [name, ageRange, gender, location, experienceLevel, type, actorTypes, unionStatus]);

  const heightParsed = useMemo(() => parseHeight(height), [height]);

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
    const optFields = [saveData.ethnicity, saveData.height, saveData.build, saveData.training_background, saveData.headshot_url];
    const reqCount = reqFields.filter(filled).length;
    const optCount = optFields.filter(filled).length;
    const pct = Math.min(100, Math.round(((reqCount / 7) * 70 + (optCount / 5) * 30) * 10) / 10);
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

  if (isFetching) {
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
        {/* Auto-save Status Indicator - Bottom Right */}
        {saveStatus && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="fixed bottom-6 right-6 z-[9999] flex items-center gap-2 text-sm bg-background border-2 border-border rounded-lg shadow-xl py-3 px-4 backdrop-blur-sm"
            style={{ 
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
              minWidth: '120px'
            }}
          >
            {saveStatus === "saving" ? (
              <>
                <IconLoader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-muted-foreground">Saving...</span>
              </>
            ) : saveStatus === "saved" ? (
              <>
                <IconSparkles className="h-4 w-4 text-green-600" />
                <span className="text-green-600 font-semibold">Saved</span>
              </>
            ) : null}
          </motion.div>
        )}

        {/* Progress Bar - Only show if profile is not 100% complete */}
        {completionPercentage < 100 && (
          <motion.div
            id="profile-progress"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Profile Completion</Label>
                    <span className="text-sm font-medium text-muted-foreground">
                      {completionPercentage.toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={completionPercentage} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    We save as you go. No button to click.
                  </p>
                  {requiredChecklist.count > 0 && (
                    <>
                      <p className="text-xs text-muted-foreground font-medium">
                        {requiredChecklist.count} to go
                      </p>
                      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1" aria-label="Required fields">
                        {requiredChecklist.items.map((item) => (
                          <li key={item.key} className="flex items-center gap-1.5">
                            <span className={item.filled ? "text-primary" : "text-muted-foreground"} aria-hidden>
                              {item.filled ? "✓" : "○"}
                            </span>
                            <span className={item.filled ? "line-through decoration-muted-foreground" : ""}>{item.label}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Headshot Section - Compact */}
        <motion.div
          id="profile-headshot"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-5">
                <div className="flex-shrink-0">
                  {headshotPreview ? (
                    <button
                      type="button"
                      onClick={handlePhotoClick}
                      className="relative w-32 h-48 rounded-md overflow-hidden border-2 border-border bg-muted shadow-sm hover:shadow-md hover:border-primary/60 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 group"
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
                      className="flex flex-col items-center justify-center w-32 h-48 rounded-md border-2 border-dashed border-border bg-muted/30 hover:bg-muted/50 hover:border-primary/50 transition-all duration-200 cursor-pointer group"
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
                <div className="flex-1 min-w-0 pt-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Label className="text-base font-semibold">Headshot</Label>
                    {headshotPreview && (
                      <span className="text-xs text-muted-foreground">• Click to view or edit</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {headshotPreview 
                      ? "Shown on profile and in search. Click to view or replace." 
                      : "Upload a headshot. JPG/PNG, max 5MB. +6% completion."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Tabs for organized sections */}
        <div id="profile-tabs">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic" className="flex items-center gap-2">
              <IconUser className="h-4 w-4" />
              Basic Info
            </TabsTrigger>
            <TabsTrigger value="acting" className="flex items-center gap-2">
              <IconBriefcase className="h-4 w-4" />
              Acting Info
            </TabsTrigger>
            <TabsTrigger value="preferences" id="profile-preferences" className="flex items-center gap-2">
              <IconSettings className="h-4 w-4" />
              Preferences
            </TabsTrigger>
          </TabsList>

          <div className="min-h-[600px]">
            <TabsContent value="basic" className="mt-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                  <Card>
                    <CardHeader>
                      <CardTitle>Basic Information</CardTitle>
                      <CardDescription>Used for matching you to roles.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Required for matching</p>
                      <div className="space-y-2 max-w-xs">
                        <Label htmlFor="name" className="">Name *</Label>
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
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="age_range" className="">Age Range *</Label>
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
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="gender" className="">Gender Identity *</Label>
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
                        </div>
                      </div>

                      <Separator className="my-6" />
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Optional: improves recommendations</p>
                      <div className="space-y-2">
                        <Label htmlFor="ethnicity" className="">Ethnicity</Label>
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
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="">Height</Label>
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
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="build" className="">Build</Label>
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
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="location" className="">Location / market</Label>
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
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </TabsContent>

            <TabsContent value="acting" className="mt-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                  <Card>
                    <CardHeader>
                      <CardTitle>Acting Background</CardTitle>
                      <CardDescription>Used to tailor recommendations.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Required for matching</p>
                      <div className="space-y-2">
                        <Label className="">Actor types</Label>
                        <p className="text-xs text-muted-foreground mb-2">Select all that apply (e.g. Theater, Film & TV)</p>
                        <div className="flex flex-wrap gap-2">
                          {ACTOR_TYPE_IDS.filter((id) => id !== "other").map((id) => {
                            const isSelected = actorTypes.includes(id);
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => {
                                  setActorTypes((prev) =>
                                    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                                  );
                                }}
                                className={`px-3 py-2 rounded-lg border text-sm transition ${
                                  isSelected ? "border-accent bg-accent/10" : "border-border hover:border-accent/50 bg-card"
                                }`}
                              >
                                {ACTOR_TYPE_LABELS[id] || id}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="experience_level" className="">Experience Level *</Label>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button 
                                type="button" 
                                className="inline-flex items-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-sm"
                                aria-label="Experience level information"
                              >
                                <IconInfoCircle className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-sm">
                                <strong>Student:</strong> Currently studying acting or just starting out<br/>
                                <strong>Emerging:</strong> Some experience, building your career<br/>
                                <strong>Professional:</strong> Established actor with significant experience
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
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
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="type" className="text-muted-foreground">Character Type</Label>
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
                      </div>

                      <Separator className="my-6" />
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Optional: improves recommendations</p>
                      <div className="space-y-2">
                        <Label htmlFor="training_background" className="">Training background</Label>
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
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="union_status" className="">Union Status *</Label>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button 
                                type="button" 
                                className="inline-flex items-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-sm"
                                aria-label="Union status information"
                              >
                                <IconInfoCircle className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-sm">
                                <strong>Non-union:</strong> Not a member of any acting union<br/>
                                <strong>SAG-E:</strong> SAG Eligible - Can join SAG-AFTRA but not yet a member<br/>
                                <strong>SAG:</strong> Full member of SAG-AFTRA (Screen Actors Guild)
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
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
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </TabsContent>

            <TabsContent value="preferences" className="mt-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <IconSparkles className="h-5 w-5" />
                        Search Preferences
                      </CardTitle>
                      <CardDescription>Customize search.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/50">
                        <div className="space-y-0.5">
                          <Label htmlFor="profile_bias" className="text-base font-semibold">
                            AI-Powered Recommendations
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            Enable semantic search with personalized recommendations
                          </p>
                        </div>
                        <Switch
                          id="profile_bias"
                          checked={profileBiasEnabled}
                          onCheckedChange={(checked) => setValue("profile_bias_enabled", checked)}
                        />
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <Label className="">Preferred genres</Label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {PREFERRED_GENRES.map((genre) => (
                            <motion.label
                              key={genre}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              className="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-muted transition-colors"
                            >
                              <Checkbox
                                checked={preferredGenres?.includes(genre)}
                                onChange={() => toggleGenre(genre)}
                              />
                              <span className="text-sm">{genre}</span>
                            </motion.label>
                          ))}
                        </div>
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="sensitivity" className="">
                            Overdone Alert Sensitivity: {watch("overdone_alert_sensitivity")}
                          </Label>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button 
                                type="button" 
                                className="inline-flex items-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-sm"
                                aria-label="Overdone alert sensitivity information"
                              >
                                <IconInfoCircle className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-sm">
                                Controls how sensitive the system is to flagging &quot;overdone&quot; monologues (pieces that are frequently used in auditions).<br/><br/>
                                <strong>Low (0.0-0.3):</strong> Only flags extremely overdone monologues<br/>
                                <strong>Medium (0.4-0.6):</strong> Flags moderately overdone pieces<br/>
                                <strong>High (0.7-1.0):</strong> Flags any monologue that might be overdone, helping you stand out with unique choices
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          {...register("overdone_alert_sensitivity", { valueAsNumber: true })}
                          className="w-full"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </TabsContent>
          </div>
        </Tabs>
        </div>
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
