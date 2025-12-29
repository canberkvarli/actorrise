"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Image from "next/image";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { IconLoader2, IconCheck, IconInfoCircle, IconPhoto, IconEdit, IconUser, IconBriefcase, IconSettings, IconSparkles } from "@tabler/icons-react";
import { PhotoEditor } from "./PhotoEditor";
import { motion, AnimatePresence } from "framer-motion";

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
  comfort_with_difficult_material: z.string(),
  overdone_alert_sensitivity: z.number().min(0).max(1),
  profile_bias_enabled: z.boolean(),
  headshot_url: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

const genres = ["Drama", "Comedy", "Classical", "Contemporary", "Musical", "Shakespeare"];

export function ActorProfileForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [headshotPreview, setHeadshotPreview] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [imageToEdit, setImageToEdit] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("basic");

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      preferred_genres: [],
      comfort_with_difficult_material: "moderate",
      overdone_alert_sensitivity: 0.5,
      profile_bias_enabled: true,
    },
  });

  const profileBiasEnabled = watch("profile_bias_enabled");
  const preferredGenres = watch("preferred_genres");
  const formValues = watch();

  // Calculate profile completion percentage
  const completionPercentage = useMemo(() => {
    const requiredFields = [
      formValues.name,
      formValues.age_range,
      formValues.gender,
      formValues.location,
      formValues.experience_level,
      formValues.type,
      formValues.union_status,
    ];
    const optionalFields = [
      formValues.ethnicity,
      formValues.height,
      formValues.build,
      formValues.training_background,
      formValues.headshot_url,
    ];
    
    const requiredCount = requiredFields.filter(Boolean).length;
    const optionalCount = optionalFields.filter(Boolean).length;
    
    // Required fields are 70% of completion, optional are 30%
    return Math.min(100, Math.round((requiredCount / 7) * 70 + (optionalCount / 5) * 30));
  }, [formValues]);

  const fetchProfile = useCallback(async () => {
    try {
      const response = await api.get("/api/profile");
      const profile = response.data;
      Object.keys(profile).forEach((key) => {
        setValue(key as keyof ProfileFormData, profile[key]);
      });
      if (profile.headshot_url) {
        setHeadshotPreview(profile.headshot_url);
      }
    } catch (err: unknown) {
      const error = err as { response?: { status?: number } };
      if (error.response?.status !== 404) {
        setError("Failed to load profile");
      }
    } finally {
      setIsFetching(false);
    }
  }, [setValue]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleHeadshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError("Please upload an image file");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError("Image size must be less than 5MB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setImageToEdit(base64String);
        setShowEditor(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEditPhoto = () => {
    if (headshotPreview) {
      setImageToEdit(headshotPreview);
      setShowEditor(true);
    }
  };

  const handleSaveEditedPhoto = async (croppedImage: string) => {
    // If it's a base64 image (data URL), upload it to Supabase
    if (croppedImage.startsWith("data:image")) {
      try {
        setIsLoading(true);
        const response = await api.post("/api/profile/headshot", {
          image: croppedImage,
        });
        const uploadedUrl = response.data.headshot_url;
        setHeadshotPreview(uploadedUrl);
        setValue("headshot_url", uploadedUrl);
      } catch (err: unknown) {
        const error = err as { response?: { data?: { detail?: string } } };
        setError(error.response?.data?.detail || "Failed to upload headshot");
        // Still show the image locally even if upload fails
        setHeadshotPreview(croppedImage);
        setValue("headshot_url", croppedImage);
      } finally {
        setIsLoading(false);
      }
    } else {
      // Already a URL, just use it
      setHeadshotPreview(croppedImage);
      setValue("headshot_url", croppedImage);
    }
    setShowEditor(false);
    setImageToEdit(null);
  };

  const handleCancelEdit = () => {
    setShowEditor(false);
    setImageToEdit(null);
  };

  const onSubmit = async (data: ProfileFormData) => {
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // If headshot_url is a base64 image, upload it first
      let headshotUrl = data.headshot_url;
      if (headshotUrl && headshotUrl.startsWith("data:image")) {
        try {
          const uploadResponse = await api.post("/api/profile/headshot", {
            image: headshotUrl,
          });
          headshotUrl = uploadResponse.data.headshot_url;
        } catch (uploadErr: unknown) {
          const uploadError = uploadErr as { response?: { data?: { detail?: string } } };
          setError(uploadError.response?.data?.detail || "Failed to upload headshot");
          setIsLoading(false);
          return;
        }
      }

      // Save profile with the headshot URL
      await api.post("/api/profile", { ...data, headshot_url: headshotUrl });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || "Failed to save profile");
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
    <TooltipProvider>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
                    {completionPercentage}%
                  </span>
                </div>
                <Progress value={completionPercentage} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  Complete your profile to get better monologue recommendations
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Headshot Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconPhoto className="h-5 w-5" />
                Headshot
              </CardTitle>
              <CardDescription>Upload your professional headshot</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="headshot">Upload Photo</Label>
                <Input 
                  id="headshot" 
                  type="file"
                  accept="image/*"
                  onChange={handleHeadshotChange}
                  className="cursor-pointer"
                />
                <p className="text-sm text-muted-foreground">
                  Upload a professional headshot (JPG, PNG, max 5MB)
                </p>
              </div>
              {headshotPreview && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-4 space-y-2"
                >
                  <div className="relative w-32 h-40 border-2 rounded-md overflow-hidden bg-muted group">
                    {headshotPreview && (
                      <Image
                        src={headshotPreview}
                        alt="Headshot preview"
                        width={128}
                        height={160}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const placeholder = e.currentTarget.nextElementSibling as HTMLElement;
                          if (placeholder) placeholder.style.display = 'flex';
                        }}
                        unoptimized
                      />
                    )}
                    <div className="absolute inset-0 hidden items-center justify-center bg-muted">
                      <IconPhoto className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleEditPhoto}
                    className="w-32"
                  >
                    <IconEdit className="h-4 w-4 mr-2" />
                    Edit Photo
                  </Button>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Tabs for organized sections */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-colshave-3">
            <TabsTrigger value="basic" className="flex items-center gap-2">
              <IconUser className="h-4 w-4" />
              Basic Info
            </TabsTrigger>
            <TabsTrigger value="acting" className="flex items-center gap-2">
              <IconBriefcase className="h-4 w-4" />
              Acting Info
            </TabsTrigger>
            <TabsTrigger value="preferences" className="flex items-center gap-2">
              <IconSettings className="h-4 w-4" />
              Preferences
            </TabsTrigger>
          </TabsList>

          <AnimatePresence mode="wait">
            {activeTab === "basic" && (
              <TabsContent key="basic" value="basic" className="mt-6">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card>
                    <CardHeader>
                      <CardTitle>Basic Information</CardTitle>
                      <CardDescription>Tell us about yourself</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Name *</Label>
                        <Input id="name" {...register("name")} />
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
                          <Label htmlFor="age_range">Age Range *</Label>
                          <Select id="age_range" {...register("age_range")}>
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
                          <Label htmlFor="gender">Gender Identity *</Label>
                          <Select id="gender" {...register("gender")}>
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
                        <Label htmlFor="ethnicity">Ethnicity (optional)</Label>
                        <Input id="ethnicity" {...register("ethnicity")} />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="height">Height (optional)</Label>
                          <Input id="height" placeholder="5'10&quot;" {...register("height")} />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="build">Build (optional)</Label>
                          <Input id="build" placeholder="Athletic" {...register("build")} />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="location">Location/Market *</Label>
                        <Select id="location" {...register("location")}>
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
            )}

            {activeTab === "acting" && (
              <TabsContent key="acting" value="acting" className="mt-6">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card>
                    <CardHeader>
                      <CardTitle>Acting Background</CardTitle>
                      <CardDescription>Your acting experience and training</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="experience_level">Experience Level *</Label>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="inline-flex items-center">
                                <IconInfoCircle className="h-4 w-4 text-muted-foreground hover:text-foreground" />
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
                        <Select id="experience_level" {...register("experience_level")}>
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
                        <Label htmlFor="type">Type *</Label>
                        <Select id="type" {...register("type")}>
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
                        <Label htmlFor="training_background">Training Background (optional)</Label>
                        <Input id="training_background" placeholder="BFA, MFA, Conservatory, etc." {...register("training_background")} />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="union_status">Union Status *</Label>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="inline-flex items-center">
                                <IconInfoCircle className="h-4 w-4 text-muted-foreground hover:text-foreground" />
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
                        <Select id="union_status" {...register("union_status")}>
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
            )}

            {activeTab === "preferences" && (
              <TabsContent key="preferences" value="preferences" className="mt-6">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <IconSparkles className="h-5 w-5" />
                        Search Preferences
                      </CardTitle>
                      <CardDescription>Customize your monologue search experience</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
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
                          onChange={(e) => setValue("profile_bias_enabled", e.target.checked)}
                        />
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <Label>Preferred Genres</Label>
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
                        <Label htmlFor="comfort">Comfort with Difficult Material</Label>
                        <Select id="comfort" {...register("comfort_with_difficult_material")}>
                          <option value="low">Low</option>
                          <option value="moderate">Moderate</option>
                          <option value="high">High</option>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="sensitivity">
                            Overdone Alert Sensitivity: {watch("overdone_alert_sensitivity")}
                          </Label>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="inline-flex items-center">
                                <IconInfoCircle className="h-4 w-4 text-muted-foreground hover:text-foreground" />
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
            )}
          </AnimatePresence>
        </Tabs>

        {/* Success/Error Messages */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </motion.div>
          )}
          {success && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="rounded-lg border border-green-500/50 bg-green-50 dark:bg-green-950 p-4">
                <div className="flex items-center gap-2">
                  <IconCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <p className="text-sm text-green-800 dark:text-green-200">
                    Profile saved successfully!
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submit Button */}
        <div className="flex justify-center">
          <motion.div
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="w-full max-w-md"
          >
            <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
              {isLoading ? (
                <>
                  <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <IconCheck className="mr-2 h-4 w-4" />
                  Save Profile
                </>
              )}
            </Button>
          </motion.div>
        </div>
      </form>
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
