import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

const LENGTH = 4;

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  hasError?: boolean;
}

// Four boxes for the 4-digit OTP. Supports typing, backspace, arrow keys and pasting.
export default function OtpInput({ value, onChange, disabled, hasError }: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? "");

  function focusBox(index: number) {
    const box = refs.current[Math.min(Math.max(index, 0), LENGTH - 1)];
    box?.focus();
    box?.select();
  }

  function handleInput(index: number, raw: string) {
    const typed = raw.replace(/\D/g, "");
    const next = [...digits];

    if (!typed) {
      next[index] = "";
      onChange(next.join(""));
      return;
    }

    const chars = typed.length === 1 ? [typed] : typed.slice(0, LENGTH - index).split("");
    chars.forEach((char, k) => {
      next[index + k] = char;
    });
    onChange(next.join(""));
    focusBox(index + chars.length);
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      e.preventDefault();
      const next = [...digits];
      next[index - 1] = "";
      onChange(next.join(""));
      focusBox(index - 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusBox(index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusBox(index + 1);
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    focusBox(pasted.length);
  }

  return (
    <div className="flex justify-center gap-3" role="group" aria-label="One-time password">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          value={digit}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${index + 1}`}
          disabled={disabled}
          onChange={(e) => handleInput(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className={[
            "h-14 w-14 rounded-xl border bg-white text-center text-2xl font-semibold text-gray-900",
            "focus:outline-2 focus:outline-offset-0 disabled:opacity-60",
            hasError
              ? "border-red-400 focus:outline-red-500"
              : "border-gray-300 focus:border-leo-600 focus:outline-leo-600",
          ].join(" ")}
        />
      ))}
    </div>
  );
}
