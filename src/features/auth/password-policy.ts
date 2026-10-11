/**
 * The account password policy, as configured in Supabase Auth by scripts/supabase-auth-config.mjs: at least 12 characters with
 * lowercase, uppercase and digits, no symbol requirement (supervisors type on phones). Supabase checks it again on save.
 * The server's character sets are ASCII (a–z, A–Z, 0–9), so "á" or "Ñ" do not count as a lowercase or uppercase letter here.
 */
export const PASSWORD_MIN_LENGTH = 12;
/** bcrypt reads at most 72 bytes: Supabase refuses longer passwords. */
export const PASSWORD_MAX_LENGTH = 72;

export type PasswordRule = { id: "length" | "lower" | "upper" | "digit"; label: string; test: (password: string) => boolean };

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "length", label: `Al menos ${PASSWORD_MIN_LENGTH} caracteres`, test: (p) => p.length >= PASSWORD_MIN_LENGTH },
  { id: "lower", label: "Una letra minúscula", test: (p) => /[a-z]/.test(p) },
  { id: "upper", label: "Una letra mayúscula", test: (p) => /[A-Z]/.test(p) },
  { id: "digit", label: "Un número", test: (p) => /[0-9]/.test(p) },
];

/** One sentence for the form and the e-mails. */
export const PASSWORD_RULE_TEXT = `Al menos ${PASSWORD_MIN_LENGTH} caracteres, con minúsculas, mayúsculas y números.`;

const utf8Length = (p: string) => new TextEncoder().encode(p).length;

/** What still keeps the password from being saved (undefined = it can be saved). */
export function passwordProblem(password: string, confirmation: string): string | undefined {
  const missing = PASSWORD_RULES.find((r) => !r.test(password));
  if (missing) return `Falta: ${missing.label.toLowerCase()}.`;
  if (utf8Length(password) > PASSWORD_MAX_LENGTH) return `Use como máximo ${PASSWORD_MAX_LENGTH} caracteres.`;
  if (password !== confirmation) return "Escriba la misma contraseña en los dos campos.";
  return undefined;
}
