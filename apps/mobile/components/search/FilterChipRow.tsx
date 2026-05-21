import { Pressable, ScrollView, Text } from 'react-native';

interface FilterChipRowProps<T extends string> {
  options: readonly T[];
  selected: T | undefined;
  onSelect: (next: T | undefined) => void;
  /** Optional label shown for the "Any" / clear-selection chip. Defaults to "Any". */
  clearLabel?: string;
}

/**
 * Horizontally scrollable chip selector. Tap a selected chip to clear it.
 * Sharp corners on the chip itself (it's a tag, not a button) per the
 * project UI memory — but the underlying Pressable still has a pressed
 * state for feedback.
 */
export function FilterChipRow<T extends string>({
  options,
  selected,
  onSelect,
  clearLabel = 'Any',
}: FilterChipRowProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 1, gap: 8 }}>
      <Chip
        active={selected === undefined}
        label={clearLabel}
        onPress={() => onSelect(undefined)}
      />
      {options.map((opt) => (
        <Chip
          key={opt}
          active={selected === opt}
          label={prettify(opt)}
          onPress={() => onSelect(selected === opt ? undefined : opt)}
        />
      ))}
    </ScrollView>
  );
}

function Chip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`px-3.5 py-2 border ${
        active ? 'bg-brand border-brand' : 'bg-card border-border'
      } active:opacity-70`}>
      <Text
        className={`text-sm font-medium ${
          active ? 'text-white' : 'text-foreground'
        }`}>
        {label}
      </Text>
    </Pressable>
  );
}

function prettify(s: string): string {
  return s.replace(/-/g, ' ').replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}
