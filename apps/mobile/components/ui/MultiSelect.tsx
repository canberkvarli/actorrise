import { Pressable, Text, View } from 'react-native';

interface MultiSelectProps<T extends string> {
  label: string;
  options: readonly T[];
  selected: readonly T[];
  onChange: (next: T[]) => void;
}

export function MultiSelect<T extends string>({
  label,
  options,
  selected,
  onChange,
}: MultiSelectProps<T>) {
  function toggle(opt: T) {
    const next = selected.includes(opt)
      ? selected.filter((s) => s !== opt)
      : [...selected, opt];
    onChange(next);
  }

  return (
    <View>
      <Text className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((opt) => {
          const isSelected = selected.includes(opt);
          return (
            <Pressable
              key={opt}
              onPress={() => toggle(opt)}
              className={`px-3.5 py-2 border active:opacity-70 ${
                isSelected ? 'bg-brand border-brand' : 'bg-card border-border'
              }`}>
              <Text
                className={`text-sm font-medium ${
                  isSelected ? 'text-white' : 'text-foreground'
                }`}>
                {prettify(opt)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function prettify(s: string): string {
  return s.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}
