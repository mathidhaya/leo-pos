import { useEffect, useState } from "react";

// A short message such as "Saved." that goes away by itself
export function useFlash(milliseconds = 5000) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), milliseconds);
    return () => clearTimeout(timer);
  }, [message, milliseconds]);

  return [message, setMessage] as const;
}
