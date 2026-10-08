#!/usr/bin/env node
/*
 * CAN voice-conversation.test.mjs SEE A SPEECH CALL THAT CANNOT BE
 * POINTED ANYWHERE, OR A LOOP THAT STOPS, SPEAKS THE WRONG WORDS, OR
 * KEEPS LISTENING AFTER IT IS CLOSED?
 *
 * The base address ignored, its trailing slash kept, a conversation that
 * opens idle and waits for a second press, the loop not
 * listening again after it speaks, a failed voice ending the loop, a
 * failed hearing asking the model anyway, a turn that never ends on
 * silence, a close that leaves the microphone open, the question read
 * aloud instead of the answer, «Μίλα» drawn without a speech provider.
 *
 * Run: node scripts/tests/voice-conversation.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/voice-conversation.test.mjs";
const PROVIDERS = "src/lib/voice/voice-providers.ts";
const CONV = "src/components/voice/voice-conversation.tsx";
const CHAT = "src/components/chat/chat-workspace.tsx";

const MUTANTS = [
  {
    name: "the speech address ignores ELEVENLABS_BASE_URL",
    file: PROVIDERS,
    from: '  const raw = process.env.ELEVENLABS_BASE_URL;\n  if (typeof raw !== "string" || raw.trim() === "") return "https://api.elevenlabs.io/v1";\n  return raw.trim().replace(/\\/+$/, "");',
    to: '  return "https://api.elevenlabs.io/v1";',
    expect: "a real request reaches the server it names",
  },
  {
    name: "a trailing slash is kept",
    file: PROVIDERS,
    from: '  if (typeof raw !== "string" || raw.trim() === "") return "https://api.elevenlabs.io/v1";\n  return raw.trim().replace(/\\/+$/, "");',
    to: '  if (typeof raw !== "string" || raw.trim() === "") return "https://api.elevenlabs.io/v1";\n  return raw.trim();',
    expect: "a real request reaches the server it names, the trailing slash trimmed",
  },
  {
    name: "the loop does not listen again after it speaks",
    file: CONV,
    from: "        if (abandonedRef.current) return;\n        // 4. STRAIGHT BACK TO LISTENING. That is what makes it a\n        //    conversation rather than a series of button presses.\n        listen();",
    to: "        if (abandonedRef.current) return;\n        setState(\"idle\");",
    expect: "when the voice ends, it listens again by itself",
  },
  {
    name: "a failed voice ends the loop",
    file: CONV,
    from: "      if (!speakResponse.ok) {\n        // THE ANSWER IS ALREADY ON SCREEN. A speech failure means it is\n        // not read aloud, not that the turn was lost — so the loop goes\n        // back to listening rather than stopping.\n        listen();",
    to: "      if (!speakResponse.ok) {\n        setState(\"idle\");",
    expect: "a failed voice still listens again",
  },
  {
    name: "a failed hearing asks the model anyway",
    file: CONV,
    from: '      if (!stt.ok) {\n        addToast(voiceError(stt), "error");\n        setState("idle");\n        return;\n      }',
    to: '      if (!stt.ok) {\n        addToast(voiceError(stt), "error");\n      }',
    expect: "a failed hearing stops and says why",
  },
  {
    name: "a turn never ends on silence",
    file: CONV,
    from: "    autoStopOnSilence: true,",
    to: "    autoStopOnSilence: false,",
    expect: "a turn ends on silence",
  },
  {
    name: "the conversation opens idle and waits for a second press",
    file: CONV,
    from: "    startedRef.current = true;\n    listen();\n  }, [listen]);",
    to: "    startedRef.current = true;\n  }, [listen]);",
    expect: "the press that opens it starts the first turn",
  },
  {
    name: "closing leaves the microphone open",
    file: CONV,
    from: "    abandonedRef.current = true;\n    recorder.stop();\n    stopSpeaking();\n    onClose();",
    to: "    abandonedRef.current = true;\n    stopSpeaking();\n    onClose();",
    expect: "closing stops the microphone and the voice",
  },
  {
    name: "the question is read aloud instead of the answer",
    file: CONV,
    from: "body: JSON.stringify({ text: turn.answer.slice(0, MAX_SPEAK_CHARS), voice: DEFAULT_VOICE }),",
    to: "body: JSON.stringify({ text: turn.question.slice(0, MAX_SPEAK_CHARS), voice: DEFAULT_VOICE }),",
    expect: "what is spoken is the answer",
  },
  {
    name: "«Μίλα» is drawn without a speech provider",
    file: CHAT,
    from: "voiceAvailability.loaded && voiceAvailability.transcribeAvailable && voiceAvailability.speakAvailable && voiceAvailability.hasMinutes;",
    to: "voiceAvailability.loaded && voiceAvailability.transcribeAvailable && voiceAvailability.hasMinutes;",
    expect: "«Μίλα» is drawn only when both providers are set up",
  },
];

runMutations({ name: "voice-conversation", gate: GATE, targets: [PROVIDERS, CONV, CHAT], mutants: MUTANTS });
