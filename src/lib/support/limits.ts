// Client-safe support limits.
//
// The widget's input has a maxLength and the route rejects anything longer.
// Two numbers that must agree, so there is one — and it lives here rather
// than in lib/support/answer.ts because that module is `server-only` (it
// builds the prompt and imports the fact sheet), and a Client Component
// importing it would fail the build.
export const MAX_QUESTION_CHARS = 600;
