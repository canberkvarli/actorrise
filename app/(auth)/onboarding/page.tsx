'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PhotoEditor } from '@/components/profile/PhotoEditor';
import {
  Sparkles,
  Theater,
  Film,
  Mic,
  GraduationCap,
  ChevronRight,
  ChevronLeft,
  Check,
  Star,
  User,
  MapPin,
  Camera,
  Ruler,
  Calendar,
  Briefcase,
  Settings,
  Info
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';
import { ETHNICITY_OPTIONS, TRAINING_BACKGROUND_OPTIONS } from '@/lib/profileOptions';

const steps = [
  { id: 'welcome', title: 'Welcome' },
  { id: 'name', title: 'Your Name' },
  { id: 'location', title: 'Location' },
  { id: 'actor-type', title: 'Actor Type' },
  { id: 'experience', title: 'Experience' },
  { id: 'physical', title: 'Physical Details' },
  { id: 'acting', title: 'Acting Background' },
  { id: 'preferences', title: 'Preferences' },
  { id: 'headshot', title: 'Headshot' },
  { id: 'complete', title: 'Complete' }
];

const ONBOARDING_STORAGE_KEY = 'actorrise_onboarding_progress';

/** Resize image data URL to max 1200px so the crop editor opens quickly. */
function resizeImageForCrop(dataUrl: string, maxPx = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.width;
      const h = img.height;
      if (w <= maxPx && h <= maxPx) {
        resolve(dataUrl);
        return;
      }
      const scale = maxPx / Math.max(w, h);
      const c = document.createElement('canvas');
      c.width = Math.round(w * scale);
      c.height = Math.round(h * scale);
      const ctx = c.getContext('2d');
      if (!ctx) {
        reject(new Error('No canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = dataUrl;
  });
}

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Always start at step 0 so new signups see Welcome; we only restore progress after confirming user has incomplete profile
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    actorTypes: [] as string[],
    actorTypeOther: '',
    experience: '',
    age_range: '',
    gender: '',
    ethnicity: '',
    height_feet: '',
    height_inches: '',
    build: '',
    training_background: '',
    union_status: '',
    union_status_other: '',
    type: '',
    type_other: '',
    preferred_genres: [] as string[],
    overdone_alert_sensitivity: 0.5,
    profile_bias_enabled: true,
    headshot_url: '',
  });

  // Check profile: redirect if complete, clear stale progress if new user (404), restore progress if incomplete
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await api.get<{ name?: string }>('/api/profile');
        if (cancelled) return;
        const profile = response.data;
        if (profile?.name) {
          router.push('/dashboard');
          return;
        }
        // Profile exists but no name (incomplete): restore from localStorage so they can continue where they left off
        if (profile && typeof window !== 'undefined') {
          try {
            const saved = localStorage.getItem(ONBOARDING_STORAGE_KEY);
            if (saved) {
              const parsed = JSON.parse(saved);
              const step = Math.min(Number(parsed.step) || 0, steps.length - 1);
              if (step > 0) {
                setCurrentStep(step);
                if (parsed.data && typeof parsed.data === 'object') {
                  setFormData(prev => ({ ...prev, ...parsed.data }));
                }
              }
            }
          } catch (_) {
            /* ignore parse errors */
          }
        }
      } catch (error: unknown) {
        if (cancelled) return;
        const err = error as { response?: { status?: number } };
        if (err.response?.status === 404) {
          // New user (no profile yet): clear stale onboarding progress from another session so we don't show "Complete"
          if (typeof window !== 'undefined') {
            localStorage.removeItem(ONBOARDING_STORAGE_KEY);
          }
        } else {
          console.error('Error checking profile:', error);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [router]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [showPhotoEditor, setShowPhotoEditor] = useState(false);
  const [photoToEdit, setPhotoToEdit] = useState<string | null>(null);

  // Save progress to localStorage whenever step or formData changes
  useEffect(() => {
    if (typeof window !== 'undefined' && currentStep > 0) {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({
        step: currentStep,
        data: formData
      }));
    }
  }, [currentStep, formData]);

  // Clear saved progress on completion
  const clearSavedProgress = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    }
  };

  const updateFormData = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const toggleGenre = (genre: string) => {
    setFormData(prev => ({
      ...prev,
      preferred_genres: prev.preferred_genres.includes(genre)
        ? prev.preferred_genres.filter(g => g !== genre)
        : [...prev.preferred_genres, genre]
    }));
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const skipStep = () => {
    nextStep();
  };

  const completeOnboarding = async () => {
    setIsLoading(true);
    try {
      const actorTypes = [...formData.actorTypes];
      if (formData.actorTypeOther.trim()) actorTypes.push(formData.actorTypeOther.trim());
      const typeValue = actorTypes.length === 0
        ? (formData.type === 'Other' && formData.type_other.trim() ? formData.type_other.trim() : formData.type || null)
        : (actorTypes.length === 1 ? actorTypes[0] : actorTypes);

      const unionValue = formData.union_status
        ? (formData.union_status === 'Other' && formData.union_status_other.trim() ? formData.union_status_other.trim() : formData.union_status)
        : null;

      const feet = formData.height_feet?.trim() && formData.height_feet !== '0' ? formData.height_feet : '';
      const inches = formData.height_inches?.trim() && formData.height_inches !== '0' ? formData.height_inches : '';
      const heightValue = (feet || inches) ? `${feet || '0'}'${inches || '0'}"` : null;

      // Send full profile payload so backend receives every field (fixes headshot-only profile not getting name, etc.)
      const saveData = {
        name: formData.name?.trim() || null,
        location: formData.location?.trim() || null,
        age_range: formData.age_range || null,
        gender: formData.gender || null,
        ethnicity: formData.ethnicity?.trim() || null,
        height: heightValue,
        build: formData.build?.trim() || null,
        experience_level: formData.experience || null,
        type: typeValue,
        training_background: formData.training_background?.trim() || null,
        union_status: unionValue,
        preferred_genres: formData.preferred_genres?.length ? formData.preferred_genres : [],
        overdone_alert_sensitivity: formData.overdone_alert_sensitivity ?? 0.5,
        profile_bias_enabled: formData.profile_bias_enabled ?? true,
        headshot_url: formData.headshot_url?.trim() || null,
      };

      // PUT = full replace so every field from onboarding overwrites existing (e.g. headshot-only profile)
      const response = await api.put('/api/profile', saveData);
      console.log('Profile saved successfully:', response.data);

      // Invalidate profile-related cache
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["profile-stats"] });
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });

      // Trigger confetti
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });

      // Clear saved progress
      clearSavedProgress();

      // Go to final step
      nextStep();
    } catch (error) {
      console.error('Error completing onboarding:', error);
      toast.error('Failed to save profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1: // Name step
        return formData.name.trim() !== '';
      default:
        return true; // All other steps are optional
    }
  };

  const handleHeadshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Please upload an image file');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size must be less than 5MB');
        return;
      }
      setIsPreparingImage(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64String = reader.result as string;
          const resized = await resizeImageForCrop(base64String);
          setPhotoToEdit(resized);
          setShowPhotoEditor(true);
        } catch (err) {
          console.error('Error preparing image:', err);
          toast.error('Failed to prepare image. Try a smaller file.');
        } finally {
          setIsPreparingImage(false);
        }
      };
      reader.onerror = () => {
        setIsPreparingImage(false);
        toast.error('Failed to read image file');
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleSavePhoto = async (croppedImage: string) => {
    try {
      setIsLoading(true);
      if (croppedImage.startsWith('data:image')) {
        const response = await api.post<{ headshot_url: string }>('/api/profile/headshot', {
          image: croppedImage,
        });
        const uploadedUrl = response.data.headshot_url.trim().split('?')[0].split('#')[0];
        updateFormData('headshot_url', uploadedUrl);
        // Invalidate cache after headshot upload
        queryClient.invalidateQueries({ queryKey: ["profile"] });
        queryClient.invalidateQueries({ queryKey: ["profile-stats"] });
      } else {
        updateFormData('headshot_url', croppedImage);
      }
      setShowPhotoEditor(false);
      setPhotoToEdit(null);
      toast.success('Headshot uploaded successfully');
    } catch (err) {
      console.error('Error uploading headshot:', err);
      toast.error('Failed to upload headshot');
    } finally {
      setIsLoading(false);
    }
  };

  const genres = ['Drama', 'Comedy', 'Classical', 'Contemporary', 'Musical', 'Shakespeare'];

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <div className="min-h-screen flex flex-col">
        {/* Progress Bar — muted palette, orange reserved for CTAs */}
        {currentStep > 0 && currentStep < steps.length - 1 && (
          <div className="fixed top-0 left-0 right-0 z-50">
            <div className="h-0.5 bg-muted">
              <motion.div
                className="h-full bg-foreground/15"
                initial={{ width: 0 }}
                animate={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>
          </div>
        )}

        {/* Main Content — same layout as login/signup */}
        <div className="flex-1 flex items-center justify-center px-4 py-10 pb-32">
          <div className="w-full max-w-2xl">
            {currentStep > 0 && currentStep < steps.length - 1 && (
              <div className="mb-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={prevStep}
                  className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
                <span className="text-xs font-mono text-muted-foreground tabular-nums">
                  {currentStep} of {steps.length - 1}
                </span>
              </div>
            )}
            <div className="border border-border/60 rounded-2xl bg-card shadow-sm px-6 py-8 md:px-8 md:py-10">
          <AnimatePresence mode="wait">
            {currentStep === 0 && <WelcomeStep key="welcome" onNext={nextStep} />}
            {currentStep === 1 && (
              <NameStep
                key="name"
                name={formData.name}
                onUpdate={(value) => updateFormData('name', value)}
                onNext={nextStep}
                onBack={prevStep}
              />
            )}
            {currentStep === 2 && (
              <LocationStep
                key="location"
                location={formData.location}
                onUpdate={(value) => updateFormData('location', value)}
                onNext={nextStep}
                onBack={prevStep}
                onSkip={skipStep}
              />
            )}
            {currentStep === 3 && (
              <ActorTypeStep
                key="actor-type"
                selected={formData.actorTypes}
                otherValue={formData.actorTypeOther}
                onToggle={(value) => {
                  const current = formData.actorTypes;
                  if (current.includes(value)) {
                    updateFormData('actorTypes', current.filter(t => t !== value));
                  } else {
                    updateFormData('actorTypes', [...current, value]);
                  }
                }}
                onOtherChange={(value) => updateFormData('actorTypeOther', value)}
                onNext={nextStep}
                onBack={prevStep}
                onSkip={skipStep}
              />
            )}
            {currentStep === 4 && (
              <ExperienceStep
                key="experience"
                selected={formData.experience}
                onSelect={(value) => updateFormData('experience', value)}
                onNext={nextStep}
                onBack={prevStep}
                onSkip={skipStep}
              />
            )}
            {currentStep === 5 && (
              <PhysicalDetailsStep
                key="physical"
                formData={formData}
                updateFormData={updateFormData}
                onNext={nextStep}
                onBack={prevStep}
                onSkip={skipStep}
              />
            )}
            {currentStep === 6 && (
              <ActingBackgroundStep
                key="acting"
                formData={formData}
                updateFormData={updateFormData}
                onNext={nextStep}
                onBack={prevStep}
                onSkip={skipStep}
              />
            )}
            {currentStep === 7 && (
              <PreferencesStep
                key="preferences"
                formData={formData}
                updateFormData={updateFormData}
                toggleGenre={toggleGenre}
                genres={genres}
                onNext={nextStep}
                onBack={prevStep}
                onSkip={skipStep}
              />
            )}
            {currentStep === 8 && (
              <HeadshotStep
                key="headshot"
                headshotUrl={formData.headshot_url}
                onHeadshotChange={handleHeadshotChange}
                onRemove={() => updateFormData('headshot_url', '')}
                onNext={completeOnboarding}
                onBack={prevStep}
                onSkip={completeOnboarding}
                isLoading={isLoading}
                isPreparingImage={isPreparingImage}
              />
            )}
            {currentStep === 9 && <CompleteStep key="complete" onNavigate={() => router.push('/dashboard')} />}
          </AnimatePresence>
            </div>

            {/* Navigation — on headshot step, Continue saves profile then goes to complete */}
            {currentStep > 0 && currentStep < steps.length - 1 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-8 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="flex gap-2">
                  {currentStep > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={currentStep === 8 ? completeOnboarding : skipStep} className="text-muted-foreground" disabled={isLoading}>
                      Skip
                    </Button>
                  )}
                </div>
                <Button
                  type="button"
                  onClick={currentStep === 8 ? completeOnboarding : nextStep}
                  disabled={!canProceed() || isLoading}
                  className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {currentStep === 8 && isLoading ? 'Saving…' : 'Continue'}
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Photo Editor */}
      {showPhotoEditor && photoToEdit && (
        <PhotoEditor
          image={photoToEdit}
          onSave={handleSavePhoto}
          onCancel={() => {
            setShowPhotoEditor(false);
            setPhotoToEdit(null);
          }}
          aspectRatio={2 / 3}
        />
      )}
    </div>
    </TooltipProvider>
  );
}

// Welcome Step — professional, palette-conscious (orange only on CTA)
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <div className="space-y-3">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
          ACTORRISE
        </h1>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-mono">
          Set up your profile
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
          A short setup so we can tailor monologue suggestions and audition tools to you. You can update anything later in your profile.
        </p>
      </div>
      <div className="flex justify-center py-6">
        <div className="w-20 h-20 rounded-full border border-border flex items-center justify-center bg-muted/80">
          <Sparkles className="w-10 h-10 text-muted-foreground" />
        </div>
      </div>
      <Button onClick={onNext} className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
        Get started
        <ChevronRight className="w-4 h-4" />
      </Button>
    </motion.div>
  );
}

// Name Step
function NameStep({
  name,
  onUpdate,
}: {
  name: string;
  onUpdate: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-mono">
          Your name
        </p>
        <h2 className="text-2xl font-bold text-foreground">
          What should we call you?
        </h2>
        <p className="text-sm text-muted-foreground">
          This appears on your profile and in the app.
        </p>
      </div>
      <Input
        value={name}
        onChange={(e) => onUpdate(e.target.value)}
        placeholder="Full name"
        className="w-full"
        autoFocus
      />
    </motion.div>
  );
}

// Location Step
function LocationStep({
  location,
  onUpdate,
}: {
  location: string;
  onUpdate: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const locations = ['NYC', 'LA', 'Chicago', 'Atlanta', 'Boston', 'Seattle', 'Regional', 'Other'];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-mono">
          Location
        </p>
        <h2 className="text-2xl font-bold text-foreground">
          Where are you based?
        </h2>
        <p className="text-sm text-muted-foreground">
          Optional — helps us surface relevant opportunities.
        </p>
      </div>
      <div className="space-y-2">
        {locations.map((loc) => {
          const isSelected = location === loc;
          return (
            <button
              key={loc}
              type="button"
              onClick={() => onUpdate(loc)}
              className={`w-full p-3 rounded-xl border text-left text-sm font-medium transition ${
                isSelected
                  ? 'border-accent bg-accent/10 text-foreground'
                  : 'border-border hover:border-accent/50 bg-muted/30 text-foreground'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{loc}</span>
                {isSelected && <Check className="w-4 h-4 text-accent-foreground" />}
              </div>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

// Actor Type Step
function ActorTypeStep({
  selected,
  otherValue,
  onToggle,
  onOtherChange,
}: {
  selected: string[];
  otherValue: string;
  onToggle: (value: string) => void;
  onOtherChange: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const types = [
    { id: 'theater', label: 'Theater', icon: Theater, description: 'Stage & live' },
    { id: 'film', label: 'Film & TV', icon: Film, description: 'On-camera' },
    { id: 'voice', label: 'Voice', icon: Mic, description: 'Animation, VO' },
    { id: 'student', label: 'Student', icon: GraduationCap, description: 'Training' },
  ];
  const hasOther = selected.includes('other');

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-mono">
          Actor type
        </p>
        <h2 className="text-2xl font-bold text-foreground">
          What kind of work do you do?
        </h2>
        <p className="text-sm text-muted-foreground">
          Optional — select all that apply.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {types.map((type) => {
          const Icon = type.icon;
          const isSelected = selected.includes(type.id);
          return (
            <button
              key={type.id}
              type="button"
              onClick={() => onToggle(type.id)}
              className={`relative p-4 rounded-xl border text-left transition ${
                isSelected ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50 bg-muted/30'
              }`}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-accent rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-accent-foreground" />
                </div>
              )}
              <Icon className="w-6 h-6 text-muted-foreground mb-2" />
              <div className="font-medium text-foreground text-sm">{type.label}</div>
              <div className="text-xs text-muted-foreground">{type.description}</div>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onToggle('other')}
          className={`relative p-4 rounded-xl border text-left transition col-span-2 ${
            hasOther ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50 bg-muted/30'
          }`}
        >
          {hasOther && (
            <div className="absolute top-2 right-2 w-5 h-5 bg-accent rounded-full flex items-center justify-center">
              <Check className="w-3 h-3 text-accent-foreground" />
            </div>
          )}
          <User className="w-6 h-6 text-muted-foreground mb-2" />
          <div className="font-medium text-foreground text-sm">Other</div>
          <div className="text-xs text-muted-foreground">Specify your own</div>
        </button>
      </div>
      {hasOther && (
        <div className="pt-2">
          <Input
            value={otherValue}
            onChange={(e) => onOtherChange(e.target.value)}
            placeholder="Your actor type"
            className="w-full"
            autoFocus
          />
        </div>
      )}
    </motion.div>
  );
}

// Experience Step
function ExperienceStep({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const levels = [
    { id: 'Student', label: 'Student', emoji: '🌱', description: 'Just starting' },
    { id: 'Emerging', label: 'Emerging', emoji: '🎭', description: 'Some training' },
    { id: 'Professional', label: 'Professional', emoji: '⭐', description: 'Working actor' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-mono">
          Experience
        </p>
        <h2 className="text-2xl font-bold text-foreground">
          What's your experience level?
        </h2>
        <p className="text-sm text-muted-foreground">
          Optional — we use this to match you with the right material.
        </p>
      </div>
      <div className="space-y-2">
        {levels.map((level) => {
          const isSelected = selected === level.id;
          return (
            <button
              key={level.id}
              type="button"
              onClick={() => onSelect(level.id)}
              className={`w-full p-4 rounded-xl border flex items-center gap-4 text-left transition ${
                isSelected ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50 bg-muted/30'
              }`}
            >
              <span className="text-2xl">{level.emoji}</span>
              <div className="flex-1">
                <div className="font-medium text-foreground">{level.label}</div>
                <div className="text-xs text-muted-foreground">{level.description}</div>
              </div>
              {isSelected && <Check className="w-5 h-5 text-accent-foreground" />}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

// Physical Details Step
function PhysicalDetailsStep({
  formData,
  updateFormData,
}: {
  formData: any;
  updateFormData: (key: string, value: any) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-mono">
          Physical details
        </p>
        <h2 className="text-2xl font-bold text-foreground">
          Optional details
        </h2>
        <p className="text-sm text-muted-foreground">
          All fields can be skipped. Helps casting and character matching.
        </p>
      </div>
      <div className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Age Range
          </label>
          <div className="grid grid-cols-2 gap-4">
            {['18-25', '25-35', '35-45', '45-55', '55+'].map((range) => {
              const isSelected = formData.age_range === range;
              return (
                <button
                  key={range}
                  onClick={() => updateFormData('age_range', range)}
                  className={`p-3 rounded-xl border transition ${
                    isSelected
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-accent/50 bg-card'
                  }`}
                >
                  {range}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground flex items-center gap-2">
            <User className="w-4 h-4" />
            Gender Identity
          </label>
          <div className="grid grid-cols-2 gap-4">
            {['Male', 'Female', 'Non-binary', 'Other'].map((gender) => {
              const isSelected = formData.gender === gender;
          return (
                <button
                  key={gender}
                  onClick={() => updateFormData('gender', gender)}
                  className={`p-3 rounded-xl border transition ${
                isSelected
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-accent/50 bg-card'
                  }`}
                >
                  {gender}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Ethnicity (optional)</label>
          <div className="flex flex-wrap gap-2">
            {ETHNICITY_OPTIONS.map((e) => {
              const isSelected = formData.ethnicity === e;
              return (
                <button
                  key={e}
                  type="button"
                  onClick={() => updateFormData('ethnicity', e)}
                  className={`px-3 py-2 rounded-xl border text-sm transition ${
                    isSelected ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50 bg-card'
                  }`}
                >
                  {e}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground flex items-center gap-2">
            <Ruler className="w-4 h-4" />
            Height
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                value={formData.height_feet || ''}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  if (val === '' || (parseInt(val) >= 0 && parseInt(val) <= 8)) {
                    updateFormData('height_feet', val);
                  }
                }}
                placeholder="5"
                className="w-full"
                maxLength={1}
              />
              <p className="text-xs text-muted-foreground mt-1 text-center">Feet</p>
            </div>
            <span className="text-2xl font-bold text-muted-foreground pt-4">'</span>
            <div className="flex-1">
              <Input
                value={formData.height_inches || ''}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  if (val === '' || (parseInt(val) >= 0 && parseInt(val) <= 11)) {
                    updateFormData('height_inches', val);
                  }
                }}
                placeholder="10"
                className="w-full"
                maxLength={2}
              />
              <p className="text-xs text-muted-foreground mt-1 text-center">Inches</p>
            </div>
            <span className="text-2xl font-bold text-muted-foreground pt-4">"</span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Build (optional)</label>
          <div className="flex flex-wrap gap-2">
            {['Slender', 'Average', 'Athletic', 'Heavy', 'Other'].map((b) => {
              const isSelected = formData.build === b;
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => updateFormData('build', b)}
                  className={`px-3 py-2 rounded-xl border text-sm transition ${
                    isSelected ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50 bg-card'
                  }`}
                >
                  {b}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Acting Background Step
function ActingBackgroundStep({
  formData,
  updateFormData,
}: {
  formData: any;
  updateFormData: (key: string, value: any) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-mono">
          Acting background
        </p>
        <h2 className="text-2xl font-bold text-foreground">
          Training & experience
        </h2>
        <p className="text-sm text-muted-foreground">
          Optional — helps us tailor suggestions.
        </p>
      </div>
      <div className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Training background (optional)</label>
          <div className="flex flex-wrap gap-2">
            {TRAINING_BACKGROUND_OPTIONS.map((t) => {
              const isSelected = formData.training_background === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => updateFormData('training_background', t)}
                  className={`px-3 py-2 rounded-xl border text-sm transition ${
                    isSelected ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50 bg-card'
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-foreground">Union status</label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-sm">
                    <strong>Non-union:</strong> Not a member of any acting union<br/>
                    <strong>SAG-E:</strong> SAG Eligible - Can join SAG-AFTRA but not yet a member<br/>
                    <strong>SAG:</strong> Full member of SAG-AFTRA (Screen Actors Guild)
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {['Non-union', 'SAG-E', 'SAG', 'Other'].map((status) => {
              const isSelected = formData.union_status === status;
          return (
                <button
                  key={status}
                  onClick={() => updateFormData('union_status', status)}
                  className={`p-3 rounded-xl border transition text-sm ${
                isSelected
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-accent/50 bg-card'
                  }`}
                >
                  {status}
                </button>
              );
            })}
          </div>
          {formData.union_status === 'Other' && (
                <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-2 mb-20"
            >
              <Input
                value={formData.union_status_other || ''}
                onChange={(e) => updateFormData('union_status_other', e.target.value)}
                placeholder="Enter your union status"
                className="w-full"
                autoFocus
              />
                </motion.div>
              )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Type</label>
          <div className="grid grid-cols-2 gap-3">
            {['Leading Man/Woman', 'Character Actor', 'Ingénue', 'Comic', 'Other'].map((type) => {
              const isSelected = formData.type === type;
              return (
                <button
                  key={type}
                  onClick={() => updateFormData('type', type)}
                  className={`p-3 rounded-xl border transition text-sm ${
                    isSelected
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-accent/50 bg-card'
                  }`}
                >
                  {type}
                </button>
              );
            })}
                </div>
          {formData.type === 'Other' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-2 mb-20"
            >
              <Input
                value={formData.type_other || ''}
                onChange={(e) => updateFormData('type_other', e.target.value)}
                placeholder="Enter your type"
                className="w-full"
                autoFocus
              />
            </motion.div>
          )}
                </div>
              </div>
    </motion.div>
  );
}

// Preferences Step
function PreferencesStep({
  formData,
  updateFormData,
  toggleGenre,
  genres,
}: {
  formData: any;
  updateFormData: (key: string, value: any) => void;
  toggleGenre: (genre: string) => void;
  genres: string[];
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-mono">
          Preferences
        </p>
        <h2 className="text-2xl font-bold text-foreground">
          Search preferences
        </h2>
        <p className="text-sm text-muted-foreground">
          Optional — genres and recommendation settings. You can change these anytime.
        </p>
      </div>
      <div className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Preferred Genres</label>
          <div className="grid grid-cols-3 gap-2">
            {genres.map((genre) => (
              <label key={genre} className="flex items-center space-x-2 cursor-pointer p-3 rounded-xl border border-border hover:border-accent/50 bg-card">
                <Checkbox
                  checked={formData.preferred_genres?.includes(genre)}
                  onChange={() => toggleGenre(genre)}
                />
                <span className="text-sm">{genre}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-foreground">
              Overdone Alert Sensitivity: {formData.overdone_alert_sensitivity}
            </label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help" />
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
            </TooltipProvider>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={formData.overdone_alert_sensitivity}
            onChange={(e) => updateFormData('overdone_alert_sensitivity', parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Low</span>
            <span>High</span>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/50">
          <div>
            <div className="font-medium">AI-Powered Recommendations</div>
            <div className="text-sm text-muted-foreground">Enable semantic search</div>
          </div>
          <input
            type="checkbox"
            checked={formData.profile_bias_enabled}
            onChange={(e) => updateFormData('profile_bias_enabled', e.target.checked)}
            className="w-4 h-4"
          />
        </div>
      </div>
    </motion.div>
  );
}

// Headshot Step — prominent, professional; encourages upload for better results
function HeadshotStep({
  headshotUrl,
  onHeadshotChange,
  onRemove,
  isPreparingImage = false,
}: {
  headshotUrl: string;
  onHeadshotChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  isLoading: boolean;
  isPreparingImage?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-mono">
          Profile photo
        </p>
        <h2 className="text-2xl font-bold text-foreground">
          Add a headshot
        </h2>
        <p className="text-sm text-muted-foreground max-w-md">
          A clear headshot helps us personalize your experience and improves recommendation quality. Standard 2:3 ratio, max 5MB. You can skip and add one later.
        </p>
      </div>
      <div className="flex justify-center relative">
        {headshotUrl ? (
          <div className="space-y-4 flex flex-col items-center">
            <img
              src={headshotUrl}
              alt="Headshot"
              className="w-36 h-54 object-cover rounded-xl border border-border shadow-sm"
            />
            <button
              type="button"
              onClick={onRemove}
              className="text-sm text-muted-foreground hover:text-foreground transition"
            >
              Remove photo
            </button>
          </div>
        ) : (
          <label
            className={`flex flex-col items-center justify-center w-40 h-56 rounded-xl border-2 border-dashed border-border transition group relative ${
              isPreparingImage ? 'bg-muted/50 cursor-wait' : 'bg-muted/30 hover:bg-muted/50 hover:border-accent/50 cursor-pointer'
            }`}
          >
            {isPreparingImage ? (
              <>
                <div className="h-8 w-8 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin mb-3" />
                <span className="text-sm font-medium text-muted-foreground">Preparing image…</span>
                <span className="text-xs text-muted-foreground mt-1">Opening editor in a moment</span>
              </>
            ) : (
              <>
                <Camera className="h-10 w-10 text-muted-foreground group-hover:text-foreground/70 mb-3 transition-colors" />
                <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground/80">Upload headshot</span>
                <span className="text-xs text-muted-foreground mt-1">JPG, PNG or WEBP</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={onHeadshotChange}
                  className="hidden"
                />
              </>
            )}
          </label>
        )}
      </div>
    </motion.div>
  );
}

// Complete Step — one clear orange CTA
function CompleteStep({ onNavigate }: { onNavigate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-8 text-center"
    >
      <div className="flex justify-center">
        <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center">
          <Check className="w-10 h-10 text-primary-foreground" />
        </div>
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl md:text-3xl font-bold text-foreground">
          You're all set
        </h2>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Your profile is saved. You can update it anytime from your profile. Head to the dashboard to find monologues and start preparing.
        </p>
      </div>
      <Button onClick={onNavigate} className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
        Go to dashboard
        <ChevronRight className="w-4 h-4" />
      </Button>
    </motion.div>
  );
}
