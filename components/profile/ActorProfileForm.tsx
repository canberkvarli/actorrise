"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
import { motion } from "framer-motion";
import { toast } from "sonner";

const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  age_range: z.string().min(1, "Age range is required"),
  gender: z.string().min(1, "Gender is required"),
  ethnicity: z.string().optional(),
  height: z.string().optional(),
  build: z.string().optional(),
  location: z.string().min(1, "Location is required"),
  experience_level: z.string().min(1, "Experience level is required"),
  type: z.string().min(1, "Type is required"),
  training_background: z.string().optional(),
  union_status: z.string().min(1, "Union status is required"),
  preferred_genres: z.array(z.string()),
  overdone_alert_sensitivity: z.number().min(0).max(1),
  profile_bias_enabled: z.boolean(),
  headshot_url: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

const genres = ["Drama", "Comedy", "Classical", "Contemporary", "Musical", "Shakespeare"];

export function ActorProfileForm() {
  const [isFetching, setIsFetching] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saving" | "saved" | null>(null);
  const [headshotPreview, setHeadshotPreview] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [imageToEdit, setImageToEdit] = useState<string | null>(null);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  const [hasInitialized, setHasInitialized] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
  
  // Track previous values to only save when something actually changes
  type PreviousValues = {
    name: string;
    ageRange: string;
    gender: string;
    ethnicity: string | undefined;
    height: string | undefined;
    build: string | undefined;
    location: string;
    experienceLevel: string;
    type: string;
    trainingBackground: string | undefined;
    unionStatus: string;
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
    trainingBackground: undefined,
    unionStatus: "",
    preferredGenres: [],
    overdoneSensitivity: 0.5,
    profileBias: true,
    headshotUrl: undefined,
  });

  // Calculate profile completion percentage - matches backend calculation
  const completionPercentage = useMemo(() => {
    const requiredFields = [
      name,
      ageRange,
      gender,
      location,
      experienceLevel,
      type,
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
    ethnicity,
    height,
    build,
    trainingBackground,
    headshotUrl,
  ]);

  const fetchProfile = useCallback(async () => {
    try {
      setIsFetching(true);
      console.log("Fetching profile...");
      type ProfileResponse = {
        name?: string | null;
        age_range?: string | null;
        gender?: string | null;
        ethnicity?: string | null;
        height?: string | null;
        build?: string | null;
        location?: string | null;
        experience_level?: string | null;
        type?: string | null;
        training_background?: string | null;
        union_status?: string | null;
        preferred_genres?: string[] | null;
        overdone_alert_sensitivity?: number | null;
        profile_bias_enabled?: boolean | null;
        headshot_url?: string | null;
      };
      const response = await api.get<ProfileResponse>("/api/profile");
      const profile = response.data;
      
      // Reset form with all profile data - this properly updates all registered inputs
      const formData = {
        name: profile.name || "",
        age_range: profile.age_range || "",
        gender: profile.gender || "",
        ethnicity: profile.ethnicity || "",
        height: profile.height || "",
        build: profile.build || "",
        location: profile.location || "",
        experience_level: profile.experience_level || "",
        type: profile.type || "",
        training_background: profile.training_background || "",
        union_status: profile.union_status || "",
        preferred_genres: Array.isArray(profile.preferred_genres) ? profile.preferred_genres : [],
        overdone_alert_sensitivity: profile.overdone_alert_sensitivity ?? 0.5,
        profile_bias_enabled: profile.profile_bias_enabled ?? true,
        headshot_url: profile.headshot_url || "",
      };
      console.log("Resetting form with data:", formData);
      reset(formData, {
        keepDefaultValues: false,
        keepDirty: false,
        keepErrors: false,
      });
      
      if (profile.headshot_url) {
        // Clean the URL - remove trailing query params, fragments, and whitespace
        const cleanUrl = profile.headshot_url.trim().split('?')[0].split('#')[0];
        console.log("Setting headshot preview to:", cleanUrl);
        setHeadshotPreview(cleanUrl);
      } else {
        console.log("No headshot_url in profile");
        setHeadshotPreview(null);
      }
      
      // Initialize previous values to prevent auto-save on load
      prevValuesRef.current = {
        name: profile.name || "",
        ageRange: profile.age_range || "",
        gender: profile.gender || "",
        ethnicity: profile.ethnicity || "",
        height: profile.height || "",
        build: profile.build || "",
        location: profile.location || "",
        experienceLevel: profile.experience_level || "",
        type: profile.type || "",
        trainingBackground: profile.training_background || "",
        unionStatus: profile.union_status || "",
        preferredGenres: Array.isArray(profile.preferred_genres) ? profile.preferred_genres : [],
        overdoneSensitivity: profile.overdone_alert_sensitivity ?? 0.5,
        profileBias: profile.profile_bias_enabled ?? true,
        headshotUrl: profile.headshot_url || "",
      };
      
      console.log("Profile loaded successfully");
    } catch (err: unknown) {
      const error = err as { response?: { status?: number } };
      if (error.response?.status !== 404) {
        console.error("Failed to load profile:", err);
        toast.error("Failed to load profile");
      } else {
        console.log("No profile found (404), starting with empty form");
        // Initialize with empty values
        prevValuesRef.current = {
          name: "",
          ageRange: "",
          gender: "",
          ethnicity: "",
          height: "",
          build: "",
          location: "",
          experienceLevel: "",
          type: "",
          trainingBackground: "",
          unionStatus: "",
          preferredGenres: [],
          overdoneSensitivity: 0.5,
          profileBias: true,
          headshotUrl: "",
        };
      }
    } finally {
      setIsFetching(false);
      // Mark as initialized after fetching - give time for form to update
      setTimeout(() => {
        setHasInitialized(true);
      }, 300);
    }
  }, [reset]);

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount


  // Auto-save functionality with debouncing - only trigger when values actually change
  useEffect(() => {
    // Don't auto-save until profile is fetched and form is initialized
    if (!hasInitialized || isFetching) {
      return;
    }

    // Get current values
    const currentValues = {
      name,
      ageRange,
      gender,
      ethnicity,
      height,
      build,
      location,
      experienceLevel,
      type,
      trainingBackground,
      unionStatus,
      preferredGenres: preferredGenresValue,
      overdoneSensitivity,
      profileBias,
      headshotUrl,
    };

    // Check if anything actually changed
    const prevValues = prevValuesRef.current;
    const hasChanged = Object.keys(currentValues).some(
      (key) => {
        const typedKey = key as keyof typeof currentValues;
        return JSON.stringify(prevValues[typedKey as keyof PreviousValues]) !== JSON.stringify(currentValues[typedKey]);
      }
    );

    if (!hasChanged) {
      return; // No changes, don't save
    }

    // Update previous values
    prevValuesRef.current = currentValues;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for auto-save (2 seconds after last change)
    saveTimeoutRef.current = setTimeout(async () => {
      const data = getValues();
      console.log("Auto-save triggered, form data:", data);

      // Build save data - only include fields that have values (not empty strings)
      // Convert empty strings to null for optional fields to avoid validation errors
      type SaveData = Partial<{
        name: string;
        age_range: string;
        gender: string;
        ethnicity: string | null;
        height: string | null;
        build: string | null;
        location: string;
        experience_level: string;
        type: string;
        training_background: string | null;
        union_status: string;
        preferred_genres: string[];
        overdone_alert_sensitivity: number;
        profile_bias_enabled: boolean;
        headshot_url: string | null;
      }>;
      const saveData: SaveData = {};
      if (data.name && data.name.trim()) saveData.name = data.name.trim();
      if (data.age_range && data.age_range.trim()) saveData.age_range = data.age_range.trim();
      if (data.gender && data.gender.trim()) saveData.gender = data.gender.trim();
      if (data.ethnicity && data.ethnicity.trim()) saveData.ethnicity = data.ethnicity.trim();
      else if (data.ethnicity === "") saveData.ethnicity = null;
      if (data.height && data.height.trim()) saveData.height = data.height.trim();
      else if (data.height === "") saveData.height = null;
      if (data.build && data.build.trim()) saveData.build = data.build.trim();
      else if (data.build === "") saveData.build = null;
      if (data.location && data.location.trim()) saveData.location = data.location.trim();
      if (data.experience_level && data.experience_level.trim()) saveData.experience_level = data.experience_level.trim();
      if (data.type && data.type.trim()) saveData.type = data.type.trim();
      if (data.training_background && data.training_background.trim()) saveData.training_background = data.training_background.trim();
      else if (data.training_background === "") saveData.training_background = null;
      if (data.union_status && data.union_status.trim()) saveData.union_status = data.union_status.trim();
      if (data.preferred_genres && Array.isArray(data.preferred_genres)) saveData.preferred_genres = data.preferred_genres;
      if (data.overdone_alert_sensitivity !== undefined && data.overdone_alert_sensitivity !== null) {
        saveData.overdone_alert_sensitivity = Number(data.overdone_alert_sensitivity);
      }
      if (data.profile_bias_enabled !== undefined && data.profile_bias_enabled !== null) {
        saveData.profile_bias_enabled = Boolean(data.profile_bias_enabled);
      }
      if (data.headshot_url && data.headshot_url.trim()) saveData.headshot_url = data.headshot_url.trim();
      else if (data.headshot_url === "") saveData.headshot_url = null;

      // Check if we have any data to save
      if (Object.keys(saveData).length === 0) {
        console.log("No data to save, skipping...");
        return;
      }

      try {
        setSaveStatus("saving");
        
        // If headshot_url is a base64 image, upload it first
        let finalHeadshotUrl = saveData.headshot_url;
        if (finalHeadshotUrl && finalHeadshotUrl.startsWith("data:image")) {
          type HeadshotResponse = {
            headshot_url: string;
          };
          const uploadResponse = await api.post<HeadshotResponse>("/api/profile/headshot", {
            image: finalHeadshotUrl,
          });
          finalHeadshotUrl = uploadResponse.data.headshot_url;
          saveData.headshot_url = finalHeadshotUrl;
        }

        await api.post("/api/profile", saveData);
        setSaveStatus("saved");
        
        // Clear saved status after 3 seconds
        if (saveStatusTimeoutRef.current) {
          clearTimeout(saveStatusTimeoutRef.current);
        }
        saveStatusTimeoutRef.current = setTimeout(() => {
          setSaveStatus(null);
        }, 3000);
        } catch (err: unknown) {
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
          console.error("Error details:", errorMessage);
          toast.error(errorMessage);
          setSaveStatus(null);
      }
    }, 2000); // 2 second debounce

    // Cleanup function
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (saveStatusTimeoutRef.current) {
        clearTimeout(saveStatusTimeoutRef.current);
      }
    };
  }, [
    name, ageRange, gender, ethnicity, height, build, location,
    experienceLevel, type, trainingBackground, unionStatus,
    preferredGenresValue, overdoneSensitivity, profileBias, headshotUrl,
    hasInitialized, isFetching, getValues
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
                <span className="font-mono text-muted-foreground">Saving...</span>
              </>
            ) : saveStatus === "saved" ? (
              <>
                <IconSparkles className="h-4 w-4 text-green-600" />
                <span className="font-mono text-green-600 font-semibold">Saved</span>
              </>
            ) : null}
          </motion.div>
        )}

        {/* Progress Bar */}
        <motion.div
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
                  Changes are automatically saved
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Headshot Section - Compact */}
        <motion.div
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
                      ? "Your professional headshot will appear on your profile and in search results. Click the image to view, edit, or replace it." 
                      : "Upload a high-quality professional headshot. Recommended: JPG, PNG, or WEBP format, maximum 5MB. Standard resume size (2:3 aspect ratio)."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Tabs for organized sections */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic" className="flex items-center gap-2 font-mono">
              <IconUser className="h-4 w-4" />
              Basic Info
            </TabsTrigger>
            <TabsTrigger value="acting" className="flex items-center gap-2 font-mono">
              <IconBriefcase className="h-4 w-4" />
              Acting Info
            </TabsTrigger>
            <TabsTrigger value="preferences" className="flex items-center gap-2 font-mono">
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
                      <CardDescription>Tell us about yourself</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="space-y-2">
                        <Label htmlFor="name" className="font-mono">Name *</Label>
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

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="age_range" className="font-mono">Age Range *</Label>
                          <Select 
                            id="age_range" 
                            value={watch("age_range") || ""}
                            onChange={(e) => setValue("age_range", e.target.value)}
                          >
                            <option value="">Select age range</option>
                            <option value="18-25">18-25</option>
                            <option value="25-35">25-35</option>
                            <option value="35-45">35-45</option>
                            <option value="45-55">45-55</option>
                            <option value="55+">55+</option>
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
                          <Label htmlFor="gender" className="font-mono">Gender Identity *</Label>
                          <Select 
                            id="gender" 
                            value={watch("gender") || ""}
                            onChange={(e) => setValue("gender", e.target.value)}
                          >
                            <option value="">Select gender</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Non-binary">Non-binary</option>
                            <option value="Other">Other</option>
                          </Select>
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

                      <div className="space-y-2">
                        <Label htmlFor="ethnicity" className="font-mono">Ethnicity (optional)</Label>
                        <Input 
                          id="ethnicity" 
                          {...register("ethnicity")}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="height" className="font-mono">Height (optional)</Label>
                          <Input 
                            id="height" 
                            placeholder="5'10&quot;" 
                            {...register("height")}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="build" className="font-mono">Build (optional)</Label>
                          <Input 
                            id="build" 
                            placeholder="Athletic" 
                            {...register("build")}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="location" className="font-mono">Location/Market *</Label>
                        <Select 
                          id="location" 
                          value={watch("location") || ""}
                          onChange={(e) => setValue("location", e.target.value)}
                        >
                          <option value="">Select location</option>
                          <option value="NYC">NYC</option>
                          <option value="LA">LA</option>
                          <option value="Chicago">Chicago</option>
                          <option value="Regional">Regional</option>
                          <option value="Other">Other</option>
                        </Select>
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
                      <CardDescription>Your acting experience and training</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="experience_level" className="font-mono">Experience Level *</Label>
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
                          id="experience_level" 
                          value={watch("experience_level") || ""}
                          onChange={(e) => setValue("experience_level", e.target.value)}
                        >
                          <option value="">Select experience level</option>
                          <option value="Student">Student</option>
                          <option value="Emerging">Emerging</option>
                          <option value="Professional">Professional</option>
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
                        <Label htmlFor="type" className="font-mono">Type *</Label>
                        <Select 
                          id="type" 
                          value={watch("type") || ""}
                          onChange={(e) => setValue("type", e.target.value)}
                        >
                          <option value="">Select type</option>
                          <option value="Leading Man/Woman">Leading Man/Woman</option>
                          <option value="Character Actor">Character Actor</option>
                          <option value="Ingénue">Ingénue</option>
                          <option value="Comic">Comic</option>
                          <option value="Other">Other</option>
                        </Select>
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

                      <div className="space-y-2">
                        <Label htmlFor="training_background" className="font-mono">Training Background (optional)</Label>
                        <Input 
                          id="training_background" 
                          placeholder="BFA, MFA, Conservatory, etc." 
                          {...register("training_background")}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="union_status" className="font-mono">Union Status *</Label>
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
                          id="union_status" 
                          value={watch("union_status") || ""}
                          onChange={(e) => setValue("union_status", e.target.value)}
                        >
                          <option value="">Select union status</option>
                          <option value="Non-union">Non-union</option>
                          <option value="SAG-E">SAG-E</option>
                          <option value="SAG">SAG</option>
                        </Select>
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
                      <CardDescription>Customize your monologue search experience</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/50">
                        <div className="space-y-0.5">
                          <Label htmlFor="profile_bias" className="text-base font-semibold font-mono">
                            AI-Powered Recommendations
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            Enable semantic search with personalized recommendations
                          </p>
                        </div>
                        <Switch
                          id="profile_bias"
                          checked={profileBiasEnabled}
                          onChange={(e) => setValue("profile_bias_enabled", e.target.checked)}
                        />
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <Label className="font-mono">Preferred Genres</Label>
                        <div className="grid grid-cols-3 gap-2">
                          {genres.map((genre) => (
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
                          <Label htmlFor="sensitivity" className="font-mono">
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
                                Controls how sensitive the system is to flagging &quot;overdone&quot; monologues—pieces that are frequently used in auditions.<br/><br/>
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
      {/* Photo Viewer Modal */}
      {showPhotoViewer && headshotPreview && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
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
