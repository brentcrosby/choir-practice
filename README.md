# Choir Practice

A choir-focused interactive sheet-music practice app inspired by the useful workflow of products such as Soundslice, without copying their branding, assets, source code, or exact UI.

The core product goal is simple: upload a score, hear it, isolate S/A/T/B parts, slow it down, and loop difficult measures.

## Development order

1. MusicXML upload and parsing
2. Interactive notation rendering
3. Reliable musical-event playback
4. SATB part mixer and focus presets
5. Looping, speed, metronome, count-in, and highlighting
6. PDF optical music recognition through a replaceable OMR adapter

The app should remain useful even when PDF recognition is imperfect.

## Recommended stack

- Next.js + TypeScript
- Verovio for notation rendering
- Tone.js or Web Audio for scheduling/playback
- MusicXML/MEI as interchange formats
- Audiveris behind an OMR service boundary for PDF recognition
- Vitest for domain logic tests

## Start here

```bash
npm install
npm run dev
```

Then follow `AGENTS.md` and `PLAN.md`.

## Current state

Milestone 1 is implemented for uncompressed MusicXML:

- Upload `.musicxml` or `.xml` scores.
- Parse metadata, parts, staves, voices, measures, tempo, meter, and normalized note events.
- Render notation with Verovio.
- Play, pause, stop, seek by measure, change tempo, highlight the current measure, loop measures, and mix parts with volume, mute, and solo.
- Run parser and playback-state tests with `npm test`.

Compressed `.mxl` upload is intentionally rejected for now with a visible TODO rather than presented as working. PDF/OMR support has not started.
