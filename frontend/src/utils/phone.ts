// An Indian mobile number: 10 digits starting 6-9, optionally written with +91, 91 or 0 in front.
export function isValidPhone(raw: string): boolean {
  const digits = raw.trim().replace(/[\s-]/g, "");
  return /^(?:\+91|91|0)?[6-9]\d{9}$/.test(digits);
}
