import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, type LucideIcon } from "lucide-react";

type Variant = "error" | "success" | "info";

const STYLES: Record<Variant, { box: string; Icon: LucideIcon }> = {
  error: { box: "border-red-200 bg-red-50 text-red-800", Icon: CircleAlert },
  success: { box: "border-leo-100 bg-leo-50 text-leo-700", Icon: CircleCheck },
  info: { box: "border-blue-200 bg-blue-50 text-blue-800", Icon: Info },
};

export default function Alert({ variant, children }: { variant: Variant; children: ReactNode }) {
  const { box, Icon } = STYLES[variant];
  return (
    <div role={variant === "error" ? "alert" : "status"} className={`flex gap-3 rounded-xl border p-3 text-sm ${box}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
