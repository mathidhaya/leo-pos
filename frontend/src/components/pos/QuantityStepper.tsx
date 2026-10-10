import { useState } from "react";
import { Minus, Plus } from "lucide-react";

interface Props {
  name: string;
  value: number;
  max: number;
  onChange: (quantity: number) => void;
}

// [-] 1 [+]. The number can also be typed, which is quicker for big orders.
export default function QuantityStepper({ name, value, max, onChange }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    if (draft === null) return;
    const typed = Number(draft);
    if (Number.isInteger(typed) && typed >= 1) onChange(Math.min(typed, max));
    setDraft(null);
  }

  return (
    <div className="inline-flex items-center rounded-xl border border-gray-300 bg-white">
      <button
        type="button"
        aria-label={`Decrease ${name}`}
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
        className="flex h-10 w-10 items-center justify-center rounded-l-xl text-gray-700 hover:bg-gray-100 disabled:opacity-40"
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        inputMode="numeric"
        aria-label={`${name} quantity`}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 2))}
        onBlur={commit}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            e.currentTarget.blur();
          }
        }}
        className="h-10 w-12 border-x border-gray-300 text-center text-base font-semibold text-gray-900 focus:outline-2 focus:outline-leo-600"
      />
      <button
        type="button"
        aria-label={`Increase ${name}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className="flex h-10 w-10 items-center justify-center rounded-r-xl text-gray-700 hover:bg-gray-100 disabled:opacity-40"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
