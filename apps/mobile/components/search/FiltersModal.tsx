import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AGE_RANGES,
  DIFFICULTIES,
  EMOTIONS,
  GENDER_OPTIONS,
  MAX_DURATIONS,
  THEMES,
  TONES,
} from '@/lib/filter-options';

import { FilterChipRow } from './FilterChipRow';

import type { SearchFilters } from '@actorrise/types';

interface FiltersModalProps {
  visible: boolean;
  initial: SearchFilters;
  onClose: () => void;
  onApply: (filters: SearchFilters) => void;
}

export function FiltersModal({ visible, initial, onClose, onApply }: FiltersModalProps) {
  const [draft, setDraft] = useState<SearchFilters>(initial);

  function reset() {
    const cleared: SearchFilters = { q: initial.q };
    setDraft(cleared);
    onApply(cleared);
    onClose();
  }

  function apply() {
    onApply(draft);
    onClose();
  }

  const activeCount = countActive(draft);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <View className="flex-row items-center justify-between px-5 py-3 border-b border-border">
          <Pressable onPress={onClose} className="active:opacity-60">
            <Text className="text-base text-muted-foreground">Cancel</Text>
          </Pressable>
          <Text className="text-base font-semibold text-foreground">Filters</Text>
          <Pressable onPress={reset} className="active:opacity-60">
            <Text className="text-base text-muted-foreground">Clear</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingVertical: 16, paddingHorizontal: 20 }}>
          <Section title="Character" count={countOf(draft, ['gender', 'age_range'])}>
            <Field label="Gender">
              <FilterChipRow
                options={GENDER_OPTIONS.filter((g) => g !== 'any')}
                selected={draft.gender as never}
                onSelect={(g) => setDraft((d) => ({ ...d, gender: g }))}
              />
            </Field>
            <Field label="Age range">
              <FilterChipRow
                options={AGE_RANGES}
                selected={draft.age_range as never}
                onSelect={(a) => setDraft((d) => ({ ...d, age_range: a }))}
              />
            </Field>
          </Section>

          <Section title="Mood" count={countOf(draft, ['emotion', 'tone', 'theme'])}>
            <Field label="Emotion">
              <FilterChipRow
                options={EMOTIONS}
                selected={draft.emotion as never}
                onSelect={(e) => setDraft((d) => ({ ...d, emotion: e }))}
              />
            </Field>
            <Field label="Tone">
              <FilterChipRow
                options={TONES}
                selected={draft.tone as never}
                onSelect={(t) => setDraft((d) => ({ ...d, tone: t }))}
              />
            </Field>
            <Field label="Theme">
              <FilterChipRow
                options={THEMES}
                selected={draft.theme as never}
                onSelect={(t) => setDraft((d) => ({ ...d, theme: t }))}
              />
            </Field>
          </Section>

          <Section title="Practical" count={countOf(draft, ['difficulty', 'max_duration'])}>
            <Field label="Difficulty">
              <FilterChipRow
                options={DIFFICULTIES}
                selected={draft.difficulty as never}
                onSelect={(diff) => setDraft((d) => ({ ...d, difficulty: diff }))}
              />
            </Field>
            <Field label="Max duration">
              <FilterChipRow
                options={MAX_DURATIONS.map((d) => d.label)}
                selected={
                  MAX_DURATIONS.find((d) => d.seconds === draft.max_duration)?.label
                }
                onSelect={(label) => {
                  const found = MAX_DURATIONS.find((d) => d.label === label);
                  setDraft((d) => ({ ...d, max_duration: found?.seconds }));
                }}
              />
            </Field>
          </Section>
        </ScrollView>

        <View className="px-5 py-3 border-t border-border">
          <Pressable
            onPress={apply}
            className="bg-brand rounded-xl py-3.5 items-center justify-center active:opacity-80">
            <Text className="text-white font-semibold text-base">
              {activeCount > 0
                ? `Apply ${activeCount} filter${activeCount === 1 ? '' : 's'}`
                : 'Apply filters'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-6">
      <View className="flex-row items-center mb-3">
        <Text className="text-base font-semibold text-foreground">{title}</Text>
        {count > 0 ? (
          <View className="ml-2 bg-brand/15 px-2 py-0.5">
            <Text className="text-xs font-semibold text-brand">{count}</Text>
          </View>
        ) : null}
      </View>
      <View className="gap-3">{children}</View>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Text className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
        {label}
      </Text>
      {children}
    </View>
  );
}

function countActive(f: SearchFilters): number {
  let n = 0;
  if (f.gender) n++;
  if (f.age_range) n++;
  if (f.emotion) n++;
  if (f.tone) n++;
  if (f.theme) n++;
  if (f.difficulty) n++;
  if (f.max_duration) n++;
  return n;
}

function countOf(f: SearchFilters, keys: (keyof SearchFilters)[]): number {
  return keys.reduce((acc, k) => (f[k] ? acc + 1 : acc), 0);
}
