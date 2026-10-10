function errorCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null ? (err as { code?: string }).code : undefined;
}

// P2002: a value that must be unique already exists
export const isUniqueViolation = (err: unknown): boolean => errorCode(err) === "P2002";

// P2003: another table still points at this row
export const isForeignKeyViolation = (err: unknown): boolean => errorCode(err) === "P2003";
