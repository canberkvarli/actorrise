"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { SCRIPT_GENRES } from "@/lib/genreOptions";

interface GenreSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function GenreSelect({ value, onValueChange, placeholder = "Select genre", className }: GenreSelectProps) {
  const [isCustom, setIsCustom] = React.useState(false);
  const [customValue, setCustomValue] = React.useState("");

  // Check if current value is a predefined genre
  React.useEffect(() => {
    const isPredefined = SCRIPT_GENRES.includes(value as any);
    setIsCustom(!isPredefined && value !== "");
    if (!isPredefined && value !== "") {
      setCustomValue(value);
    }
  }, [value]);

  const handleSelectChange = (newValue: string) => {
    if (newValue === "custom") {
      setIsCustom(true);
      setCustomValue(value || "");
    } else {
      setIsCustom(false);
      onValueChange(newValue);
    }
  };

  const handleCustomBlur = () => {
    if (customValue.trim()) {
      onValueChange(customValue.trim());
    } else {
      setIsCustom(false);
      onValueChange("");
    }
  };

  const handleCustomKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCustomBlur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsCustom(false);
      setCustomValue("");
    }
  };

  if (isCustom) {
    return (
      <div className="flex items-center gap-2">
        <Input
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          onBlur={handleCustomBlur}
          onKeyDown={handleCustomKeyDown}
          placeholder="Enter custom genre"
          className={className}
          autoFocus
        />
        <button
          type="button"
          onClick={() => {
            setIsCustom(false);
            setCustomValue("");
          }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={handleSelectChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {SCRIPT_GENRES.map((genre) => (
            <SelectItem key={genre} value={genre}>
              {genre}
            </SelectItem>
          ))}
          <SelectItem value="custom">
            <span className="text-muted-foreground italic">Custom...</span>
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
