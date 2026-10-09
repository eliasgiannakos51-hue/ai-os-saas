# AI provider prices and limits, from official sources only. Read 2026-10-08

> Καταγραφή μιας μέρας (2026-10-08), για το Μέρος 18 §3. Η σύνοψη στα
> ελληνικά και τι σημαίνει για εμάς: `docs/part18-first-answers-2026-10-08.md`.
> Ό,τι σημειώνεται [S] ήρθε από αναζήτηση στον επίσημο ιστότοπο του παρόχου,
> όχι από ολόκληρη τη σελίδα: ελέγχεται πριν μπει σε χρέωση.

## How this was gathered

- **[D] = read directly.** I fetched the full official page from this sandbox on 2026-10-08. Only three vendor pages could be reached this way, all on cloud.google.com:
  - Google Cloud generative-AI pricing: https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing (the old `/vertex-ai/generative-ai/pricing` URL redirects here)
  - https://cloud.google.com/text-to-speech/pricing
  - https://cloud.google.com/speech-to-text/pricing
- **[S] = search excerpt from an official URL.** Every other vendor domain is blocked by this sandbox's egress proxy. That covers openai.com, ai.google.dev, docs.cloud.google.com, bfl.ai, elevenlabs.io, deepgram.com, assemblyai.com, azure.microsoft.com, runwayml.com, lumalabs.ai, kling.ai, minimax.io, heygen.com, synthesia.io, d-id.com, openrouter.ai, fal.ai and stability.ai. For these, the figure comes from a web search restricted to the vendor's own domains (`allowed_domains`). The search tool summarises excerpts of those pages; I did not see the whole page. **[S] figures are weaker evidence. Open the URL and confirm before using one for billing.** Community forums, third-party blogs and aggregators were excluded throughout.
- "(computed)" marks my own arithmetic on official figures. "(estimate)" marks a figure the vendor itself calls an estimate. Every date read is 2026-10-08.

---

## 1. Image generation and editing

| Provider / model | Price | Max resolution | Editing / notable | Official URL | Src |
|---|---|---|---|---|---|
| Google **Nano Banana Pro** (Gemini 3 Pro Image) | $0.134 per 1K or 2K image; $0.24 per 4K image ($120 per 1M output tokens). Input image: 560 tokens. Batch on Gemini API: $0.067 (1K/2K), $0.12 (4K) | 4K (≈16 MP) | Accepts input images (priced per input image) | cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing ; ai.google.dev/gemini-api/docs/pricing (batch) | D ; S |
| Google **Nano Banana 2** (Gemini 3.1 Flash Image) | $0.045 (512), $0.067 (1K), $0.101 (2K), $0.15 (4K), global endpoint. Non-global endpoint costs 10% more ($66 vs $60 per 1M tokens) | 4K | Accepts input images (1,120 tokens each) | same Google Cloud pricing page | D |
| Google **Nano Banana 2.1** | $0.034 (1K), $0.05 (2K), $0.113 (4K). The Gemini API page shows $0.0336 / $0.0504 / $0.113 (same rate) | 4K | Accepts input images; no Flex tier | same ; ai.google.dev/gemini-api/docs/pricing | D ; S |
| Google **Nano Banana 2 Lite** (Gemini 3.1 Flash-Lite Image) | $0.034 per 1K image | Only 1K is priced | Accepts input images | same Google Cloud pricing page | D |
| Google Gemini 2.5 Flash Image | $0.039 per 1024×1024 image (1,290 tokens at $30 per 1M) | not stated | — | same | D |
| Google **Imagen 4** Ultra / Standard / Fast | $0.06 / $0.04 / $0.02 per image. Imagen 4 upscale to 2K/3K/4K: $0.06 | 4K through upscaling | Mask editing is listed for Imagen 3/2/1 only. **Conflict:** the Gemini API docs say Imagen is *shut down* on the Gemini API; Google Cloud still lists these prices | Google Cloud pricing page ; ai.google.dev/gemini-api/docs/models | D ; S |
| OpenAI **gpt-image-2** | 1024×1024: ~$0.006 low / $0.053 medium / $0.211 high. 1024×1536: ~$0.005 / $0.041 / $0.165. **Conflict:** output tokens are $15 per 1M on the pricing page but $30 per 1M on the Enterprise rate card and the 2.5 model pages | Longest edge under 3840 px; at most 8,294,400 px; ratio ≤3:1 | Edit endpoint accepts gpt-image-2; transparent background in preview; mask support **not confirmed** | developers.openai.com/api/docs/guides/image-generation ; developers.openai.com/api/docs/pricing ; developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide | S |
| OpenAI gpt-image-2.5 **Flare** (fast) / **Sunburst** (best) | Same token rates as gpt-image-2. Per-image price **not found** | not found | Both accept the edit endpoint; new quality levels `xhigh` and `max` | developers.openai.com/api/docs/models/gpt-image-2.5-flare ; developers.openai.com/api/docs/changelog | S |
| OpenAI gpt-image-1-mini | 1024²: $0.005 low / $0.011 medium / $0.036 high | 1536 px class | Cheap draft option. The model page shows a "Deprecated" label next to an item; it is unclear which | platform.openai.com/docs/models/gpt-image-1-mini | S |
| BFL **FLUX.2 [max]** | from $0.07 per MP (text-to-image and editing); +$0.03 per extra MP (from the page's structured data). A 4 MP image ≈ $0.16 (computed) | 4 MP (e.g. 2048²); BFL recommends ≤2 MP | Up to 8 reference images via API (10 in the playground) | bfl.ai/pricing ; help.bfl.ai/articles/8531149640-what-are-the-resolution-limits ; docs.bfl.ml/flux_2/flux2_image_editing | S |
| BFL FLUX.2 [pro] | text-to-image from $0.03 per MP (+$0.015 per extra MP); editing from $0.045 per MP | 4 MP | Multi-reference editing | bfl.ai/pricing | S |
| BFL FLUX.2 [flex] | $0.05 per MP on the pricing page. **Conflict:** the model overview says $0.06 per MP; a help article says editing is $0.10 per MP | 4 MP | Text rendering focus | bfl.ai/pricing ; docs.bfl.ml/flux_2/flux2_overview | S |
| BFL FLUX.2 [klein] 4B / 9B | $0.014 + $0.001 per MP / $0.015 + $0.002 per MP | 4 MP | Up to 4 reference images | bfl.ai/pricing | S |
| **Recraft** V4.1 / V4.1 Pro / V4.1 Flash | $0.035 / $0.21 / $0.007 per image. V4 Pro: $0.25. Vector V4.1: $0.08 | V4.1: 1024². Pro: 2048² (up to 3072×1536) | Inpaint, replace background, image-to-image: $0.04 each. Remove background $0.01; crisp upscale $0.004; creative upscale $0.25; vectorize $0.01 | recraft.ai/pricing?tab=api ; recraft.ai/docs/api-reference/pricing ; recraft.ai/docs/recraft-models/recraft-v4-1 | S |
| **Stability AI** Stable Image Ultra / Core / SD3.5 Large / SD3.5 Flash | 8 / 3 / 6.5 / 2.5 credits per image, at 1 credit = $0.01 | not found | Inpaint, remove background, search-and-replace: 5 credits each. Replace background & relight: 8 credits | platform.stability.ai/pricing | S |
| **Ideogram** 3.0 | Per-image API prices **not found on the official page**. Remove background: $0.01 per image | not found | Edit, remix, reframe and replace-background endpoints exist | ideogram.ai/features/api-pricing ; ideogram.ai/features/background-remover/api ; developer.ideogram.ai | S |

## 2. Video generation

Per-second prices. "Audio" means the clip is generated with synchronized sound.

| Provider / model | Price per second | Max clip / native resolution | Audio | Official URL | Src |
|---|---|---|---|---|---|
| Google **Veo 3.1** | With audio: $0.40 (720p/1080p), $0.60 (4K). Video only: $0.20 / $0.40. (The Google Cloud page prints "$/1 count"; the Gemini API page says per second) | 4, 6 or 8 s; 1080p and 4K require 8 s. Extend: +7 s up to 20 times, total ≤148 s on the Gemini API. **Conflict:** the Cloud extend-videos page says 37 s for Veo. The Gemini API docs say Veo 3.1 can "directly generate 720p, 1080p or 4k"; I found no upscaling statement | Yes (speech and sound effects) | Google Cloud pricing page ; ai.google.dev/gemini-api/docs/veo ; docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/extend-videos | D (price) ; S |
| Google **Veo 3.1 Fast** | With audio: $0.10 (720p), $0.12 (1080p), $0.30 (4K). Video only: $0.08 / $0.10 / $0.25 | 8 s. **Conflict:** the Cloud model page lists Fast only up to 1080p, but the pricing page has a 4K row | Yes | same | D ; S |
| Google **Veo 3.1 Lite** | With audio: $0.05 (720p), $0.08 (1080p). Video only: $0.03 / $0.05 | No 4K, no extension | Yes | same ; ai.google.dev/gemini-api/docs/models/veo-3.1-lite-generate-preview | D ; S |
| Google **Gemini Omni Flash** (video output) | $17.50 per 1M video tokens: ≈$0.034 (360p), $0.101 (720p), $0.152 (1080p), $0.304 (4K) (computed from tokens per second on the page) | 3–10 s. **1080p and 4K are upscaled** (Gemini API release notes, 2026-08-27), so native is up to 720p | Included ("with audio") | Google Cloud pricing page ; ai.google.dev/gemini-api/docs/changelog ; ai.google.dev/gemini-api/docs/models/gemini-omni-flash | D (price) ; S |
| OpenAI **Sora 2 / Sora 2 Pro** | sora-2-pro 1080p: $0.70 per second. sora-2 price not found | 4–20 s | — | **The Sora API was discontinued on 2026-09-24** (help.openai.com/en/articles/20001152 ; developers.openai.com/api/docs/deprecations). Not usable | S |
| **Runway** Gen-4.5 | 12 credits per second = $0.12 per second (1 credit = $0.01) | 2–10 s; 720p (1280×720) | Not stated | docs.dev.runwayml.com/guides/pricing/ ; help.runwayml.com/hc/en-us/articles/46974685288467 | S |
| Runway Gen-4 Turbo | 5 credits per second = $0.05 per second | 2–10 s | Not stated | same | S |
| Runway, reselling Veo 3.1 / Veo 3.1 Fast | 40 / 15 credits per second with audio ($0.40 / $0.15); 20 / 10 without | — | Yes | docs.dev.runwayml.com/guides/pricing/ | S |
| **Luma** Ray3.2 | Per clip: 360p draft $0.06 (5 s) / $0.18 (10 s); 540p $0.15 / $0.45; 720p $0.30 / $0.90; 1080p $1.20 / $3.60. HDR costs 2×. Per second: 1080p is $0.24 (5 s clip) or $0.36 (10 s clip) (computed) | 10 s. Native vs upscaled **not stated** | **No native audio**; added as a separate step | docs.agents.lumalabs.ai/guides/pricing/ ; lumalabs.ai/api/pricing | S |
| **Kling** 3.0 | Native audio: $0.126 (720p), $0.168 (1080p), $0.42 (4K). No audio: $0.084 / $0.112 / $0.42. Turbo with audio: $0.112 / $0.14. (1 unit = $0.14) | 3–15 s. Native 4K added in the 2026-04-23 changelog | Yes, but native-audio speech covers **zh, en, ja, ko, es only (no Greek)** | kling.ai/dev/pricing ; kling.ai/document-api/updates/api ; kling.ai/quickstart/klingai-video-3-model-user-guide | S |
| Kling 2.6 | No audio: $0.042 (720p), $0.07 (1080p). Audio at 1080p: $0.14 | not found | Yes (1080p) | kling.ai/dev/pricing | S |
| **MiniMax** Hailuo-2.3 / 2.3-Fast | 2.3: $0.28 per 768p 6 s clip (≈$0.047/s computed); $0.56 per 768p 10 s; $0.49 per 1080p 6 s. Fast: $0.19 / $0.32 / $0.33 | 6 or 10 s; 1080p clips are 6 s only | Not stated | platform.minimax.io/docs/pricing/overview | S |
| MiniMax **H3** / H3-Max | H3: $0.08 (768p), $0.13 (2K). H3-Max: $0.05 (480p), $0.08 (768p). Input video is billed extra | H3: 4–15 s. H3-Max: 5–15 s. Whether 2K is native **not stated**; a separate 768p→2K upscale costs $0.05/s | **Native stereo audio** | platform.minimax.io/docs/pricing/overview ; platform.minimax.io/docs/guides/pricing-paygo | S |

**Greek dialogue:** none of the video vendors' official pages I found lists Greek for native speech. Kling's list excludes it explicitly.

## 3. Voice: text-to-speech with Greek

| Provider / model | Price | Greek officially listed? | Notes | Official URL | Src |
|---|---|---|---|---|---|
| **ElevenLabs** Multilingual v2 / Eleven v3 | $0.08 per 1K characters (API pricing page). **Conflict:** the developer landing page says $0.10 | Yes: Multilingual v2 (29 languages), v3, Flash v2.5 and v4 all list Greek | Billed in USD, not credits | elevenlabs.io/pricing/api ; elevenlabs.io/docs/overview/models | S |
| ElevenLabs Flash / Turbo v2.5 | $0.04 per 1K characters. **Conflict:** the landing page says $0.05 | Yes | Low latency | same | S |
| ElevenLabs **Eleven v4** / v4 Turbo | List price $0.08 / $0.04 per 1K characters. Promotion of $0.022 / $0.011 runs **until 2026-10-12** | Yes | Launched 2026-09-28; 10,000 characters per request | elevenlabs.io/pricing/api ; elevenlabs.io/v4 | S |
| Google Cloud **Chirp 3: HD** | $30 per 1M characters = $0.030 per 1K (first 1M characters per month free) | Yes, el-GR (added 2025-11-10). No pause control or custom pronunciation for Greek | Instant custom voice: $60 per 1M | cloud.google.com/text-to-speech/pricing (D) ; docs.cloud.google.com/text-to-speech/docs/chirp3-hd (S) | D / S |
| Google Cloud WaveNet / Standard / Neural2 / Studio | $4 / $4 / $16 / $160 per 1M characters (page as read) | Greek voice list not reachable | Legacy voices | cloud.google.com/text-to-speech/pricing | D |
| Google **Gemini 3.8 Flash TTS** / Flash-Lite TTS (preview) | Audio output $9 / $6 per 1M tokens until 2026-12-31, then $18 / $12. Text input $0.50, then $1.00 per 1M. At 25 tokens per audio second: ≈$0.0135 / $0.009 per minute now, $0.027 / $0.018 from 2027 (computed) | Greek appears in the language table, but which variant supports it **not confirmed**. The older Gemini-TTS page marks Greek "Preview" | Multi-speaker | cloud.google.com/text-to-speech/pricing ; docs.cloud.google.com/text-to-speech/docs/gemini-tts | D / S |
| **OpenAI** tts-1 / tts-1-hd / gpt-4o-mini-tts | $15 / $30 per 1M characters. gpt-4o-mini-tts: $0.60 per 1M input tokens and $12 per 1M audio tokens | Language support "generally follows Whisper", which includes Greek; voices are optimized for English | **Deprecated. Shutdown 2027-01-06**; the listed replacement is gpt-realtime-2.1-mini (audio output $20 per 1M tokens; a Realtime model, not a TTS endpoint) | developers.openai.com/api/docs/guides/text-to-speech ; developers.openai.com/api/docs/deprecations | S |
| **Azure** Speech neural / HD | **Not found on the official page.** The pricing page's dollar figures did not appear in any excerpt | Yes: el-GR-AthinaNeural; el-GR-NestorasNeural (release notes, Dec 2020) | — | azure.microsoft.com/en-us/pricing/details/speech/ ; learn.microsoft.com/azure/ai-services/speech-service/language-support | S |

## 4. Transcription (speech-to-text) with Greek

| Provider / model | Price per minute | Greek? | Diarization | Official URL | Src |
|---|---|---|---|---|---|
| **ElevenLabs Scribe v2** (batch) | $0.22 per hour ≈ $0.0037 per minute (computed). Realtime: $0.39 per hour | Yes, "ell", in the ≤5% WER tier | Yes in batch (up to 32 speakers; another page says 48). Not in realtime | elevenlabs.io/pricing/api ; elevenlabs.io/docs/overview/capabilities/speech-to-text | S |
| **Google** Speech-to-Text V2 Standard (includes chirp) | $0.016 (0–500k minutes per month); $0.01, $0.008, $0.004 at higher tiers. **Dynamic batch: $0.003** | Chirp 3: el-GR is GA | **Chirp 3 diarization locales exclude Greek** | cloud.google.com/speech-to-text/pricing (D) ; docs.cloud.google.com/speech-to-text/docs/models/chirp-3 (S) | D / S |
| Google **Gemini 3.5 Transcribe** | $0.0051 per audio minute, batch (estimate printed by Google). Live: $0.008925 | not confirmed | not confirmed | Google Cloud pricing page | D |
| **Deepgram** Nova-3 Monolingual | $0.0043 pay-as-you-go ($0.0036 Growth). Multilingual: $0.0052 | Yes, "el", on **monolingual** Nova-3 only (not in multilingual) | Add-on $0.0020 per minute. **Conflict:** the May 2026 changelog says diarization is "included" | deepgram.com/pricing ; developers.deepgram.com/docs/models-languages-overview | S |
| **AssemblyAI** Universal-2 / Universal-3.5 Pro | $0.15 per hour (≈$0.0025 per minute) / $0.21 per hour | Universal-2 (99 languages): yes. U-3.5 Pro's 18-language list excludes Greek and falls back to Universal-2. **Conflict:** the Greek landing page promotes U-3.5 Pro | Add-on $0.02 per hour; Greek coverage not confirmed | assemblyai.com/pricing ; assemblyai.com/changelog ; assemblyai.com/languages/greek | S |
| **OpenAI** gpt-transcribe / gpt-4o-transcribe / gpt-4o-mini-transcribe | $0.0045 (estimate) / $0.006 / $0.003. Live (gpt-live-transcribe): $0.017 | Whisper language list includes Greek | gpt-4o-transcribe-diarize: token rates $2.50 in / $10 out per 1M; per-minute price not found | developers.openai.com/api/docs/pricing | S |
| OpenAI **whisper-1** | **Not found on the official page** | Yes | No | **whisper-1, gpt-4o-transcribe, gpt-4o-mini-transcribe and gpt-4o-transcribe-diarize are removed 2027-02-26**; migrate to gpt-transcribe or gpt-live-transcribe | S |

## 5. Aggregator fees

| Aggregator | Fee on top of provider prices | Official URL | Src |
|---|---|---|---|
| **OpenRouter** | 0% markup on inference. **5.5% platform fee on pay-as-you-go credit purchases, $0.80 minimum**; 8% on the Business plan. Bring-your-own-key: free up to a plan allowance ($25,000 per month on pay-as-you-go), then 5% of list price. Crypto surcharge exists, percentage **not found**. Platform fees are non-refundable | openrouter.ai/docs/faq ; openrouter.ai/business ; openrouter.ai/support | S |
| fal.ai (media-capable alternative) | **No markup percentage published.** fal sets its own per-output prices. Credits expire 365 days after purchase. Failed (HTTP 5xx) requests and queue time are free. My comparison against Google's own prices: Veo 3.1 standard matches ($0.40/s with audio). Veo 3.1 Fast with audio costs **$0.15/s on fal** vs $0.10 (720p) / $0.12 (1080p) at Google. Nano Banana 2 costs $0.08 per image on fal vs $0.067 per 1K image at Google | fal.ai/pricing ; fal.ai/docs/documentation/model-apis/pricing ; fal.ai/models/fal-ai/veo3.1/fast ; fal.ai/legal/terms-of-service | S |

## 6. Music generation with a public API

| Provider / model | Price | Max duration | Commercial licence (official statements) | Official URL | Src |
|---|---|---|---|---|---|
| **Stability Stable Audio 2.5 / 3.0** | 20 credits ($0.20) / 26 credits ($0.26) per generation | 3 min / 6 min | Terms of Service assign output rights to the user where law allows. Trained on licensed data: AudioSparx, plus screened Freesound CC for 3.0. Community licence below $1M annual revenue, Enterprise above; whether that threshold applies to API use (vs self-hosting) is **not confirmed** | platform.stability.ai/pricing ; stability.ai/terms-of-service ; stability.ai/license ; stability.ai/news-updates/meet-stable-audio-3-… | S |
| **ElevenLabs Eleven Music** | $0.15 per minute (may predate a later price cut of up to 50%) | **Conflict:** API page says 3 s–10 min; pricing page says 5 min | Commercial use on Starter and above. Advertising, film, TV, games and enterprise distribution need an **additional licence** (FAQ). Another page says "cleared for nearly all commercial uses". Binding text: elevenlabs.io/eleven-music-v1-terms | elevenlabs.io/pricing/api ; elevenlabs.io/eleven-music-api | S |
| **Google Lyria 3 Pro** / Lyria 3 (clip) / Lyria 2 | $0.08 per song / $0.04 per 30 s clip / $0.06 per count | Pro: 184 s (Cloud model page); "up to 3 minutes" (launch post) | All outputs carry SynthID. Lyria-specific IP indemnity **not confirmed**. Lyria 3.5 went GA on 2026-09-03; price not found. The Gemini API page calls Lyria 3 "legacy" | Google Cloud pricing page (D) ; ai.google.dev/gemini-api/docs/pricing (S) | D / S |
| MiniMax Music-2.5 | **Conflict:** $0.03 vs $0.15 per ≤5 minutes | ≤5 min per billing block | Paid music API **closed to new users from 2026-08-20** | platform.minimax.io/docs/guides/pricing-paygo | S |
| Mubert API | $49/month (100 generations), $199 (5,000), $499 (30,000) | — | No resale, streaming-service distribution or Content ID. Monetization and sublicensing terms conflict between pages | mubert.com/api ; mubert.com/render/license | S |
| Beatoven.ai API | **Not found on the official page** | — | "Cleared for commercial use" (API page) | beatoven.ai/api | S |

No lawsuit statements are included; none was taken from an official page.

## 7. Avatar / talking-head video with Greek

| Provider | API price | Greek? | Official URL | Src |
|---|---|---|---|---|
| **HeyGen** | Self-serve: Avatar IV Photo Avatar $2.31/min (46 credits); Digital Twin $4.83/min (97 credits); Avatar V Digital Twin $7.20/min. Enterprise: 1 credit = $0.50; Avatar IV costs 0.1 credit/s = $0.05/s ≈ $3/min. **Conflict:** the Avatar IV guide says ~$4/min at 1080p and $5/min at 4K. $5 minimum top-up; no free API credits since Feb 2026. Only spoken seconds are billed | Yes: "Greek (Greece)" in both the voice and the video-translation language lists | help.heygen.com/en/articles/10060327-heygen-api-pricing-explained ; developers.heygen.com/docs/enterprise-pricing ; help.heygen.com/en/articles/11391932 | S |
| **Synthesia** | **USD per minute not found.** API allowance: up to 360 min of video per year, deducted from the plan. API video costs 160 credits/min (Oct 2026 article) vs 75 (older article). Pro plan: $64/month billed yearly | Yes for translation (code EL) and for voice cloning. A Greek stock voice is **not confirmed** | synthesia.io/pricing ; help.synthesia.io/en/articles/17217419 ; docs.synthesia.io/docs/supported-languages | S |
| **D-ID** | **Not found on the official page.** 1 credit = up to 15 s of video; streaming credits cost half | Greek listed for Video Translate. Greek TTS **not confirmed** ("119"/"120+" languages) | d-id.com/pricing/api/ ; help.d-id.com/hc/en-us/articles/30711562813073 | S |
| Google Gemini 3.8 Live API, "Output: video (avatar)" | $1.00 per 1M tokens at 6,192 tokens/s ≈ $0.0062/s ≈ $0.37/min (computed). Audio output is extra. Billed only while the avatar speaks | **Not confirmed** | Google Cloud pricing page | D |

---

## Recommendation per category

These are my judgement. Every price behind them is in the tables above.

| Category | Draft | Final | Second provider for failover |
|---|---|---|---|
| Image | Nano Banana 2.1 at 1K, $0.034 [D] | Nano Banana Pro: 2K $0.134, 4K $0.24 [D] | FLUX.2 [pro]/[max] (BFL) [S]; Recraft V4.1 Flash ($0.007) for cheap drafts [S] |
| Video | Veo 3.1 Lite, 720p with audio, $0.05/s [D] | Veo 3.1: 1080p with audio $0.40/s, 4K $0.60/s [D] | Kling 3.0 (1080p native audio $0.168/s, up to 15 s; no Greek speech) [S]; MiniMax H3 (native audio, 4–15 s) [S]. The same Veo model via Runway or fal covers a vendor outage, not a model outage |
| Greek TTS | ElevenLabs Flash v2.5, $0.04/1K chars [S]; or Google Chirp 3 HD el-GR, $0.03/1K [D price] | ElevenLabs Eleven v3 / v4, $0.08/1K list [S] | Google Chirp 3 HD el-GR [D/S]. **Do not build on OpenAI TTS** (shutdown 2027-01-06) |
| Greek STT | Google STT V2 dynamic batch, $0.003/min (no Greek diarization) [D] | ElevenLabs Scribe v2, $0.22/h, Greek + diarization [S] | Deepgram Nova-3 monolingual "el", $0.0043 + $0.0020 diarization [S]; OpenAI gpt-transcribe $0.0045 (whisper-1 removed 2027-02-26) [S] |
| Aggregator | — | OpenRouter for text models (5.5% on credit purchases) [S] | fal.ai for media; no published fee, and its per-model prices are sometimes above direct [S] |
| Music | Lyria 3 clip, $0.04 per 30 s [D] | Stable Audio 3.0, $0.26 per ≤6 min, clearest licence statements [S] | ElevenLabs Music, $0.15/min (check licence scope) [S] |
| Avatar (Greek) | HeyGen Photo Avatar, ~$2.31/min [S] | HeyGen Avatar IV/V Digital Twin, $4.83–7.20/min [S] | Synthesia (Greek; $/min needs sales confirmation) [S] |

## Figures I could NOT confirm officially

- **Azure Speech:** every TTS and STT price. The official page's dollar amounts did not appear in any excerpt.
- **OpenAI:** whisper-1 per-minute price; gpt-image-2 output-token rate ($15 vs $30 per 1M); gpt-image-2.5 per-image prices; mask inpainting on gpt-image-2; gpt-4o-transcribe-diarize per-minute price; diarization on gpt-transcribe; sora-2 720p price (moot after 2026-09-24).
- **Ideogram:** all per-image API prices. **Stability:** maximum image resolution.
- **Google:** Veo 1080p/4K stated as native (the docs say "directly generate" but never "native"); Veo 3.1 Fast at 4K (pricing lists it, the model page does not); Veo extension length (148 s vs 37 s); Greek on Gemini 3.8 TTS; Greek voice names for Chirp 3 HD; Greek and diarization on Gemini 3.5 Transcribe; Lyria 3.5 price; Lyria IP indemnity; why Imagen 4 is listed on Cloud but shut down on the Gemini API.
- **Runway:** Gen-4.5 audio; Veo 3.1 resolution through Runway.
- **Luma:** whether 1080p is native.
- **Kling:** max duration for 2.6; standard/pro mapping.
- **MiniMax:** Hailuo audio; whether H3 2K is native; Music-2.5 price.
- **Deepgram:** whether pre-recorded diarization is billed as an add-on or included.
- **AssemblyAI:** Greek on U-3.5 Pro; Greek diarization.
- **ElevenLabs:** v4 price after 2026-10-12; Music maximum duration and licence scope; TTS price conflicts ($0.04 vs $0.05; $0.08 vs $0.10).
- **OpenRouter:** crypto fee percentage. **fal.ai:** markup percentage.
- **Beatoven, Synthesia, D-ID:** API USD price per minute. Greek TTS on D-ID; Greek stock voices on Synthesia.
- **All video models:** Greek in native generated speech.

## Relevance to this repository (read-only check)

- `src/lib/voice/voice-pricing.ts` prices transcription on **whisper-1 at $0.006/min**. OpenAI's deprecations page schedules whisper-1 for removal on **2027-02-26** [S], and $0.006 for whisper-1 did not appear in any official excerpt.
- The same file uses `eleven_turbo_v2_5` at **$0.15 per 1K characters** (described as a deliberate upper bound). ElevenLabs' API pricing page shows Flash/Turbo at $0.04 per 1K [S].
- `scripts/video-cost.mjs` takes Runway and Luma rates from apiframe.ai (a third party) and assumes no provider makes more than 10 s per call.
  - Official Runway figures above match ($0.05 and $0.12 per second) [S].
  - Luma Ray3.2 1080p is $0.24/s only for 5 s clips; a 10 s clip works out to $0.36/s [S].
  - Kling 3.0 (3–15 s) and MiniMax H3 (4–15 s) make clips longer than 10 s [S].

