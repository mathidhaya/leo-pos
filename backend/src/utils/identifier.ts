// The user can type a mobile number or an email. We store them in one clean form.
export type Identifier = { type: "email" | "phone"; value: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseIdentifier(raw: string): Identifier | null {
  const input = raw.trim();

  if (input.includes("@")) {
    const email = input.toLowerCase();
    return EMAIL_RE.test(email) && email.length <= 254 ? { type: "email", value: email } : null;
  }

  // Indian mobile numbers: 10 digits starting 6-9, optional +91 / 91 / 0 in front
  const digits = input.replace(/[\s-]/g, "");
  const match = digits.match(/^(?:\+91|91|0)?([6-9]\d{9})$/);
  return match ? { type: "phone", value: match[1] } : null;
}
