// An Indian mobile number: 10 digits starting 6-9, optionally written with +91, 91 or 0 in front.
export function isValidPhone(raw: string): boolean {
  const digits = raw.trim().replace(/[\s-]/g, "");
  return /^(?:\+91|91|0)?[6-9]\d{9}$/.test(digits);
}

// 9876543210 -> "98765 43210"
export function formatPhone(phone: string): string {
  return /^\d{10}$/.test(phone) ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;
}
