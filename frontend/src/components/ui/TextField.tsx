import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

const TextField = forwardRef<HTMLInputElement, Props>(function TextField(
  { label, error, hint, type = "text", id, className = "", ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-message`;
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";

  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          ref={ref}
          type={isPassword && showPassword ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          className={[
            "h-12 w-full rounded-xl border bg-white px-4 text-base text-gray-900 placeholder:text-gray-400",
            "focus:outline-2 focus:outline-offset-0",
            error
              ? "border-red-400 focus:outline-red-500"
              : "border-gray-300 focus:border-leo-600 focus:outline-leo-600",
            isPassword ? "pr-12" : "",
            className,
          ].join(" ")}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-gray-500 hover:text-gray-800"
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        )}
      </div>
      {(error || hint) && (
        <p id={messageId} className={`mt-1.5 text-sm ${error ? "text-red-600" : "text-gray-500"}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
});

export default TextField;
