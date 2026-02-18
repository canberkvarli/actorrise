"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { IconX, IconInfoCircle } from "@tabler/icons-react";

export type SearchFiltersState = {
  gender: string;
  age_range: string;
  emotion: string;
  theme: string;
  category: string;
};

const FILTER_CONFIG = [
  { key: "gender" as const, label: "Gender", options: ["male", "female", "any"] },
  { key: "age_range" as const, label: "Age Range", options: ["teens", "20s", "30s", "40s", "50s", "60+"] },
  { key: "emotion" as const, label: "Emotion", options: ["joy", "sadness", "anger", "fear", "melancholy", "hope"] },
  { key: "theme" as const, label: "Theme", options: ["love", "death", "betrayal", "identity", "power", "revenge"] },
  { key: "category" as const, label: "Category", options: ["classical", "contemporary"] },
];

const getFreshnessLabel = (score: number) =>
  score <= 0 ? "Freshest only" : score <= 0.3 ? "Fresh" : score <= 0.5 ? "Some overdone OK" : score <= 0.7 ? "More OK" : "Show all";

export interface SearchFiltersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: SearchFiltersState;
  setFilters: (f: SearchFiltersState | ((prev: SearchFiltersState) => SearchFiltersState)) => void;
  maxOverdoneScore: number;
  setMaxOverdoneScore: (v: number) => void;
}

export function SearchFiltersSheet({
  open,
  onOpenChange,
  filters,
  setFilters,
  maxOverdoneScore,
  setMaxOverdoneScore,
}: SearchFiltersSheetProps) {
  const activeFilters = Object.entries(filters).filter(([, value]) => value !== "");
  const hasFreshnessFilter = maxOverdoneScore < 1;
  const clearAll = () => {
    setFilters({ gender: "", age_range: "", emotion: "", theme: "", category: "" });
    setMaxOverdoneScore(1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="fixed left-0 right-0 bottom-0 top-auto translate-x-0 translate-y-0 rounded-t-2xl rounded-b-none max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0 md:left-[50%] md:right-auto md:bottom-auto md:top-[50%] md:translate-x-[-50%] md:translate-y-[-50%] md:rounded-lg md:max-h-[90vh] md:p-6"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="p-4 pb-2 md:p-0 md:pb-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">Filters</DialogTitle>
            {(activeFilters.length > 0 || hasFreshnessFilter) && (
              <Badge variant="secondary" className="text-xs">
                {activeFilters.length + (hasFreshnessFilter ? 1 : 0)}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-4 pb-4 md:px-0 space-y-4">
          {FILTER_CONFIG.map(({ key, label, options }) => (
            <div key={key} className="space-y-2">
              <Label className="text-sm text-muted-foreground">{label}</Label>
              <select
                value={filters[key]}
                onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}
                className="w-full min-h-[48px] px-4 py-3 text-base rounded-lg border border-input bg-background"
              >
                <option value="">Any</option>
                {options.map((opt) => (
                  <option key={opt} value={opt} className="capitalize">
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <div className="pt-4 border-t border-border/80 space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground font-medium">Freshness</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="inline-flex cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-sm" aria-label="Freshness filter info">
                      <IconInfoCircle className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-sm">
                      Filter by how &quot;overdone&quot; a piece is. Lower = only fresher pieces; higher = include well-known ones.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={maxOverdoneScore}
                onChange={(e) => setMaxOverdoneScore(parseFloat(e.target.value))}
                className="flex-1 h-2 rounded-lg appearance-none bg-muted accent-primary"
              />
              <span className="text-sm text-muted-foreground w-28 shrink-0">{getFreshnessLabel(maxOverdoneScore)}</span>
            </div>
          </div>

          {(activeFilters.length > 0 || hasFreshnessFilter) && (
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {activeFilters.map(([key, value]) => (
                <Badge key={key} variant="secondary" className="gap-1 capitalize">
                  {key.replace(/_/g, " ")}: {value}
                  <button
                    type="button"
                    onClick={() => setFilters({ ...filters, [key]: "" })}
                    className="ml-1 hover:text-destructive min-w-[28px] min-h-[28px] flex items-center justify-center rounded"
                  >
                    <IconX className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {hasFreshnessFilter && (
                <Badge variant="secondary" className="gap-1">
                  Freshness: {getFreshnessLabel(maxOverdoneScore)}
                  <button
                    type="button"
                    onClick={() => setMaxOverdoneScore(1)}
                    className="ml-1 hover:text-destructive min-w-[28px] min-h-[28px] flex items-center justify-center rounded"
                  >
                    <IconX className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              <button
                type="button"
                onClick={clearAll}
                className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 min-h-[44px] px-2"
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
