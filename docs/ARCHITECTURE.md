# Architecture Notes

## Separation of concerns

### Import layer
Reads MusicXML/MXL and produces a parser-level representation.

### Music core
Normalizes imported notation into stable domain objects: score, parts, staves, voices, measures, tempo/meter events, and note events.

### Renderer adapter
Verovio-specific code. Rendering IDs should map back to normalized measure/note IDs.

### Playback engine
Schedules normalized events and exposes transport state. The React UI should call a small playback API rather than schedule notes itself.

### Practice state
Mixer values, focus presets, tempo multiplier, loop range, transposition, metronome, and count-in.

### OMR service
Future boundary that turns PDFs/images into MusicXML/MEI without leaking OMR implementation details into the player.

## Suggested source layout

```text
src/
  app/
  components/
  features/
    score-import/
    score-viewer/
    playback/
    mixer/
    practice/
  lib/
    music/
      parser/
      model/
      timing/
    verovio/
    audio/
```
