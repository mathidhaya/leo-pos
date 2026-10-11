// Makes text safe to use inside a LIKE / ILIKE pattern, so a search for "50%" or "a_b"
// matches those exact characters instead of acting as wildcards.
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}
