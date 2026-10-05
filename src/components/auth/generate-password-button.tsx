"use client";

import { useTranslations } from "next-intl";
import { generateStrongPassword } from "@/lib/generate-password";

export function GeneratePasswordButton({ onGenerate }: { onGenerate: (password: string) => void }) {
  const t = useTranslations("auth");
  return (
    <button
      type="button"
      onClick={() => onGenerate(generateStrongPassword())}
      className="text-xs font-medium text-foreground underline underline-offset-2 transition-colors duration-150 hover:text-foreground"
    >
      {t("generateStrongPassword")}
    </button>
  );
}
