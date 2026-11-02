"use client";

import { motion } from "framer-motion";
import { IconX } from "@tabler/icons-react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FreshnessToggle } from "@/components/search/FreshnessToggle";
import { useT, type MessageKey } from "@/lib/i18n";

/** The nine free-text/select filters the search page keeps in one state object. */
export type SearchFilters = {
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

export const EMPTY_FILTERS: SearchFilters = {
  gender: "",
  age_range: "",
  emotion: "",
  theme: "",
  category: "",
  tone: "",
  difficulty: "",
  author: "",
  max_duration: "",
};

/* Values are what the backend filters on and stay English; only the label
   shown beside them is translated (appMonologueFilters.opt.<value>). */
type Option = string | { value: string; label: MessageKey };
type Group = { key: keyof SearchFilters; label: MessageKey; options: Option[] };

/** Character | Mood & Style | Practical — the three columns, as data. */
const CHARACTER: Group[] = [
  { key: "gender", label: "appMonologueFilters.gender", options: ["male", "female", "any"] },
  { key: "age_range", label: "appMonologueFilters.ageRange", options: ["teens", "20s", "30s", "40s", "50s", "60+"] },
];

const MOOD: Group[] = [
  { key: "emotion", label: "appMonologueFilters.emotion", options: ["joy", "sadness", "anger", "fear", "melancholy", "hope"] },
  { key: "tone", label: "appMonologueFilters.tone", options: ["dramatic", "comedic", "dark", "romantic", "philosophical", "contemplative"] },
  { key: "theme", label: "appMonologueFilters.theme", options: ["love", "death", "betrayal", "identity", "power", "revenge"] },
];

const PRACTICAL: Group[] = [
  { key: "category", label: "appMonologueFilters.category", options: ["classical", "contemporary"] },
  { key: "difficulty", label: "appMonologueFilters.difficulty", options: ["beginner", "intermediate", "advanced"] },
  {
    key: "max_duration",
    label: "appMonologueFilters.maxDuration",
    options: [
      { value: "60", label: "appMonologueFilters.min1" },
      { value: "90", label: "appMonologueFilters.min15" },
      { value: "120", label: "appMonologueFilters.min2" },
      { value: "180", label: "appMonologueFilters.min3" },
      { value: "300", label: "appMonologueFilters.min5" },
    ],
  },
];

const ALL_GROUPS = [...CHARACTER, ...MOOD, ...PRACTICAL];

interface SearchFiltersPanelProps {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  /** 0 = freshest only … 1 = show everything. Lives outside `filters` on purpose. */
  maxOverdoneScore: number;
  onMaxOverdoneScoreChange: (next: number) => void;
  /** Non-empty filter entries, already computed by the page. */
  activeFilters: [string, string][];
  hasFreshnessFilter: boolean;
  /** "max duration: 2 min" — the page owns the duration-label lookup. */
  getFilterDisplay: (key: string, value: string) => string;
  /** Wrapper classes. Defaults to the standalone card; a modal passes its own
   *  so the panel doesn't draw a second border inside the dialog. */
  className?: string;
}

/**
 * The desktop filter panel that expands under the search bar. Presentational:
 * every value comes in as a prop and every change goes straight back out, so
 * the search page stays the single owner of filter state.
 */
export function SearchFiltersPanel({
  filters,
  onChange,
  maxOverdoneScore,
  onMaxOverdoneScoreChange,
  activeFilters,
  hasFreshnessFilter,
  getFilterDisplay,
  className = "hidden md:block mt-4 p-4 bg-card border border-border rounded-lg",
}: SearchFiltersPanelProps) {
  const t = useT();
  const set = (key: keyof SearchFilters, value: string) =>
    onChange({ ...filters, [key]: value });

  /** A string option's label, or the raw value when the dictionary has none. */
  const optLabel = (value: string) => {
    const key = `appMonologueFilters.opt.${value}` as MessageKey;
    const label = t(key);
    return label === key ? value : label;
  };

  /** The chip's "gender: Female", with both halves in the reader's language. */
  const chipKey = (key: string) => {
    const group = ALL_GROUPS.find((g) => g.key === key);
    return group ? t(group.label) : key.replace(/_/g, " ");
  };
  const chipValue = (key: string, value: string) => {
    const group = ALL_GROUPS.find((g) => g.key === key);
    const opt = group?.options.find((o) => (typeof o === "string" ? o : o.value) === value);
    if (opt === undefined) return getFilterDisplay(key, value).split(": ").pop();
    return typeof opt === "string" ? optLabel(opt) : t(opt.label);
  };

  const renderGroup = (title: string, groups: Group[], extra?: React.ReactNode) => (
    <div className="space-y-2.5">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground/80">{title}</h4>
      {groups.map(({ key, label, options }) => (
        <div key={key} className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">{t(label)}</Label>
          <Select
            value={filters[key] || "__any__"}
            onValueChange={(v) => set(key, v === "__any__" ? "" : v)}
          >
            <SelectTrigger className="w-full h-9 px-2.5 text-sm">
              <SelectValue placeholder={t("appMonologueFilters.any")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">{t("appMonologueFilters.any")}</SelectItem>
              {options.map((opt) =>
                typeof opt === "string" ? (
                  <SelectItem key={opt} value={opt} className="capitalize">
                    {optLabel(opt)}
                  </SelectItem>
                ) : (
                  <SelectItem key={opt.value} value={opt.value}>
                    {t(opt.label)}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
      ))}
      {extra}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className={className}
    >
      <div className="grid grid-cols-3 gap-6">
        {renderGroup(t("appMonologueFilters.character"), CHARACTER)}
        {renderGroup(t("appMonologueFilters.mood"), MOOD)}
        {renderGroup(
          t("appMonologueFilters.practical"),
          PRACTICAL,
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">{t("appMonologueFilters.author")}</Label>
            <input
              type="text"
              placeholder={t("appMonologueFilters.authorPlaceholder")}
              value={filters.author}
              onChange={(e) => set("author", e.target.value)}
              className="w-full h-9 px-2.5 text-sm rounded-md border border-input bg-background"
            />
          </div>,
        )}
      </div>

      {/* Originality toggle — full width below the 3 columns */}
      <div className="mt-4 pt-4 border-t border-border/60">
        <FreshnessToggle value={maxOverdoneScore} onChange={onMaxOverdoneScoreChange} />
      </div>

      {(activeFilters.length > 0 || hasFreshnessFilter) && (
        <div className="flex flex-wrap items-center gap-1.5 mt-4 pt-4 border-t">
          {activeFilters.map(([key, value]) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-muted/80 text-foreground border border-border/40 capitalize"
            >
              <span className="text-muted-foreground">{chipKey(key)}:</span>{" "}
              {chipValue(key, value)}
              <button
                onClick={() => set(key as keyof SearchFilters, "")}
                className="ml-0.5 hover:text-destructive"
              >
                <IconX className="h-3 w-3" />
              </button>
            </span>
          ))}
          {hasFreshnessFilter && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-muted/80 text-foreground border border-border/40">
              <span className="text-muted-foreground">{t("appMonologueFilters.originality")}</span>{" "}
              {maxOverdoneScore <= 0.3 ? t("appMonologueFilters.freshPicks") : t("appMonologueFilters.popularToo")}
              <button
                onClick={() => onMaxOverdoneScoreChange(1)}
                className="ml-0.5 hover:text-destructive"
              >
                <IconX className="h-3 w-3" />
              </button>
            </span>
          )}
          <button
            onClick={() => {
              onChange({ ...EMPTY_FILTERS });
              onMaxOverdoneScoreChange(1);
            }}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            {t("appMonologueFilters.clearAll")}
          </button>
        </div>
      )}
    </motion.div>
  );
}

export default SearchFiltersPanel;
