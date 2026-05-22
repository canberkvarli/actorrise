import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface SelectProps<T extends string> {
  label: string;
  required?: boolean;
  value: T | undefined;
  options: readonly T[];
  placeholder?: string;
  onChange: (value: T | undefined) => void;
  renderOption?: (option: T) => { label: string; helper?: string };
}

export function Select<T extends string>({
  label,
  required,
  value,
  options,
  placeholder = 'Select',
  onChange,
  renderOption,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);

  const shown = value ?? '';

  return (
    <View>
      <Text className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
        {label}
        {required ? ' *' : ''}
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        className="border border-border bg-card rounded-xl px-4 py-3 flex-row items-center justify-between active:opacity-70">
        <Text
          className={`text-base ${value ? 'text-foreground' : 'text-muted-foreground/70'}`}
          numberOfLines={1}>
          {shown || placeholder}
        </Text>
        <Text className="text-muted-foreground text-base">›</Text>
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}>
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
          <View className="flex-row items-center justify-between px-5 py-3 border-b border-border">
            <Pressable onPress={() => setOpen(false)}>
              <Text className="text-base text-muted-foreground">Cancel</Text>
            </Pressable>
            <Text className="text-base font-semibold text-foreground">{label}</Text>
            <Pressable
              onPress={() => {
                onChange(undefined);
                setOpen(false);
              }}>
              <Text className="text-base text-muted-foreground">Clear</Text>
            </Pressable>
          </View>
          <ScrollView>
            {options.map((opt) => {
              const rendered = renderOption?.(opt) ?? { label: opt };
              const selected = opt === value;
              return (
                <Pressable
                  key={opt}
                  onPress={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                  className={`px-5 py-4 border-b border-border active:opacity-60 ${
                    selected ? 'bg-brand/5' : ''
                  }`}>
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text
                        className={`text-base ${
                          selected ? 'text-brand font-semibold' : 'text-foreground'
                        }`}>
                        {rendered.label}
                      </Text>
                      {rendered.helper ? (
                        <Text className="text-xs text-muted-foreground mt-0.5">
                          {rendered.helper}
                        </Text>
                      ) : null}
                    </View>
                    {selected ? <Text className="text-brand text-lg">✓</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
