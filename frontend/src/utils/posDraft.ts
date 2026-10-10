// The unfinished order is kept in this browser tab only (sessionStorage), so a refresh does not lose it.
export const DRAFT_PREFIX = "leo-pos-draft:";

export function clearPosDraft(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(DRAFT_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // storage is not available: nothing to clear
  }
}
