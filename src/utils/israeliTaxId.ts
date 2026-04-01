/**
 * Israeli 9-digit ID numbers (תעודת זהות / ח.פ. / עוסק מורשה) use a standard check digit.
 * The authority validator rejects invalid check digits ("ספרת הביקורת שגויה").
 */

export function israeli9thCheckDigit(first8Digits: string): number {
  const digits = (first8Digits || '').replace(/\D/g, '').padStart(8, '0').slice(0, 8);
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    let n = parseInt(digits[i]!, 10);
    if (Number.isNaN(n)) n = 0;
    if (i % 2 === 1) n *= 2;
    if (n > 9) n = Math.floor(n / 10) + (n % 10);
    sum += n;
  }
  return (10 - (sum % 10)) % 10;
}

/** Returns a 9-digit string with a valid check digit (replaces digit 9). */
export function normalizeIsraeli9Digit(value: string): string {
  const raw = (value || '').replace(/\D/g, '');
  const base = raw.slice(0, 8).padStart(8, '0');
  const check = israeli9thCheckDigit(base);
  return base + check;
}
