// Which of the given fields actually changed? Null, undefined and empty text all count as "nothing".
// Used for the audit log, which records WHICH fields changed (not their values).
export function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));
  return Object.keys(after).filter((key) => after[key] !== undefined && text(before[key]) !== text(after[key]));
}
