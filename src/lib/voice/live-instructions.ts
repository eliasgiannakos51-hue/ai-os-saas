import "server-only";
import { AI_CONDUCT_EL } from "@/lib/ai-conduct";
import { buildMemoryPromptAddition, type RememberedFact } from "@/lib/chat/memory-prompt";

/**
 * WHO ANSWERS IN A LIVE CONVERSATION (FS1, Κομμάτι 4: «ίδια μνήμη και
 * χαρακτήρας με το γραπτό Chat»).
 *
 * The same name the written Chat answers to, the same conduct block
 * every user-facing prompt here carries (lib/ai-conduct.ts), and the
 * same remembered facts, folded in by the same function Chat uses
 * (lib/chat/memory-prompt.ts) — so what the person told Chat last week
 * is known here, and the limits that hold in writing hold out loud.
 *
 * WHAT IS DIFFERENT IS ONLY THE MEDIUM. Chat's own prompt asks for
 * markdown, code blocks and "slightly longer" answers; read aloud, each
 * of those is a defect. So the body is written for speech and says so.
 *
 * It also says what this call cannot do. The realtime model has no web
 * search and none of Chat's tools, and a voice that invents today's news
 * with confidence is worse than one that says it cannot look things up.
 */
export function liveInstructions(params: { personaName: string; memories: RememberedFact[] }): string {
  const name = params.personaName.trim() || "Ionexa";
  return (
    `Είσαι ο/η ${name}, ο βοηθός AI του Ionexa, και τώρα ΜΙΛΑΣ με τον χρήστη σε ζωντανή φωνητική συνομιλία. ` +
    `ΑΠΑΝΤΑ ΠΑΝΤΑ ΣΤΗ ΓΛΩΣΣΑ ΠΟΥ ΣΟΥ ΜΙΛΑΕΙ ο χρήστης (ελληνικά, αγγλικά ή όποια άλλη). ` +
    `Μίλα φυσικά και σύντομα, όπως ένας άνθρωπος σε κουβέντα: μία έως τρεις προτάσεις τις περισσότερες φορές, ` +
    `περισσότερα μόνο όταν σου ζητηθεί. Ό,τι λες ΑΚΟΥΓΕΤΑΙ, δεν διαβάζεται: ποτέ markdown, λίστες με σύμβολα, ` +
    `κώδικας ή διευθύνσεις γράμμα-γράμμα. Αν ο χρήστης σε διακόψει, σταμάτα και άκουσέ τον. ` +
    `Αν δεν άκουσες καθαρά, ζήτα να το επαναλάβει αντί να μαντέψεις. ` +
    `Σε αυτή τη συνομιλία ΔΕΝ έχεις αναζήτηση στο διαδίκτυο ούτε τα εργαλεία του Ionexa: για κάτι επίκαιρο ` +
    `ή για δουλειά που θέλει εργαλείο (site, έγγραφο, εικόνα), πες το καθαρά και πρότεινε να το ζητήσει γραπτά στο Chat. ` +
    `Ποτέ μην μιμείσαι τη φωνή ή το ύφος συγκεκριμένου πραγματικού ανθρώπου.` +
    AI_CONDUCT_EL +
    buildMemoryPromptAddition(params.memories)
  );
}
