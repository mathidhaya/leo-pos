import type { LucideIcon } from "lucide-react";

type Tone = "green" | "blue" | "amber" | "red" | "gray";

const TONES: Record<Tone, string> = {
  green: "bg-leo-100 text-leo-700",
  blue: "bg-blue-100 text-blue-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
  gray: "bg-gray-100 text-gray-700",
};

interface Props {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: Tone;
  hint?: string;
}

export default function StatCard({ label, value, icon: Icon, tone, hint }: Props) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 truncate text-2xl font-bold text-gray-900 sm:text-3xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
