import type { ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: Variant;
  fullWidth?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: "bg-leo-600 text-white hover:bg-leo-700 focus-visible:outline-leo-600",
  secondary: "border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 focus-visible:outline-gray-400",
  ghost: "text-leo-700 hover:bg-leo-50 focus-visible:outline-leo-600",
};

export default function Button({
  loading = false,
  variant = "primary",
  fullWidth = false,
  disabled,
  className = "",
  children,
  ...rest
}: Props) {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading}
      className={[
        "inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold",
        "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-60",
        VARIANTS[variant],
        fullWidth ? "w-full" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {loading && <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
