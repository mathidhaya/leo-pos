// An Indian mobile number: 10 digits starting 6-9, optionally written with +91, 91 or 0 in front.
// Returns the plain 10 digits, or null if it is not a valid number.
export function normalizePhone(raw: string): string | null {
  const digits = raw.trim().replace(/[\s-]/g, "");
  const match = /^(?:\+91|91|0)?([6-9]\d{9})$/.exec(digits);
  return match ? match[1] : null;
}

export function isValidPhone(raw: string): boolean {
  return normalizePhone(raw) !== null;
}

// 9876543210 -> "98765 43210"
export function formatPhone(phone: string): string {
  return /^\d{10}$/.test(phone) ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;
}
