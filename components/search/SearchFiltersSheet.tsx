"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IconX, IconChevronDown, IconUser, IconMoodSmile, IconSettings } from "@tabler/icons-react";
import { FreshnessToggle } from "@/components/search/FreshnessToggle";
import { motion, AnimatePresence } from "framer-motion";

export type SearchFiltersState = {
  gender: string;
  age_range: string;
  emotion: string;
  theme: string;
  category: string;
  tone: string;
  difficulty: string;
  author: string;
  max_duration: string;
};

const DURATION_OPTIONS = [
  { value: "60", label: "1 min" },
  { value: "90", label: "1.5 min" },
  { value: "120", label: "2 min" },
  { value: "180", label: "3 min" },
  { value: "300", label: "5 min" },
];

export const getDurationLabel = (seconds: string) =>
  DURATION_OPTIONS.find((d) => d.value === seconds)?.label ?? `${seconds}s`;

const CHARACTER_FILTERS = [
  { key: "gender" as const, label: "Gender", options: ["male", "female", "non-binary", "any"] },
  { key: "age_range" as const, label: "Age Range", options: ["teens", "20s", "30s", "40s", "50s", "60+"] },
];

const MOOD_FILTERS = [
  { key: "emotion" as const, label: "Emotion", options: ["joy", "sadness", "anger", "fear", "melancholy", "hope"] },
  { key: "tone" as const, label: "Tone", options: ["dramatic", "comedic", "dark", "romantic", "philosophical", "contemplative"] },
  { key: "theme" as const, label: "Theme", options: ["love", "death", "betrayal", "identity", "power", "revenge"] },
];

const PRACTICAL_KEYS = ["difficulty", "category", "author", "max_duration"] as const;

export interface SearchFiltersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: SearchFiltersState;
  setFilters: (f: SearchFiltersState | ((prev: SearchFiltersState) => SearchFiltersState)) => void;
  maxOverdoneScore: number;
  setMaxOverdoneScore: (v: number) => void;
}

function CollapsibleSection({
  title,
  icon: Icon,
  activeCount,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  activeCount: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border/40 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-3.5 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 text-foreground/60" />
          <span className="text-foreground">{title}</span>
          {activeCount > 0 && (
            <span className="flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold dark:text-orange-400">
              {activeCount}
            </span>
          )}
        </div>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <IconChevronDown className="h-4 w-4 text-muted-foreground" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="pb-4 space-y-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<string | { value: string; label: string }>;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select
        value={value || "__none__"}
        onValueChange={(v) => onChange(v === "__none__" ? "" : v)}
      >
        <SelectTrigger className="min-h-[48px] px-4 py-3 text-base">
          <SelectValue placeholder="Any" />
        </SelectTrigger>
        <SelectContent side="bottom" sideOffset={4}>
          <SelectItem value="__none__">Any</SelectItem>
          {options.map((opt) =>
            typeof opt === "string" ? (
              <SelectItem key={opt} value={opt} className="capitalize">{opt}</SelectItem>
            ) : (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            )
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

export function SearchFiltersSheet({
  open,
  onOpenChange,
  filters,
  setFilters,
  maxOverdoneScore,
  setMaxOverdoneScore,
}: SearchFiltersSheetProps) {
  const countActive = (keys: readonly string[]) =>
    keys.filter((k) => filters[k as keyof SearchFiltersState] !== "").length;

  const characterCount = countActive(["gender", "age_range"]);
  const moodCount = countActive(["emotion", "tone", "theme"]);
  const practicalCount = countActive(PRACTICAL_KEYS) + (maxOverdoneScore < 1 ? 1 : 0);
  const totalActive = characterCount + moodCount + practicalCount;

  const clearAll = () => {
    setFilters({ gender: "", age_range: "", emotion: "", theme: "", category: "", tone: "", difficulty: "", author: "", max_duration: "" });
    setMaxOverdoneScore(1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="fixed left-0 right-0 bottom-0 top-auto translate-x-0 translate-y-0 rounded-t-2xl rounded-b-none max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0 bg-background border-t border-x border-border shadow-[0_-4px_24px_rgba(0,0,0,0.2)] md:left-[50%] md:right-auto md:bottom-auto md:top-[50%] md:translate-x-[-50%] md:translate-y-[-50%] md:rounded-lg md:max-h-[90vh] md:p-6 md:border md:shadow-lg"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="p-4 pb-2 md:p-0 md:pb-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">Filters</DialogTitle>
            {totalActive > 0 && (
              <span className="flex items-center justify-center h-6 min-w-[24px] px-2 rounded-full bg-primary/15 text-primary text-xs font-bold dark:text-orange-400">
                {totalActive}
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-4 pb-4 md:px-0">
          <CollapsibleSection title="Character" icon={IconUser} activeCount={characterCount} defaultOpen>
            {CHARACTER_FILTERS.map(({ key, label, options }) => (
              <FilterSelect
                key={key}
                label={label}
                value={filters[key]}
                onChange={(v) => setFilters({ ...filters, [key]: v })}
                options={options}
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection title="Mood & Style" icon={IconMoodSmile} activeCount={moodCount}>
            {MOOD_FILTERS.map(({ key, label, options }) => (
              <FilterSelect
                key={key}
                label={label}
                value={filters[key]}
                onChange={(v) => setFilters({ ...filters, [key]: v })}
                options={options}
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection title="Practical" icon={IconSettings} activeCount={practicalCount}>
            <FilterSelect
              label="Category"
              value={filters.category}
              onChange={(v) => setFilters({ ...filters, category: v })}
              options={["classical", "contemporary"]}
            />
            <FilterSelect
              label="Difficulty"
              value={filters.difficulty}
              onChange={(v) => setFilters({ ...filters, difficulty: v })}
              options={["beginner", "intermediate", "advanced"]}
            />
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Author</Label>
              <input
                type="text"
                placeholder="Shakespeare"
                value={filters.author}
                onChange={(e) => setFilters({ ...filters, author: e.target.value })}
                className="w-full min-h-[48px] px-4 py-3 text-base rounded-lg border border-input bg-background"
              />
            </div>
            <FilterSelect
              label="Max Duration"
              value={filters.max_duration}
              onChange={(v) => setFilters({ ...filters, max_duration: v })}
              options={DURATION_OPTIONS}
            />
            <div className="pt-2 mt-1 border-t border-border/30">
              <FreshnessToggle value={maxOverdoneScore} onChange={setMaxOverdoneScore} />
            </div>
          </CollapsibleSection>

          {/* Active filter summary */}
          {totalActive > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-3 mt-1">
              {Object.entries(filters)
                .filter(([, v]) => v !== "")
                .map(([key, value]) => (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-muted/80 text-foreground border border-border/40 capitalize"
                  >
                    <span className="text-muted-foreground">{key.replace(/_/g, " ")}:</span> {key === "max_duration" ? getDurationLabel(value) : value}
                    <button
                      type="button"
                      onClick={() => setFilters({ ...filters, [key]: "" })}
                      className="ml-0.5 hover:text-destructive min-w-[44px] min-h-[44px] flex items-center justify-center rounded -m-1"
                    >
                      <IconX className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              {maxOverdoneScore < 1 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-muted/80 text-foreground border border-border/40">
                  <span className="text-muted-foreground">originality:</span> {maxOverdoneScore <= 0.3 ? "Fresh picks" : "Popular too"}
                  <button
                    type="button"
                    onClick={() => setMaxOverdoneScore(1)}
                    className="ml-0.5 hover:text-destructive min-w-[44px] min-h-[44px] flex items-center justify-center rounded -m-1"
                  >
                    <IconX className="h-3 w-3" />
                  </button>
                </span>
              )}
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 min-h-[44px] px-2"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-3 p-4 pt-2 border-t md:pt-4">
          <Button
            variant="outline"
            className="flex-1 min-h-[48px]"
            onClick={clearAll}
          >
            Clear
          </Button>
          <Button
            className="flex-1 min-h-[48px]"
            onClick={() => onOpenChange(false)}
          >
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
