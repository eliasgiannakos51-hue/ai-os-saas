"use client";

import { useRef, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { Paperclip } from "lucide-react";

// A bare <input type="file"> renders its button label ("Choose File") and
// its status text ("No file chosen") from the BROWSER's own locale, not
// from the page. That text lives in the browser's shadow DOM: it is not in
// our markup, next-intl cannot reach it, and CSS cannot rewrite it — which
// is why the Website Builder's picker stayed Greek for a user on a Greek
// browser no matter which language they picked in the app. It was never a
// missing translation; it was never our text to begin with.
//
// The fix is the standard one: keep the real input for behaviour and
// accessibility, hide it visually, and render our own label + status from
// the app's own messages.
export function FilePicker({
  id,
  accept,
  multiple = false,
  disabled = false,
  selectedCount = 0,
  onChange,
  inputRef,
}: {
  id: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /** How many files the parent currently holds, for the status text. */
  selectedCount?: number;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Optional parent ref, so the parent can still reset the input value. */
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  const t = useTranslations("common");
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;

  return (
    <div className="flex items-center gap-3">
      {/* sr-only rather than display:none — a hidden input is skipped by
          screen readers and cannot be focused by keyboard, which would
          make the picker unusable without a mouse. */}
      <input
        id={id}
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={onChange}
        className="sr-only"
      />
      <label
        htmlFor={id}
        className={[
          "inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-input px-3 py-1.5 text-xs font-medium text-foreground transition-colors duration-150",
          disabled
            ? "cursor-not-allowed opacity-50"
            : "hover:border-orange-500 hover:text-orange-400",
        ].join(" ")}
      >
        <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
        {t("chooseFiles")}
      </label>
      <span className="text-xs text-muted">
        {selectedCount > 0 ? t("filesSelected", { count: selectedCount }) : t("noFileChosen")}
      </span>
    </div>
  );
}
