import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";

// Product Workflow's "Product Mentor" preset (see
// components/product-workflow/product-mentor-button.tsx) — mirrors
// lib/chat/trading-mentor-context.ts exactly, but over the products table
// instead of trades: loads the user's full recent product-planning
// history so Mentor Mode can give product-launch-specific feedback
// instead of a generic cross-module blurb. Only ever appended when the
// chat request explicitly opts in via mentorPreset: "product" (see
// api/chat/route.ts) — the default chat/Mentor Mode behavior is
// unaffected.
const PRODUCT_LIMIT = 20;

export async function loadProductMentorContext(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(PRODUCT_LIMIT);

    if (error || !data || data.length === 0) {
      if (error) logApiError("chat:loadProductMentorContext", error);
      return "";
    }

    const lines = (data as Record<string, unknown>[]).map((row) => {
      const name = String(row.product_name ?? "").trim() || "?";
      const audience = String(row.target_audience ?? "").trim();
      const pricing = String(row.pricing ?? "").trim();
      const details = [audience && `audience: ${audience}`, pricing && `pricing: ${pricing}`]
        .filter(Boolean)
        .join(", ");
      return `- ${name}${details ? `: ${details}` : ""}`;
    });

    return `\n\nΠλήρες product planning history του χρήστη (τα ${data.length} πιο πρόσφατα products, από το πιο πρόσφατο στο παλαιότερο) — χρησιμοποίησέ το για συγκεκριμένη, βασισμένη σε δεδομένα καθοδήγηση αντί για γενικές συμβουλές:\n${lines.join("\n")}`;
  } catch (err) {
    logApiError("chat:loadProductMentorContext", err, { userId });
    return "";
  }
}
