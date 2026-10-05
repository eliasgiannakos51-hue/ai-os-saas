# Έλεγχος όλου του site — 2026-10-04

Καταγραφή μίας ημέρας (measured 2026-10-04), όπως βγήκε από το
`scripts/site-audit.mjs` στο commit `8cac9fe3`: production build, ψεύτικο
Supabase (άδειος λογαριασμός Ultimate), ελληνικά. Για σημερινή εικόνα
ξανατρέχει: `AUDIT=<φάκελος> node scripts/site-audit.mjs`.

Σε κάθε σελίδα και πλάτος: status, σφάλματα console, οριζόντια κύλιση,
κείμενο με «…», στόχοι κάτω από 44 px (κινητό), axe WCAG 2 A/AA, LCP/CLS.

| Σελίδα | 1440×900 | 390×844 | LCP (ms) | CLS |
|---|---|---|---|---|
| `/dashboard` | καθαρή | καθαρή | 672 | 0 |
| `/dashboard/activity` | καθαρή | καθαρή | 520 | 0 |
| `/dashboard/affiliate` | καθαρή | καθαρή | 448 | 0 |
| `/dashboard/agents` | καθαρή | καθαρή | 516 | 0 |
| `/dashboard/ai-memory` | καθαρή | καθαρή | 388 | 0 |
| `/dashboard/apps` | καθαρή | καθαρή | 400 | 0 |
| `/dashboard/business-health` | καθαρή | καθαρή | 340 | 0 |
| `/dashboard/campaigns` | καθαρή | καθαρή | 408 | 0 |
| `/dashboard/chat` | καθαρή | καθαρή | 304 | 0.143 |
| `/dashboard/coding` | καθαρή | καθαρή | 364 | 0 |
| `/dashboard/costs` | καθαρή | καθαρή | 332 | 0 |
| `/dashboard/create` | καθαρή | καθαρή | 384 | 0 |
| `/dashboard/data-analysis` | καθαρή | καθαρή | 388 | 0 |
| `/dashboard/deep-research` | καθαρή | καθαρή | 412 | 0 |
| `/dashboard/documents` | καθαρή | καθαρή | 372 | 0 |
| `/dashboard/favorites` | καθαρή | καθαρή | 372 | 0 |
| `/dashboard/files` | καθαρή | καθαρή | 408 | 0 |
| `/dashboard/form-submissions` | καθαρή | καθαρή | 384 | 0 |
| `/dashboard/images` | καθαρή | καθαρή | 368 | 0 |
| `/dashboard/integrations` | καθαρή | καθαρή | 412 | 0 |
| `/dashboard/marketplace` | καθαρή | καθαρή | 384 | 0 |
| `/dashboard/meetings` | καθαρή | καθαρή | 376 | 0 |
| `/dashboard/memory` | → /dashboard/search | → /dashboard/search | 380 | 0 |
| `/dashboard/mission` | καθαρή | καθαρή | 412 | 0 |
| `/dashboard/overview` | καθαρή | καθαρή | 376 | 0 |
| `/dashboard/posts` | καθαρή | καθαρή | 424 | 0.003 |
| `/dashboard/predictions` | καθαρή | καθαρή | 368 | 0 |
| `/dashboard/presentations` | καθαρή | καθαρή | 428 | 0 |
| `/dashboard/product-workflow` | καθαρή | καθαρή | 432 | 0 |
| `/dashboard/projects` | καθαρή | καθαρή | 372 | 0 |
| `/dashboard/published` | καθαρή | καθαρή | 408 | 0 |
| `/dashboard/records` | καθαρή | καθαρή | 376 | 0 |
| `/dashboard/reflection` | καθαρή | καθαρή | 348 | 0 |
| `/dashboard/routing` | καθαρή | καθαρή | 336 | 0 |
| `/dashboard/search` | καθαρή | καθαρή | 428 | 0 |
| `/dashboard/settings` | καθαρή | καθαρή | 544 | 0 |
| `/dashboard/system-health` | καθαρή | καθαρή | 320 | 0 |
| `/dashboard/team` | → /dashboard/settings | → /dashboard/settings | 500 | 0 |
| `/dashboard/timeline` | καθαρή | καθαρή | 372 | 0 |
| `/dashboard/tools` | καθαρή | καθαρή | 392 | 0 |
| `/dashboard/trading-journal` | καθαρή | καθαρή | 400 | 0.009 |
| `/dashboard/trading-workflow` | καθαρή | καθαρή | 412 | 0.003 |
| `/dashboard/videos` | καθαρή | καθαρή | 408 | 0.003 |
| `/dashboard/voice` | καθαρή | καθαρή | 368 | 0.041 |
| `/dashboard/website-builder` | καθαρή | καθαρή | 464 | 0 |
| `/dashboard/websites` | καθαρή | καθαρή | 416 | 0 |
| `/delete-account/confirm` | καθαρή | καθαρή | 240 | 0 |
| `/onboarding` | → /dashboard/overview | → /dashboard/overview | 480 | 0 |
| `/` | καθαρή | καθαρή | 176 | 0.011 |
| `/acceptable-use` | καθαρή | καθαρή | 140 | 0.012 |
| `/ai-transparency` | καθαρή | καθαρή | 188 | 0.057 |
| `/contact` | καθαρή | καθαρή | 176 | 0 |
| `/cookies` | καθαρή | καθαρή | 128 | 0.011 |
| `/forgot-password` | καθαρή | καθαρή | 228 | 0 |
| `/help` | καθαρή | καθαρή | 148 | 0 |
| `/login` | καθαρή | καθαρή | 284 | 0 |
| `/offline` | καθαρή | καθαρή | 144 | 0.004 |
| `/pricing` | καθαρή | καθαρή | 352 | 0.006 |
| `/privacy` | καθαρή | καθαρή | 156 | 0 |
| `/reset-password` | καθαρή | καθαρή | 284 | 0.028 |
| `/roadmap` | καθαρή | καθαρή | 160 | 0.004 |
| `/signup` | καθαρή | καθαρή | 300 | 0 |
| `/terms` | καθαρή | καθαρή | 164 | 0 |

**Δεν ανοίχτηκαν** (θέλουν πραγματική εγγραφή): `/dashboard/[module]`, `/dashboard/documents/[id]`, `/dashboard/projects/[id]`.

Οι τρεις ανακατευθύνσεις είναι σωστές: `/dashboard/memory` πάει στην αναζήτηση (παλιά διεύθυνση), `/dashboard/team` στις ρυθμίσεις για λογαριασμό χωρίς ομάδα, `/onboarding` στην αρχική για λογαριασμό που το έχει τελειώσει. Το CLS του chat εξηγείται στο `docs/DECISIONS.md` (D.11).
