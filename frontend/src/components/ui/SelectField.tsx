import { forwardRef, useId, type SelectHTMLAttributes } from "react";

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
}

const SelectField = forwardRef<HTMLSelectElement, Props>(function SelectField(
  { label, error, hint, id, className = "", children, ...rest },
  ref
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const messageId = `${selectId}-message`;

  return (
    <div>
      <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <select
        id={selectId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        className={[
          "h-12 w-full rounded-xl border bg-white px-3 text-base text-gray-900",
          "focus:outline-2 focus:outline-offset-0",
          error
            ? "border-red-400 focus:outline-red-500"
            : "border-gray-300 focus:border-leo-600 focus:outline-leo-600",
          className,
        ].join(" ")}
        {...rest}
      >
        {children}
      </select>
      {(error || hint) && (
        <p id={messageId} className={`mt-1.5 text-sm ${error ? "text-red-600" : "text-gray-500"}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
});

export default SelectField;
