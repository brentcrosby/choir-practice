# Implementation Plan

## Product objective

Build a desktop-first choir rehearsal web app where a singer can upload a score, hear it, isolate or emphasize one vocal part, slow playback without changing pitch, and loop measures while following highlighted notation.

## Architecture

### Web app
- Next.js + TypeScript
- Keep parsing, playback state, and music-domain logic outside React components.
- Treat rendered notation and audio playback as two synchronized views of the same normalized score model.

### Score representation
- Input: MusicXML first.
- Normalize score data into measures, parts/staves/voices, tempo/meter events, and note events.
- Preserve voice identity because one staff may contain multiple vocal parts.

### Rendering
- Use Verovio to render MusicXML/MEI as SVG.
- Build mapping from rendered measure/note IDs to normalized score IDs for click-to-seek and highlighting.

### Playback
- Use Tone.js or Web Audio clock/scheduler.
- No timer-per-note architecture.
- Support chords, ties, rests, tempo changes, meter changes, seek, loop, solo/mute, part gain, and tempo multiplier.

### OMR
- Do not build OMR from scratch.
- Add PDF support only after MusicXML playback is reliable.
- Put Audiveris (or another selected OMR engine) behind a `MusicRecognitionProvider` interface/service.
- Pipeline: PDF -> OMR -> MusicXML/MEI -> existing score player.

## Milestones

### 1. MusicXML player
- Upload .musicxml/.xml/.mxl
- Parse score metadata and parts
- Render score
- Play/pause/stop
- Seek by measure
- Tempo multiplier
- Current-measure highlighting
- Mixer with solo, mute, volume
- Loop measure range
- Tests for parser, scheduler, solo/mute, loop behavior

### 2. Choir intelligence
- Detect Soprano/Alto/Tenor/Bass from names, abbreviations, clefs, staff positions, and ranges
- Confidence-aware assignments
- Allow manual rename/reassignment
- Presets: Full Choir, Soprano Focus, Alto Focus, Tenor Focus, Bass Focus
- Preserve multiple voices per staff

### 3. Practice tools
- Speed 50%-120%
- Measure loop selection
- 0/1/2 bar count-in
- Metronome with separate gain
- Playback transposition +/-12 semitones
- Auto-scroll toggle

### 4. PDF/OMR
- PDF upload
- OMR service/adaptor
- Recognition progress/status/error states
- MusicXML output feeds the same player
- Handle encrypted/corrupt PDFs and partial recognition failures

### 5. Correction workflow
- Rename/reassign detected parts
- Hide bad parts
- Correct tempo/instrument
- Design extension point for note correction without attempting a full notation editor

## Main risks

1. MusicXML dialect/complexity differences.
2. Reliable mapping between Verovio-rendered IDs and playback events.
3. Accurate handling of ties, tuplets, pickup measures, repeat structures, and tempo changes.
4. OMR quality on scans and condensed SATB notation.
5. Splitting two voices that share a staff.

## Definition of first useful release

A user can upload a clean SATB MusicXML score, render it, select Tenor Focus, hear tenor louder than the other parts, slow playback to 75%, click a measure to seek, and loop a chosen measure range while the score follows playback.
