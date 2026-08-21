# Codex Instructions

You are implementing **Choir Practice**, a choir-focused sheet-music rehearsal web app.

Do not copy Soundslice branding, proprietary assets, source code, or exact visual design. The inspiration is functional: interactive score playback, part isolation, tempo control, looping, and practice-focused UX.

## Non-negotiable product strategy

MusicXML playback is the foundation. Do not start by attempting PDF recognition. Complete Milestone 1 before adding OMR.

The desired eventual pipeline is:

`PDF -> OMR provider -> MusicXML/MEI -> normalized music model -> renderer + playback engine`

## First implementation task

Inspect the repository and `PLAN.md`, then implement Milestone 1 end-to-end.

Do not stop after writing a plan.

Milestone 1 must include:

- MusicXML upload (.musicxml/.xml/.mxl where practical)
- score metadata + part parsing
- notation rendering with Verovio
- musical-event playback using Tone.js or a robust Web Audio scheduler
- play/pause/stop
- measure-based seek
- tempo multiplier
- current measure highlighting
- per-part gain
- mute/solo
- loop start/end measures
- useful errors for invalid/unsupported scores
- automated tests for parser/domain logic and playback state

If `.mxl` decompression materially complicates the first pass, implement `.musicxml` and `.xml` first and leave a clearly tracked TODO for `.mxl`; do not fake support.

## Choir-specific domain model

Never assume one staff equals one singer. Preserve:

`Score -> Part -> Staff -> Voice`

A staff may contain two independently controllable voices (e.g. soprano + alto on treble, tenor + bass on bass).

Use a normalized note event model similar to:

```ts
export type NoteEvent = {
  id: string;
  partId: string;
  staffId?: string;
  voiceId?: string;
  midiNote: number;
  startBeat: number;
  durationBeats: number;
  measureNumber: number;
  velocity: number;
};
```

Change the schema if there is a clearly better design, but keep rendering/playback independent from raw MusicXML.

## Playback requirements

Do not use dozens of independent `setTimeout` calls.

Use a musical scheduler that can correctly support:
- simultaneous notes/chords
- rests
- ties
- tempo changes
- meter changes
- multiple voices
- seeking
- looping
- mute/solo
- part volume
- global tempo multiplier

Changing speed should not change pitch.

## UX target

Desktop-first score workspace:
- score dominates the screen
- right-side practice panel for parts and practice controls
- bottom or compact playback controls

Part rows need Solo, Mute, and Volume.

Eventually add focus presets where the selected part is ~100% and others are ~20%.

## OMR rule

Do not implement optical music recognition from scratch.

When the player is solid, integrate Audiveris or another suitable maintained OMR solution behind an interface such as:

```ts
interface MusicRecognitionProvider {
  recognize(inputFile: string): Promise<RecognitionResult>;
}
```

Keep OMR isolated so providers can be replaced.

## Engineering expectations

- strict TypeScript
- small, reusable modules
- no music parsing inside giant React components
- one source of truth for playback state
- minimal dependencies
- accessible controls
- honest error states
- meaningful tests
- no fake placeholder features presented as working

## Tests

At minimum cover:
- MusicXML parsing
- note-event generation
- part/voice separation
- tempo multiplier math
- loop boundaries
- mute/solo resolution

Add an end-to-end or integration smoke test for upload -> render -> start playback -> solo a part, testing scheduler state when audible output itself cannot be asserted.

## Demo score

Add a small public-domain or programmatically generated SATB MusicXML fixture under `test-data/`. Do not commit copyrighted commercial sheet music.

## Finish each work session with

1. What was implemented
2. How to run/test it
3. What is incomplete
4. Known limitations
5. The next concrete implementation step

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
