import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { MultiSelect } from '@/components/ui/MultiSelect';
import { Select } from '@/components/ui/Select';
import { type ActorProfile, useProfile, useSaveProfile } from '@/hooks/use-profile';
import {
  ACTOR_TYPES,
  AGE_RANGES,
  BUILDS,
  ETHNICITIES,
  EXPERIENCE_LEVELS,
  GENDERS,
  HEIGHT_FEET,
  HEIGHT_INCHES,
  LOCATIONS,
  PREFERRED_GENRES,
  TRAINING_BACKGROUNDS,
  UNION_STATUSES,
} from '@/lib/profile-options';

const EXP_VALUES = EXPERIENCE_LEVELS.map((e) => e.value);
const EXP_HELPER: Record<string, string> = Object.fromEntries(
  EXPERIENCE_LEVELS.map((e) => [e.value, e.helper]),
);

export function ProfileForm() {
  const { data: initial } = useProfile();
  const save = useSaveProfile();

  const [name, setName] = useState(initial?.name ?? '');
  const [ageRange, setAgeRange] = useState<string | undefined>(initial?.age_range);
  const [gender, setGender] = useState<string | undefined>(initial?.gender);
  const [ethnicity, setEthnicity] = useState<string | undefined>(initial?.ethnicity);
  const [heightFeet, setHeightFeet] = useState<string | undefined>(
    parseHeight(initial?.height)?.feet,
  );
  const [heightInches, setHeightInches] = useState<string | undefined>(
    parseHeight(initial?.height)?.inches,
  );
  const [build, setBuild] = useState<string | undefined>(initial?.build);
  const [location, setLocation] = useState<string | undefined>(initial?.location);
  const [experience, setExperience] = useState<string | undefined>(initial?.experience_level);
  const [training, setTraining] = useState<string | undefined>(initial?.training_background);
  const [union, setUnion] = useState<string | undefined>(initial?.union_status);
  const [types, setTypes] = useState<string[]>(initial?.type ?? []);
  const [genres, setGenres] = useState<string[]>(initial?.preferred_genres ?? []);

  const canSubmit = name.trim().length > 0 && !!ageRange && !!gender && !!experience && !!union && !save.isPending;

  async function submit() {
    if (!canSubmit) return;
    const profile: ActorProfile = {
      name: name.trim(),
      age_range: ageRange,
      gender,
      ethnicity,
      height: heightFeet && heightInches ? `${heightFeet}'${heightInches}"` : undefined,
      build,
      location,
      experience_level: experience,
      training_background: training,
      union_status: union,
      type: types,
      preferred_genres: genres,
      overdone_alert_sensitivity: initial?.overdone_alert_sensitivity ?? 0.5,
      profile_bias_enabled: initial?.profile_bias_enabled ?? true,
    };
    await save.mutateAsync({ profile, isNew: !initial });
    router.back();
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        <Section title="Required">
          <Field label="Name" required>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your full name"
              placeholderTextColor="#A1A1AA"
              className="border border-border bg-card rounded-xl px-4 py-3 text-base text-foreground"
            />
          </Field>
          <Select label="Age range" required value={ageRange} options={AGE_RANGES} onChange={setAgeRange} />
          <Select label="Gender identity" required value={gender} options={GENDERS} onChange={setGender} />
          <Select
            label="Experience level"
            required
            value={experience}
            options={EXP_VALUES}
            onChange={setExperience}
            renderOption={(opt) => ({ label: opt, helper: EXP_HELPER[opt] })}
          />
          <Select label="Union status" required value={union} options={UNION_STATUSES} onChange={setUnion} />
        </Section>

        <Section title="About you">
          <Select label="Ethnicity" value={ethnicity} options={ETHNICITIES} onChange={setEthnicity} />
          <View>
            <Text className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
              Height
            </Text>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Select
                  label="Feet"
                  value={heightFeet}
                  options={HEIGHT_FEET.map(String) as readonly string[]}
                  placeholder="ft"
                  onChange={setHeightFeet}
                />
              </View>
              <View className="flex-1">
                <Select
                  label="Inches"
                  value={heightInches}
                  options={HEIGHT_INCHES.map(String) as readonly string[]}
                  placeholder="in"
                  onChange={setHeightInches}
                />
              </View>
            </View>
          </View>
          <Select label="Build" value={build} options={BUILDS} onChange={setBuild} />
          <Select label="Location / market" value={location} options={LOCATIONS} onChange={setLocation} />
        </Section>

        <Section title="Acting profile">
          <MultiSelect label="Actor types" options={ACTOR_TYPES} selected={types} onChange={setTypes} />
          <Select label="Training background" value={training} options={TRAINING_BACKGROUNDS} onChange={setTraining} />
          <MultiSelect label="Preferred genres" options={PREFERRED_GENRES} selected={genres} onChange={setGenres} />
        </Section>

        {save.error ? (
          <Text className="text-sm text-red-600 mb-4">{save.error.message}</Text>
        ) : null}

        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          className={`rounded-xl py-3.5 items-center justify-center active:opacity-80 ${
            canSubmit ? 'bg-brand' : 'bg-brand/40'
          }`}>
          {save.isPending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-white font-semibold text-base">Save profile</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-6">
      <Text className="text-base font-semibold text-foreground mb-4 mt-4">{title}</Text>
      <View className="gap-4">{children}</View>
    </View>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Text className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
        {label}
        {required ? ' *' : ''}
      </Text>
      {children}
    </View>
  );
}

function parseHeight(s: string | undefined): { feet: string; inches: string } | undefined {
  if (!s) return undefined;
  const match = s.match(/^(\d+)'(\d+)"$/);
  if (!match) return undefined;
  return { feet: match[1], inches: match[2] };
}
