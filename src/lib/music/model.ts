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

export type Voice = {
  id: string;
  name: string;
};

export type Staff = {
  id: string;
  name: string;
  voices: Voice[];
};

export type ScorePart = {
  id: string;
  name: string;
  abbreviation?: string;
  staves: Staff[];
};

export type ScoreMeasure = {
  number: number;
  startBeat: number;
  durationBeats: number;
};

export type TempoEvent = {
  beat: number;
  bpm: number;
};

export type MeterEvent = {
  beat: number;
  beats: number;
  beatType: number;
};

export type ScoreMetadata = {
  title: string;
  composer?: string;
};

export type NormalizedScore = {
  metadata: ScoreMetadata;
  parts: ScorePart[];
  measures: ScoreMeasure[];
  noteEvents: NoteEvent[];
  tempoEvents: TempoEvent[];
  meterEvents: MeterEvent[];
  sourceXml: string;
};

export class MusicXmlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MusicXmlParseError";
  }
}
