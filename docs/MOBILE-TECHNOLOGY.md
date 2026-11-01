# Directive 40 — Κομμάτι 1: Τεχνολογία κινητού

Σύγκριση δύο δρόμων και πρόταση.

Καμία εγκεκριμένη εικόνα δεν έφτασε σε αυτό το session.

---

## Τι υπάρχει σήμερα

Το Ionexa είναι ήδη **PWA** (Progressive Web App):

| δυνατότητα | αρχείο / μηχανισμός | κατάσταση |
|---|---|---|
| Manifest (installable) | `src/app/manifest.ts` — standalone, icons 192/512/maskable, screenshots wide+narrow | ✅ |
| Service worker (offline shell) | `public/sw.js` — network-first navigations, cache-first static | ✅ |
| Push notifications | `src/app/api/push/subscribe/route.ts`, `push-notification-settings.tsx`, `sw.js` push handler | ✅ |
| Share target (φωτογραφία, PDF, link) | manifest `share_target` POST multipart → `src/app/share/route.ts` | ✅ |
| Camera / microphone | `src/components/voice/use-recorder.ts` (MediaRecorder), `meetings-workspace.tsx` | ✅ |
| Install invitation | `src/components/pwa/pwa-provider.tsx` — Chrome + Safari | ✅ |
| Shortcuts | manifest: Chat, Create, Overview | ✅ |
| Launch handler | `navigate-existing` — shares and files open in the existing window | ✅ |

Framework: **Next.js 16**, **React 19**, hosted on **Vercel**, 10 locales (next-intl).

---

## Δρόμος Α: Capacitor (η εφαρμογή web μέσα σε native shell)

Capacitor τυλίγει τον υπάρχοντα κώδικα σε ένα WKWebView (iOS) / WebView (Android).

**Πώς δουλεύει.** `npx cap init` → `npx cap add ios` / `android` → το production build
(`out/` ή μια URL) φορτώνεται μέσα στο native shell. Ο κώδικας JS/React παραμένει
ίδιος. Plugins (Capacitor ή Cordova) δίνουν πρόσβαση σε native APIs μέσω γέφυρας.

### Πλεονεκτήματα

1. **100% κοινός κώδικας UI.** Κάθε σελίδα, component, hook, API route τρέχει
   ως έχει. Δεν γράφεται δεύτερο UI.
2. **Μηδενικό κόστος μετάβασης.** Κανένα rewrite — προστίθεται ένα native shell
   γύρω από την υπάρχουσα εφαρμογή.
3. **PWA δυνατότητες χωρίς αλλαγή.** Push, share target, offline, camera,
   mic — ήδη δουλεύουν στο web. Μέσω Capacitor, τρέχουν αυτόματα μέσα
   στο WebView.
4. **Native plugins για ό,τι το web δεν φτάνει:**
   - Face ID / Fingerprint → `@capacitor/biometric-auth` ή `capacitor-native-biometric`
   - In-app purchases → `@capgo/capacitor-purchases` (RevenueCat wrapper)
   - Share extension (receive) → ήδη δουλεύει μέσω manifest share_target
   - Deep links / Universal links → `@capacitor/app` + `@capacitor/deep-links`
5. **Ένα deploy, δύο εκδόσεις.** Web deploy στο Vercel, App Store / Play
   Store build από τον ίδιο κώδικα.
6. **Budget 0 €.** Capacitor είναι δωρεάν, open-source (MIT).

### Μειονεκτήματα

1. **Ταχύτητα UI.** Το WebView δεν είναι native rendering — σε πολύ παλιά
   Android συσκευές μπορεί να μην είναι butter-smooth. Σε σύγχρονα (Android 10+,
   iOS 15+) η διαφορά είναι αμελητέα για content-based UI (κείμενο, λίστες,
   φόρμες) — δεν είμαστε παιχνίδι.
2. **App Store review risk.** Η Apple μπορεί να αρνηθεί apps που είναι
   «minimal wrapper of a website» αν δεν δείχνουν κάτι native-only. Η λύση:
   biometric login, push, share extension, offline cache — ήδη τα έχουμε.
3. **WebView ιδιοτροπίες.** Safe area insets, status bar color, keyboard push
   χρειάζονται plugin ρυθμίσεις (`@capacitor/status-bar`, `@capacitor/keyboard`).

---

## Δρόμος Β: Expo / React Native (ξεχωριστή εφαρμογή)

Expo χτίζει native UI components (όχι WebView) μέσω React Native.

**Πώς δουλεύει.** Νέο project (`npx create-expo-app`). Κάθε οθόνη ξαναγράφεται
με React Native components (`<View>`, `<Text>`, `<FlatList>`) αντί για HTML.
Η business logic (API calls, state) μπορεί να μοιραστεί, αλλά κανένα
`.tsx` component δεν μεταφέρεται ως έχει.

### Πλεονεκτήματα

1. **Native rendering.** Κάθε UI element είναι native — 60/120fps scrolling,
   native gestures.
2. **Expo ecosystem.** Managed workflow, OTA updates (EAS Update), push
   (expo-notifications), biometrics (expo-local-authentication), in-app
   purchases (expo-in-app-purchases / RevenueCat).
3. **Αποδοχή App Store.** Δεν υπάρχει κίνδυνος «WebView wrapper rejection».

### Μειονεκτήματα

1. **~0% κοινός κώδικας UI.** Κανένα React component, κανένα CSS/Tailwind,
   κανένα server component δεν μεταφέρεται. Ολόκληρο το UI ξαναγράφεται.
   Σήμερα υπάρχουν 200+ components στο `src/components/` — αυτό σημαίνει
   μήνες δουλειάς.
2. **Δύο codebases.** Κάθε νέο feature χτίζεται δύο φορές: μία web, μία
   native. Κάθε bugfix διπλασιάζεται. Κάθε i18n string μπαίνει σε δύο μέρη.
3. **Server components δεν υπάρχουν.** Η αρχιτεκτονική του Ionexa βασίζεται
   σε Next.js server components, server actions, middleware, API routes.
   Τίποτα από αυτά δεν τρέχει σε React Native — χρειάζεται ξεχωριστό data
   layer.
4. **Budget: δεν χωράει στο 0 €.** Ξαναγράφεις εφαρμογή 200+ σελίδων/components.
   Ακόμα και χωρίς κόστος licenses, ο χρόνος ανάπτυξης μετατρέπεται σε
   κόστος ή σε μήνες καθυστέρηση.
5. **EAS Build:** δωρεάν tier: 15 builds/μήνα iOS + 15 Android. Αρκεί για
   αρχή, αλλά development builds τελειώνουν γρήγορα (paid: $99/μήνα ή
   self-hosted).

---

## Σύγκριση κατά κριτήριο

| κριτήριο | Capacitor | Expo |
|---|---|---|
| **Κοινός κώδικας** | ~95% (μόνο native plugin config) | ~20% (business logic, API types) |
| **Χρόνος μέχρι Store** | 1-2 εβδομάδες | 2-4 μήνες |
| **Push notifications** | ✅ ήδη δουλεύει (web push + Capacitor plugin) | ✅ expo-notifications (ξαναχτίζεται) |
| **Share extension** | ✅ ήδη δουλεύει (manifest share_target) | ✅ custom native module ή expo-share-extension |
| **Camera / mic** | ✅ ήδη δουλεύει (MediaRecorder) | ✅ expo-camera, expo-av (ξαναχτίζεται) |
| **Face ID / fingerprint** | ✅ capacitor plugin | ✅ expo-local-authentication |
| **In-app purchases** | ✅ RevenueCat plugin (όταν αποφασιστεί) | ✅ RevenueCat / expo-iap (όταν αποφασιστεί) |
| **Ταχύτητα <2 δευτ.** | ✅ ίδια με PWA, η εφαρμογή ήδη φορτώνει σε <1.5s | ✅ native cold start ~1-2s |
| **Offline** | ✅ ήδη δουλεύει (sw.js) | Πρέπει να χτιστεί |
| **Κόστος licenses** | 0 € | 0 € (δωρεάν tier) |
| **Κόστος ανάπτυξης** | Ελάχιστο (config + plugins) | Πολύ μεγάλο (full rewrite) |
| **App Store risk** | Μέτριο (λύνεται με native features) | Κανένα |
| **Συντήρηση** | 1 codebase | 2 codebases |

---

## Πρόταση: **Capacitor**

**Λόγος:** Ο στόχος είναι «ίδιος κώδικας όπου γίνεται», και το Ionexa
ήδη έχει ώριμο PWA. Capacitor δίνει native shell γύρω από τον ίδιο κώδικα,
χωρίς rewrite, χωρίς δεύτερο codebase, μέσα στο budget (0 €), σε 1-2
εβδομάδες αντί για μήνες.

Τα 7 κομμάτια της οδηγίας 40 με Capacitor:

| # | κομμάτι | τρόπος |
|---|---|---|
| 1 | Τεχνολογία | ✅ αυτό το έγγραφο |
| 2 | Push notifications | Ήδη δουλεύουν (web push). Capacitor: `@capacitor/push-notifications` για native delivery + λειτουργία, έγκριση, χρέωση |
| 3 | Share to Ionexa | Ήδη δουλεύει (manifest share_target). Capacitor: τρέχει αυτόματα μέσω WebView |
| 4 | Camera, mic, voice | Ήδη δουλεύουν (MediaRecorder). Capacitor: τρέχουν αυτόματα μέσω WebView |
| 5 | Face ID / fingerprint | `@capacitor/biometric-auth` ή `capacitor-native-biometric` |
| 6 | In-app purchases | ΔΕΝ πουλά μέχρι να αποφασίσει ο Ηλίας. Κανόνες + προμήθειες → ΘΕΛΩ |
| 7 | Store submission | Capacitor build → Xcode + Android Studio → icons, screenshots, κείμενα, developer accounts (ΘΕΛΩ: Apple $99/yr, Google $25) |

**Γιατί όχι Expo:** Ξαναγράφεις κάθε component σε React Native. 200+
οθόνες. Μήνες δουλειάς. Δύο codebases για πάντα. Δεν χωράει στο budget,
δεν χωράει στον χρόνο, και δεν κερδίζει τίποτα αρκετά μεγάλο σε σχέση
με τον Capacitor — το Ionexa δεν είναι παιχνίδι ή animation-heavy app
που χρειάζεται native rendering.

---

**ΝΕΑ MIGRATIONS ΝΑ ΤΡΕΞΕΙΣ: καμία**
