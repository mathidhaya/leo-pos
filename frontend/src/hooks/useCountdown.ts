import { useCallback, useEffect, useState } from "react";

// Counts down once per second, for the "Resend OTP in 30s" button.
export function useCountdown(initialSeconds = 0) {
  const [remaining, setRemaining] = useState(initialSeconds);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  const start = useCallback((seconds: number) => setRemaining(seconds), []);

  return { remaining, start };
}
