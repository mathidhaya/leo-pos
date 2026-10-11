import crypto from "crypto";

// No look-alike characters (I/l/1 and O/o/0), so a password is easy to read out or type.
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const ALL = UPPER + LOWER + DIGITS;

const pick = (set: string) => set[crypto.randomInt(set.length)];

// A random password with at least one capital letter, one small letter and one digit,
// so it always passes the password rules used at login.
export function generateTempPassword(length = 12): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  while (chars.length < length) chars.push(pick(ALL));

  // Shuffle, so the three required characters are not always at the front
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
