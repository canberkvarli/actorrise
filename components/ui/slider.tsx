"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Smooth, accessible range slider with filled track and polished thumb.
 * Keeps layout stable; fill and thumb animate smoothly.
 */
const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  (
    {
      className,
      value,
      onValueChange,
      min = 0,
      max = 1,
      step = 0.1,
      disabled,
      ...props
    },
    ref
  ) => {
    const percentage = max > min ? ((value - min) / (max - min)) * 100 : 0;

    return (
      <div className={cn("relative flex h-6 w-full items-center", className)}>
        {/* Track: thin bar centered vertically so thumb aligns on the same centerline */}
        <div
          className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted"
          aria-hidden
        />
        <div
          className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-l-full bg-primary transition-[width] duration-200 ease-out"
          style={{ width: `${percentage}%` }}
          aria-hidden
        />
        <input
          ref={ref}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onValueChange(parseFloat(e.target.value))}
          className={cn(
            "absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto",
            "[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:my-[9px]",
            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:-translate-y-1/2",
            "[&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.25)] [&::-webkit-slider-thumb]:transition-[transform,box-shadow] [&::-webkit-slider-thumb]:duration-150 [&::-webkit-slider-thumb]:ease-out",
            "[&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:hover:shadow-[0_2px_8px_rgba(0,0,0,0.3)] [&::-webkit-slider-thumb]:active:scale-105",
            "[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:bg-transparent [&::-moz-range-track]:rounded-full",
            "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:-translate-y-1/2",
            "[&::-moz-range-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.25)] [&::-moz-range-thumb]:transition-[transform,box-shadow] [&::-moz-range-thumb]:duration-150 [&::-moz-range-thumb]:ease-out",
            "[&::-moz-range-thumb]:hover:scale-110 [&::-moz-range-thumb]:hover:shadow-[0_2px_8px_rgba(0,0,0,0.3)] [&::-moz-range-thumb]:active:scale-105",
            "disabled:pointer-events-none disabled:opacity-50"
          )}
          {...props}
        />
      </div>
    );
  }
);
Slider.displayName = "Slider";

export { Slider };
