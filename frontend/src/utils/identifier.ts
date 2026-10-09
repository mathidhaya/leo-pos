const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Same rules as the backend: an email, or a 10-digit Indian mobile number.
export function isValidIdentifier(raw: string): boolean {
  const input = raw.trim();

  if (input.includes("@")) {
    const email = input.toLowerCase();
    return EMAIL_RE.test(email) && email.length <= 254;
  }

  const digits = input.replace(/[\s-]/g, "");
  return /^(?:\+91|91|0)?[6-9]\d{9}$/.test(digits);
}
