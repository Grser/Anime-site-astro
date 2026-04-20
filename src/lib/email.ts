const ALLOWED_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'me.com',
  'msn.com',
  'yahoo.com',
  'yahoo.es',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'gmx.com',
  'mail.com',
  'yandex.com',
  'zoho.com',
]);

export const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

export const isTrustedEmailProvider = (value: unknown) => {
  const email = normalizeEmail(value);
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  return ALLOWED_EMAIL_DOMAINS.has(parts[1]);
};

export const trustedEmailMessage =
  'Solo se permiten correos de proveedores conocidos como Gmail, Hotmail, Outlook, Yahoo, iCloud o Proton.';
