"use client";

import type { DirectionFilter as Value } from "@/lib/scan/scanner";
import { Select } from "../ui/Select";

/**
 * §6.3: "Ascending (+ symmetrical)" includes both subtypes of ascending. The
 * subtype is a shape tag; a symmetrical-shaped pattern with a descending pole
 * belongs under Descending.
 */
const OPTIONS: ReadonlyArray<{ value: Value; label: string }> = [
  { value: "all", label: "Any direction" },
  { value: "ascending", label: "Ascending (+ symmetrical)" },
  { value: "descending", label: "Descending" },
];

export function DirectionFilter({
  value,
  onChange,
}: {
  value: Value;
  onChange: (v: Value) => void;
}) {
  return (
    <Select
      label="Direction"
      value={value}
      options={OPTIONS}
      onChange={onChange}
    />
  );
}
