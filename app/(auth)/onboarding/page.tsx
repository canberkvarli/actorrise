'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
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
  Image,
  Info
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';

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

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  // Load saved progress from localStorage
  const loadSavedProgress = () => {
    if (typeof window === 'undefined') return { step: 0, data: null };
    try {
      const saved = localStorage.getItem(ONBOARDING_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { step: parsed.step || 0, data: parsed.data || null };
      }
    } catch (e) {
      console.error('Error loading onboarding progress:', e);
    }
    return { step: 0, data: null };
  };

  const savedProgress = loadSavedProgress();
  
  // Check if user already has a profile (completed onboarding)
  useEffect(() => {
    const checkProfile = async () => {
      try {
        const response = await api.get('/api/profile');
        if (response.data && response.data.name) {
          // User has a profile, redirect to dashboard
          router.push('/dashboard');
        }
      } catch (error: any) {
        // 404 means no profile yet, which is fine - continue onboarding
        if (error.response?.status !== 404) {
          console.error('Error checking profile:', error);
        }
      }
    };
    checkProfile();
  }, [router]);

  const [currentStep, setCurrentStep] = useState(savedProgress.step);
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    actorTypes: [] as string[], // Changed to array for multiple selections
    actorTypeOther: '', // For "Other" option
    experience: '',
    age_range: '',
    gender: '',
    ethnicity: '',
    height_feet: '',
    height_inches: '',
    build: '',
    training_background: '',
    union_status: '',
    union_status_other: '', // For "Other" option
    type: '',
    type_other: '', // For "Other" option
    preferred_genres: [] as string[],
    overdone_alert_sensitivity: 0.5,
    profile_bias_enabled: true,
    headshot_url: '',
    ...(savedProgress.data || {})
  });
  const [isLoading, setIsLoading] = useState(false);
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
      // Build save data - only include fields that have values
      const saveData: any = {};
      
      // Required field
      if (formData.name.trim()) saveData.name = formData.name.trim();
      
      // Optional fields - only send if they have values
      if (formData.location && formData.location.trim()) saveData.location = formData.location.trim();
      
      // Handle actor types - can be multiple + other
      // Store in type field as array
      const actorTypes = [...formData.actorTypes];
      if (formData.actorTypeOther.trim()) {
        actorTypes.push(formData.actorTypeOther.trim());
      }
      if (actorTypes.length > 0) {
        saveData.type = actorTypes.length === 1 ? actorTypes[0] : actorTypes;
      }
      
      if (formData.experience) saveData.experience_level = formData.experience;
      if (formData.age_range) saveData.age_range = formData.age_range;
      if (formData.gender) saveData.gender = formData.gender;
      if (formData.ethnicity?.trim()) saveData.ethnicity = formData.ethnicity.trim();
      
      // Combine height - only save if both are provided and not empty
      if ((formData.height_feet && formData.height_feet !== '0') || (formData.height_inches && formData.height_inches !== '0')) {
        const feet = formData.height_feet || '0';
        const inches = formData.height_inches || '0';
        saveData.height = `${feet}'${inches}"`;
      }
      
      if (formData.build?.trim()) saveData.build = formData.build.trim();
      if (formData.training_background?.trim()) saveData.training_background = formData.training_background.trim();
      
      // Handle union status - can have "Other"
      if (formData.union_status) {
        saveData.union_status = formData.union_status === 'Other' && formData.union_status_other.trim()
          ? formData.union_status_other.trim()
          : formData.union_status;
      }
      
      // Character type (Leading Man/Woman, etc.) - only save if actor types weren't set
      // This is a different concept from actor types, but they share the same backend field
      // For now, prioritize actor types in onboarding, character type can be set in profile
      if (!saveData.type && formData.type && formData.type !== 'Other') {
        saveData.type = formData.type;
      } else if (!saveData.type && formData.type === 'Other' && formData.type_other.trim()) {
        saveData.type = formData.type_other.trim();
      }
      if (formData.preferred_genres.length > 0) saveData.preferred_genres = formData.preferred_genres;
      if (formData.overdone_alert_sensitivity !== undefined) saveData.overdone_alert_sensitivity = formData.overdone_alert_sensitivity;
      if (formData.profile_bias_enabled !== undefined) saveData.profile_bias_enabled = formData.profile_bias_enabled;
      if (formData.headshot_url?.trim()) saveData.headshot_url = formData.headshot_url.trim();

      // Save to profile using POST
      console.log('Saving profile data:', JSON.stringify(saveData, null, 2));
      const response = await api.post('/api/profile', saveData);
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
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setPhotoToEdit(base64String);
        setShowPhotoEditor(true);
      };
      reader.onerror = () => {
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
        {/* Progress Bar */}
        {currentStep > 0 && currentStep < steps.length - 1 && (
          <div className="fixed top-0 left-0 right-0 z-50">
            <div className="h-1 bg-muted">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center px-4 py-10 pb-32">
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
              />
            )}
            {currentStep === 9 && <CompleteStep key="complete" onNavigate={() => router.push('/dashboard')} />}
          </AnimatePresence>
        </div>

        {/* Navigation */}
        {currentStep > 0 && currentStep < steps.length - 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed bottom-8 left-0 right-0 flex justify-center gap-4 px-4"
          >
            <button
              onClick={prevStep}
              className="px-6 py-3 rounded-xl border border-border bg-card text-sm font-medium text-foreground hover:border-primary hover:text-primary transition flex items-center gap-2"
            >
              <ChevronLeft className="w-5 h-5" />
              Back
            </button>
            {currentStep > 1 && (
              <button
                onClick={skipStep}
                className="px-6 py-3 rounded-xl border border-border bg-card text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary transition"
              >
                Skip
              </button>
            )}
            <button
              onClick={nextStep}
              disabled={!canProceed()}
              className="px-8 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90"
            >
              Continue
              <ChevronRight className="w-5 h-5" />
            </button>
          </motion.div>
        )}
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

// Welcome Step
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.5 }}
        className="text-center max-w-2xl"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1, rotate: 360 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="mb-8 inline-block"
      >
        <div className="w-32 h-32 rounded-full border border-border flex items-center justify-center bg-card shadow-sm">
          <Sparkles className="w-16 h-16 text-primary" />
        </div>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="text-5xl md:text-6xl font-bold text-foreground mb-6"
      >
        Welcome to ActorRise
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="text-lg md:text-xl text-muted-foreground mb-12 leading-relaxed"
      >
        Set up your profile to get started.
        <br />
        You can always add more details later.
      </motion.p>

      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onNext}
        className="px-10 py-4 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-semibold text-base md:text-lg transition flex items-center gap-3 mx-auto"
      >
        Get Started
        <ChevronRight className="w-6 h-6" />
      </motion.button>
    </motion.div>
  );
}

// Name Step
function NameStep({
  name,
  onUpdate,
  onNext,
  onBack
}: {
  name: string;
  onUpdate: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.3 }}
      className="max-w-2xl w-full"
    >
      <div className="flex items-center justify-center mb-8">
        <div className="w-16 h-16 rounded-full border border-border flex items-center justify-center bg-card">
          <User className="w-8 h-8 text-primary" />
        </div>
      </div>

      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl md:text-4xl font-bold text-foreground text-center mb-4"
      >
        What's your name?
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-muted-foreground text-center mb-8 text-sm md:text-base"
      >
        This will appear on your profile
      </motion.p>

      <div className="space-y-4">
        <Input
          value={name}
          onChange={(e) => onUpdate(e.target.value)}
          placeholder="Enter your full name"
          className="w-full text-lg py-6"
          autoFocus
        />
      </div>
    </motion.div>
  );
}

// Location Step
function LocationStep({
  location,
  onUpdate,
  onNext,
  onBack,
  onSkip
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
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.3 }}
      className="max-w-2xl w-full"
    >
      <div className="flex items-center justify-center mb-8">
        <div className="w-16 h-16 rounded-full border border-border flex items-center justify-center bg-card">
          <MapPin className="w-8 h-8 text-primary" />
        </div>
      </div>

      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl md:text-4xl font-bold text-foreground text-center mb-4"
      >
        Where are you based?
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-muted-foreground text-center mb-8 text-sm md:text-base"
      >
        Optional - helps us show you relevant opportunities
      </motion.p>

      <div className="space-y-3">
        {locations.map((loc) => {
          const isSelected = location === loc;
          return (
            <motion.button
              key={loc}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onUpdate(loc)}
              className={`w-full p-4 rounded-xl border transition text-left ${
                isSelected
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/60 bg-card'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{loc}</span>
                {isSelected && <Check className="w-5 h-5 text-primary" />}
              </div>
            </motion.button>
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
  onNext,
  onBack,
  onSkip
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
    { id: 'theater', label: 'Theater', icon: Theater, description: 'Stage performance and live acting' },
    { id: 'film', label: 'Film & TV', icon: Film, description: 'On-camera work for screen' },
    { id: 'voice', label: 'Voice Acting', icon: Mic, description: 'Animation, audiobooks, and VO' },
    { id: 'student', label: 'Student', icon: GraduationCap, description: 'Learning and training' }
  ];
  const hasOther = selected.includes('other');

  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.3 }}
      className="max-w-2xl w-full"
    >
      <div className="flex items-center justify-center mb-8">
        <div className="w-16 h-16 rounded-full border border-border flex items-center justify-center bg-card">
          <Theater className="w-8 h-8 text-primary" />
        </div>
      </div>

      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl md:text-4xl font-bold text-foreground text-center mb-4"
      >
        What kind of actor are you?
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-muted-foreground text-center mb-8 text-sm md:text-base"
      >
        Optional - select all that apply
      </motion.p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {types.map((type, index) => {
          const Icon = type.icon;
          const isSelected = selected.includes(type.id);
          return (
            <motion.button
              key={type.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.03, y: -5 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onToggle(type.id)}
              className={`relative p-6 rounded-xl border transition-all duration-300 bg-card ${
                isSelected
                  ? 'border-primary shadow-md'
                  : 'border-border hover:border-primary/60'
              }`}
            >
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-4 right-4 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center"
                >
                  <Check className="w-5 h-5" />
                </motion.div>
              )}

              <div className="w-16 h-16 rounded-xl border border-border flex items-center justify-center mb-4 mx-auto bg-muted">
                <Icon className="w-8 h-8 text-primary" />
              </div>

              <h3 className="text-xl font-bold text-foreground mb-2 text-center">
                {type.label}
              </h3>
              <p className="text-muted-foreground text-sm text-center">
                {type.description}
              </p>
            </motion.button>
          );
        })}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: types.length * 0.1 }}
          whileHover={{ scale: 1.03, y: -5 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onToggle('other')}
          className={`relative p-6 rounded-xl border transition-all duration-300 bg-card ${
            hasOther
              ? 'border-primary shadow-md'
              : 'border-border hover:border-primary/60'
          }`}
        >
          {hasOther && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-4 right-4 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center"
            >
              <Check className="w-5 h-5" />
            </motion.div>
          )}
          <div className="w-16 h-16 rounded-xl border border-border flex items-center justify-center mb-4 mx-auto bg-muted">
            <User className="w-8 h-8 text-primary" />
      </div>
          <h3 className="text-xl font-bold text-foreground mb-2 text-center">
            Other
          </h3>
          <p className="text-muted-foreground text-sm text-center">
            Specify your own type
          </p>
        </motion.button>
      </div>
      
      {hasOther && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-4 mb-20"
        >
          <Input
            value={otherValue}
            onChange={(e) => onOtherChange(e.target.value)}
            placeholder="Enter your actor type"
            className="w-full"
            autoFocus
          />
        </motion.div>
      )}
    </motion.div>
  );
}

// Experience Step
function ExperienceStep({
  selected,
  onSelect,
  onNext,
  onBack,
  onSkip
}: {
  selected: string;
  onSelect: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const levels = [
    { id: 'beginner', label: 'Beginner', emoji: '🌱', description: 'Just starting my acting journey' },
    { id: 'intermediate', label: 'Intermediate', emoji: '🎭', description: 'Some training and experience' },
    { id: 'professional', label: 'Professional', emoji: '⭐', description: 'Working actor with credits' }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.3 }}
      className="max-w-2xl w-full"
    >
      <div className="flex items-center justify-center mb-8">
        <div className="w-16 h-16 rounded-full border border-border flex items-center justify-center bg-card">
          <Star className="w-8 h-8 text-primary" />
        </div>
      </div>

      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl md:text-4xl font-bold text-foreground text-center mb-4"
      >
        What's your experience level?
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-muted-foreground text-center mb-8 text-sm md:text-base"
      >
        Optional - helps us match you with appropriate content
      </motion.p>

      <div className="space-y-4">
        {levels.map((level, index) => {
          const isSelected = selected === level.id;
          return (
            <motion.button
              key={level.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.02, x: 10 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelect(level.id)}
              className={`w-full p-6 rounded-xl border bg-card transition-all duration-300 flex items-center gap-6 ${
                isSelected
                  ? 'border-primary shadow-md'
                  : 'border-border hover:border-primary/60'
              }`}
            >
              <div className="text-4xl">{level.emoji}</div>
              <div className="flex-1 text-left">
                <h3 className="text-xl font-semibold text-foreground mb-1">
                  {level.label}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {level.description}
                </p>
              </div>
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-10 h-10 bg-primary rounded-full flex items-center justify-center"
                >
                  <Check className="w-6 h-6 text-primary-foreground" />
                </motion.div>
              )}
            </motion.button>
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
  onNext,
  onBack,
  onSkip
}: {
  formData: any;
  updateFormData: (key: string, value: any) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.3 }}
      className="max-w-2xl w-full"
    >
      <div className="flex items-center justify-center mb-8">
        <div className="w-16 h-16 rounded-full border border-border flex items-center justify-center bg-card">
          <User className="w-8 h-8 text-primary" />
        </div>
      </div>

      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl md:text-4xl font-bold text-foreground text-center mb-4"
      >
        Physical Details
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-muted-foreground text-center mb-8 text-sm md:text-base"
      >
        Optional - all fields can be skipped
      </motion.p>

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
                  className={`p-3 rounded-lg border transition ${
                    isSelected
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/60 bg-card'
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
                  className={`p-3 rounded-lg border transition ${
                isSelected
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/60 bg-card'
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
          <Input
            value={formData.ethnicity || ''}
            onChange={(e) => updateFormData('ethnicity', e.target.value)}
            placeholder="Enter your ethnicity"
            className="w-full"
          />
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
          <Input
            value={formData.build || ''}
            onChange={(e) => updateFormData('build', e.target.value)}
            placeholder="e.g., Athletic, Average, Slender"
            className="w-full"
          />
        </div>
      </div>
    </motion.div>
  );
}

// Acting Background Step
function ActingBackgroundStep({
  formData,
  updateFormData,
  onNext,
  onBack,
  onSkip
}: {
  formData: any;
  updateFormData: (key: string, value: any) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.3 }}
      className="max-w-2xl w-full"
    >
      <div className="flex items-center justify-center mb-8">
        <div className="w-16 h-16 rounded-full border border-border flex items-center justify-center bg-card">
          <Briefcase className="w-8 h-8 text-primary" />
        </div>
      </div>

      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl md:text-4xl font-bold text-foreground text-center mb-4"
      >
        Acting Background
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-muted-foreground text-center mb-8 text-sm md:text-base"
      >
        Optional - tell us about your training and experience
      </motion.p>

      <div className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Training Background (optional)</label>
          <Input
            value={formData.training_background || ''}
            onChange={(e) => updateFormData('training_background', e.target.value)}
            placeholder="e.g., BFA, MFA, Conservatory, Studio training"
            className="w-full"
          />
                </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-foreground">Union Status</label>
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
                  className={`p-3 rounded-lg border transition text-sm ${
                isSelected
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/60 bg-card'
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
                  className={`p-3 rounded-lg border transition text-sm ${
                    isSelected
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/60 bg-card'
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
  onNext,
  onBack,
  onSkip
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
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.3 }}
      className="max-w-2xl w-full"
    >
      <div className="flex items-center justify-center mb-8">
        <div className="w-16 h-16 rounded-full border border-border flex items-center justify-center bg-card">
          <Settings className="w-8 h-8 text-primary" />
        </div>
      </div>

      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl md:text-4xl font-bold text-foreground text-center mb-4"
      >
        AI Preferences
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-muted-foreground text-center mb-8 text-sm md:text-base"
      >
        Optional - customize your AI-powered search experience
      </motion.p>

      <div className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Preferred Genres</label>
          <div className="grid grid-cols-3 gap-2">
            {genres.map((genre) => (
              <label key={genre} className="flex items-center space-x-2 cursor-pointer p-3 rounded-lg border border-border hover:border-primary/60 bg-card">
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

// Headshot Step
function HeadshotStep({
  headshotUrl,
  onHeadshotChange,
  onRemove,
  onNext,
  onBack,
  onSkip,
  isLoading
}: {
  headshotUrl: string;
  onHeadshotChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  isLoading: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.3 }}
      className="max-w-2xl w-full"
    >
      <div className="flex items-center justify-center mb-8">
        <div className="w-16 h-16 rounded-full border border-border flex items-center justify-center bg-card">
          <Camera className="w-8 h-8 text-primary" />
        </div>
      </div>

      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl md:text-4xl font-bold text-foreground text-center mb-4"
      >
        Add a Headshot
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-muted-foreground text-center mb-8 text-sm md:text-base"
      >
        Optional - upload a professional headshot
      </motion.p>

      <div className="flex justify-center">
        {headshotUrl ? (
          <div className="space-y-4">
            <img
              src={headshotUrl}
              alt="Headshot"
              className="w-32 h-48 object-cover rounded-md border"
            />
            <button
              onClick={onRemove}
              className="text-sm text-destructive hover:underline w-full"
            >
              Remove headshot
            </button>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center w-32 h-48 rounded-md border-2 border-dashed border-border bg-muted/30 hover:bg-muted/50 hover:border-primary/50 transition cursor-pointer">
            <Image className="h-8 w-8 text-muted-foreground mb-2" />
            <span className="text-xs text-muted-foreground">Upload</span>
            <input
              type="file"
              accept="image/*"
              onChange={onHeadshotChange}
              className="hidden"
            />
          </label>
        )}
      </div>
    </motion.div>
  );
}

// Complete Step
function CompleteStep({ onNavigate }: { onNavigate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="text-center max-w-2xl"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.2, 1], rotate: [0, 360, 360] }}
        transition={{ duration: 0.8 }}
        className="mb-8 inline-block"
      >
        <div className="w-32 h-32 bg-gradient-to-br from-primary to-primary/80 rounded-full flex items-center justify-center shadow-2xl">
          <Check className="w-16 h-16 text-primary-foreground" />
        </div>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-6xl font-bold text-foreground mb-6"
      >
        You're All Set!
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="text-2xl text-muted-foreground mb-8"
      >
        Your profile has been saved.
        <br />
        Ready to get started!
      </motion.p>

      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        onClick={onNavigate}
        className="px-10 py-4 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-semibold text-base md:text-lg transition flex items-center gap-3 mx-auto"
      >
        Go to Dashboard
        <ChevronRight className="w-6 h-6" />
      </motion.button>
    </motion.div>
  );
}
