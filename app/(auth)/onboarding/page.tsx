'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import {
  Sparkles,
  Theater,
  Film,
  Mic,
  GraduationCap,
  TrendingUp,
  BookOpen,
  Target,
  Search,
  ChevronRight,
  ChevronLeft,
  Check,
  Star,
  Zap
} from 'lucide-react';
import confetti from 'canvas-confetti';

const steps = [
  { id: 'welcome', title: 'Welcome to ActorRise' },
  { id: 'actor-type', title: 'What kind of actor are you?' },
  { id: 'experience', title: "What's your experience level?" },
  { id: 'goals', title: 'What are you working on?' },
  { id: 'recommendations', title: 'Your personalized picks' },
  { id: 'complete', title: "You're all set!" }
];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    actorType: '',
    experience: '',
    goals: [] as string[],
  });
  const [isLoading, setIsLoading] = useState(false);

  const updateFormData = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const toggleGoal = (goal: string) => {
    setFormData(prev => ({
      ...prev,
      goals: prev.goals.includes(goal)
        ? prev.goals.filter(g => g !== goal)
        : [...prev.goals, goal]
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

  const completeOnboarding = async () => {
    setIsLoading(true);
    try {
      // Save preferences to profile
      await api.put('/api/profile', {
        type: formData.actorType,
        experience_level: formData.experience,
        preferred_genres: formData.goals
      });

      // Trigger confetti
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });

      // Go to final step
      nextStep();

      // Redirect after celebration
      setTimeout(() => {
        router.push('/dashboard');
      }, 3000);
    } catch (error) {
      console.error('Error completing onboarding:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1: return formData.actorType !== '';
      case 2: return formData.experience !== '';
      case 3: return formData.goals.length > 0;
      default: return true;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Content */}
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
        <div className="flex-1 flex items-center justify-center px-4 py-10">
          <AnimatePresence mode="wait">
            {/* Step 0: Welcome */}
            {currentStep === 0 && (
              <WelcomeStep key="welcome" onNext={nextStep} />
            )}

            {/* Step 1: Actor Type */}
            {currentStep === 1 && (
              <ActorTypeStep
                key="actor-type"
                selected={formData.actorType}
                onSelect={(type) => updateFormData('actorType', type)}
                onNext={nextStep}
                onBack={prevStep}
              />
            )}

            {/* Step 2: Experience */}
            {currentStep === 2 && (
              <ExperienceStep
                key="experience"
                selected={formData.experience}
                onSelect={(exp) => updateFormData('experience', exp)}
                onNext={nextStep}
                onBack={prevStep}
              />
            )}

            {/* Step 3: Goals */}
            {currentStep === 3 && (
              <GoalsStep
                key="goals"
                selected={formData.goals}
                onToggle={toggleGoal}
                onNext={nextStep}
                onBack={prevStep}
              />
            )}

            {/* Step 4: Recommendations */}
            {currentStep === 4 && (
              <RecommendationsStep
                key="recommendations"
                preferences={formData}
                onComplete={completeOnboarding}
                isLoading={isLoading}
              />
            )}

            {/* Step 5: Complete */}
            {currentStep === 5 && (
              <CompleteStep key="complete" />
            )}
          </AnimatePresence>
        </div>

        {/* Navigation */}
        {currentStep > 0 && currentStep < 4 && (
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
    </div>
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
        Your AI-powered acting coach. Let's personalize your experience
        <br />
        to help you become the actor you've always dreamed of being.
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
        Let's Get Started
        <Zap className="w-6 h-6" />
      </motion.button>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="text-xs text-muted-foreground mt-8 uppercase tracking-[0.2em]"
      >
        Takes less than 2 minutes
      </motion.p>
    </motion.div>
  );
}

// Actor Type Step
function ActorTypeStep({
  selected,
  onSelect,
  onNext,
  onBack
}: {
  selected: string;
  onSelect: (type: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const types = [
    {
      id: 'theater',
      label: 'Theater',
      icon: Theater,
      color: 'from-purple-500 to-indigo-500',
      description: 'Stage performance and live acting'
    },
    {
      id: 'film',
      label: 'Film & TV',
      icon: Film,
      color: 'from-pink-500 to-rose-500',
      description: 'On-camera work for screen'
    },
    {
      id: 'voice',
      label: 'Voice Acting',
      icon: Mic,
      color: 'from-cyan-500 to-blue-500',
      description: 'Animation, audiobooks, and VO'
    },
    {
      id: 'student',
      label: 'Student',
      icon: GraduationCap,
      color: 'from-amber-500 to-orange-500',
      description: 'Learning and training'
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.3 }}
      className="max-w-4xl w-full"
    >
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
        className="text-muted-foreground text-center mb-12 text-sm md:text-base"
      >
        This helps us recommend the best content for you
      </motion.p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {types.map((type, index) => {
          const Icon = type.icon;
          const isSelected = selected === type.id;

          return (
            <motion.button
              key={type.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.03, y: -5 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelect(type.id)}
              className={`relative p-8 rounded-2xl border transition-all duration-300 bg-card ${
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

              <div className="w-20 h-20 rounded-2xl border border-border flex items-center justify-center mb-6 mx-auto bg-muted">
                <Icon className="w-10 h-10 text-primary" />
              </div>

              <h3 className="text-2xl font-bold text-foreground mb-2">
                {type.label}
              </h3>
              <p className="text-muted-foreground">
                {type.description}
              </p>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

// Experience Step
function ExperienceStep({
  selected,
  onSelect,
  onNext,
  onBack
}: {
  selected: string;
  onSelect: (exp: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const levels = [
    {
      id: 'beginner',
      label: 'Beginner',
      emoji: '🌱',
      description: 'Just starting my acting journey'
    },
    {
      id: 'intermediate',
      label: 'Intermediate',
      emoji: '🎭',
      description: 'Some training and experience'
    },
    {
      id: 'professional',
      label: 'Professional',
      emoji: '⭐',
      description: 'Working actor with credits'
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.3 }}
      className="max-w-3xl w-full"
    >
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
        className="text-muted-foreground text-center mb-12 text-sm md:text-base"
      >
        We'll match you with content at the right difficulty
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
              className={`w-full p-6 rounded-2xl border bg-card transition-all duration-300 flex items-center gap-6 ${
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
                  className="w-10 h-10 bg-white rounded-full flex items-center justify-center"
                >
                  <Check className="w-6 h-6 text-purple-600" />
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

// Goals Step
function GoalsStep({
  selected,
  onToggle,
  onNext,
  onBack
}: {
  selected: string[];
  onToggle: (goal: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const goals = [
    {
      id: 'audition',
      label: 'Audition Prep',
      icon: Target,
      description: 'Preparing for upcoming auditions'
    },
    {
      id: 'class',
      label: 'Class Material',
      icon: BookOpen,
      description: 'Working on pieces for acting class'
    },
    {
      id: 'repertoire',
      label: 'Building Repertoire',
      icon: TrendingUp,
      description: 'Expanding my monologue collection'
    },
    {
      id: 'exploring',
      label: 'Just Exploring',
      icon: Search,
      description: 'Browsing and discovering new pieces'
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.3 }}
      className="max-w-4xl w-full"
    >
      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl md:text-4xl font-bold text-foreground text-center mb-4"
      >
        What are you working on?
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-muted-foreground text-center mb-12 text-sm md:text-base"
      >
        Select all that apply - we'll tailor your experience
      </motion.p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {goals.map((goal, index) => {
          const Icon = goal.icon;
          const isSelected = selected.includes(goal.id);

          return (
            <motion.button
              key={goal.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onToggle(goal.id)}
              className={`relative p-6 rounded-2xl border bg-card transition-all duration-300 text-left ${
                isSelected
                  ? 'border-primary shadow-md'
                  : 'border-border hover:border-primary/60'
              }`}
            >
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-3 right-3 w-7 h-7 bg-primary text-primary-foreground rounded-full flex items-center justify-center"
                >
                  <Check className="w-4 h-4" />
                </motion.div>
              )}

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl border border-border bg-muted flex items-center justify-center flex-shrink-0">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    {goal.label}
                  </h3>
                  <p className="text-muted-foreground text-xs">
                    {goal.description}
                  </p>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

// Recommendations Step
function RecommendationsStep({
  preferences,
  onComplete,
  isLoading
}: {
  preferences: any;
  onComplete: () => void;
  isLoading: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.3 }}
      className="max-w-3xl w-full text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2 }}
        className="mb-8 inline-block"
      >
        <div className="w-24 h-24 rounded-full border border-border bg-card flex items-center justify-center shadow-sm">
          <Star className="w-12 h-12 text-primary" />
        </div>
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-3xl md:text-4xl font-bold text-foreground mb-4"
      >
        Perfect! We're preparing your
        <br />
        personalized recommendations
      </motion.h2>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-muted-foreground text-sm md:text-base mb-12"
      >
        Based on your preferences, we're curating the best monologues and scenes for you
      </motion.p>

      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onComplete}
        disabled={isLoading}
        className="px-10 py-4 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 rounded-xl font-semibold text-base md:text-lg transition flex items-center gap-3 mx-auto"
      >
        {isLoading ? (
          <>
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-white" />
            Setting up...
          </>
        ) : (
          <>
            Complete Setup
            <ChevronRight className="w-6 h-6" />
          </>
        )}
      </motion.button>
    </motion.div>
  );
}

// Complete Step
function CompleteStep() {
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
        <div className="w-32 h-32 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center shadow-2xl">
          <Check className="w-16 h-16 text-white" />
        </div>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-6xl font-bold text-white mb-6"
      >
        You're All Set! 🎉
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="text-2xl text-purple-200 mb-8"
      >
        Welcome to ActorRise! Your personalized dashboard
        <br />
        is ready with recommendations just for you.
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="flex items-center justify-center gap-2 text-purple-300"
      >
        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-purple-300" />
        <span>Redirecting to your dashboard...</span>
      </motion.div>
    </motion.div>
  );
}
