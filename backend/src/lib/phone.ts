const E164_REGEX = /^\+[1-9]\d{7,14}$/;

export function normalizePhoneToE164(rawPhone: string): string | null {
  if (!rawPhone || typeof rawPhone !== 'string') return null;

  let value = rawPhone.trim();
  if (!value) return null;

  value = value.replace(/[()\-\s]/g, '');

  if (value.startsWith('00')) {
    value = `+${value.slice(2)}`;
  }

  // Israel local style: 05xxxxxxxx, 0xxxxxxxxx -> +972xxxxxxxxx
  if (value.startsWith('0') && /^\d{9,10}$/.test(value)) {
    value = `+972${value.slice(1)}`;
  }

  // Accept 972xxxxxxxxx without plus.
  if (value.startsWith('972') && /^\d{11,12}$/.test(value)) {
    value = `+${value}`;
  }

  if (!value.startsWith('+') && /^\d{8,15}$/.test(value)) {
    value = `+${value}`;
  }

  if (!E164_REGEX.test(value)) return null;
  return value;
}
