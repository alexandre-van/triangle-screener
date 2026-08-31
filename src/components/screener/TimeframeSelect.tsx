"use client";

import { TIMEFRAMES, type Timeframe } from "@/lib/exchange/types";
import { Select } from "../ui/Select";

export function TimeframeSelect({
  value,
  onChange,
}: {
  value: Timeframe;
  onChange: (tf: Timeframe) => void;
}) {
  return (
    <Select
      label="Timeframe"
      value={value}
      onChange={onChange}
      options={TIMEFRAMES.map((tf) => ({ value: tf, label: tf }))}
    />
  );
}
