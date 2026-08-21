import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMusicXml } from "@/lib/music/musicXml";

const fixture = readFileSync(join(process.cwd(), "test-data/satb-demo.musicxml"), "utf8");

describe("parseMusicXml", () => {
  it("parses score metadata, parts, measures, tempo, and note events", () => {
    const score = parseMusicXml(fixture);

    expect(score.metadata.title).toBe("Generated SATB Demo");
    expect(score.parts.map((part) => part.name)).toEqual(["Soprano", "Alto", "Tenor", "Bass"]);
    expect(score.measures).toHaveLength(4);
    expect(score.tempoEvents[0]).toEqual({ beat: 0, bpm: 96 });
    expect(score.noteEvents.some((event) => event.partId === "S" && event.midiNote === 72)).toBe(true);
  });

  it("generates normalized note events independent from rests and raw XML", () => {
    const score = parseMusicXml(fixture);
    const altoMeasureThree = score.noteEvents.filter((event) => event.partId === "A" && event.measureNumber === 3);
    const sopranoTie = score.noteEvents.find((event) => event.partId === "S" && event.measureNumber === 3);

    expect(altoMeasureThree).toHaveLength(0);
    expect(sopranoTie?.durationBeats).toBe(8);
  });

  it("preserves separate voices on the same staff", () => {
    const score = parseMusicXml(twoVoiceScore);
    const part = score.parts[0];

    expect(part.staves[0].voices.map((voice) => voice.id)).toEqual(["1", "2"]);
    expect(score.noteEvents.map((event) => `${event.staffId}:${event.voiceId}:${event.startBeat}`)).toEqual([
      "1:1:0",
      "1:2:0",
      "1:1:1",
      "1:2:1",
    ]);
  });

  it("keeps chord notes on the preceding note start beat without advancing the cursor", () => {
    const score = parseMusicXml(chordScore);
    const events = score.noteEvents;

    expect(events.map((event) => ({ midiNote: event.midiNote, startBeat: event.startBeat, durationBeats: event.durationBeats }))).toEqual([
      { midiNote: 60, startBeat: 0, durationBeats: 2 },
      { midiNote: 64, startBeat: 0, durationBeats: 2 },
      { midiNote: 67, startBeat: 0, durationBeats: 2 },
      { midiNote: 62, startBeat: 2, durationBeats: 2 },
    ]);
    expect(score.measures[0]).toMatchObject({ number: 1, startBeat: 0, durationBeats: 4 });
  });

  it("throws useful errors for unsupported XML", () => {
    expect(() => parseMusicXml("<score-timewise />")).toThrow("Only partwise MusicXML scores are supported");
  });
});

const twoVoiceScore = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Upper Staff</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>2</duration></backup>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

const chordScore = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Chord Test</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
