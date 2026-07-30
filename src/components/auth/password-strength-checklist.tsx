import { Check } from "lucide-react";
import { PASSWORD_RULES } from "@/lib/password-strength";

export function PasswordStrengthChecklist({ password }: { password: string }) {
  return (
    <ul className="space-y-1">
      {PASSWORD_RULES.map((rule) => {
        const passed = rule.test(password);
        return (
          <li
            key={rule.id}
            className={`flex items-center gap-1.5 text-xs transition-colors duration-150 ${
              passed ? "text-emerald-400" : "text-muted"
            }`}
          >
            {passed ? (
              <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full border border-current opacity-50"
                aria-hidden="true"
              />
            )}
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
