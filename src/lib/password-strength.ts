export type PasswordRule = {
  id: string;
  label: string;
  test: (password: string) => boolean;
};

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "length", label: "At least 8 characters", test: (pw) => pw.length >= 8 },
  { id: "uppercase", label: "One uppercase letter (A-Z)", test: (pw) => /[A-Z]/.test(pw) },
  { id: "lowercase", label: "One lowercase letter (a-z)", test: (pw) => /[a-z]/.test(pw) },
  { id: "number", label: "One number (0-9)", test: (pw) => /[0-9]/.test(pw) },
  {
    id: "special",
    label: "One special character (!@#$...)",
    test: (pw) => /[^A-Za-z0-9]/.test(pw),
  },
];

export function isPasswordStrong(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}
