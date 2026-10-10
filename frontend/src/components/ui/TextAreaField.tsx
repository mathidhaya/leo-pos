import { forwardRef, useId, type TextareaHTMLAttributes } from "react";

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
}

const TextAreaField = forwardRef<HTMLTextAreaElement, Props>(function TextAreaField(
  { label, error, hint, id, className = "", ...rest },
  ref
) {
  const autoId = useId();
  const areaId = id ?? autoId;
  const messageId = `${areaId}-message`;

  return (
    <div>
      <label htmlFor={areaId} className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <textarea
        id={areaId}
        ref={ref}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        className={[
          "w-full rounded-xl border bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-400",
          "focus:outline-2 focus:outline-offset-0",
          error
            ? "border-red-400 focus:outline-red-500"
            : "border-gray-300 focus:border-leo-600 focus:outline-leo-600",
          className,
        ].join(" ")}
        {...rest}
      />
      {(error || hint) && (
        <p id={messageId} className={`mt-1.5 text-sm ${error ? "text-red-600" : "text-gray-500"}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
});

export default TextAreaField;
