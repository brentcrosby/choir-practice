import { DOMParser } from "@xmldom/xmldom";
import {
  MeterEvent,
  MusicXmlParseError,
  NormalizedScore,
  NoteEvent,
  ScoreMeasure,
  ScorePart,
  TempoEvent,
} from "./model";

type XmlNode = {
  nodeType: number;
  nodeName: string;
};

type XmlNodeList = {
  length: number;
  item(index: number): XmlNode | null;
};

type XmlElement = XmlNode & {
  childNodes: XmlNodeList;
  getAttribute(name: string): string | null;
  textContent: string | null;
};

type PendingTie = NoteEvent;

const DEFAULT_DIVISIONS = 1;
const DEFAULT_TEMPO_BPM = 120;
const DEFAULT_METER = { beats: 4, beatType: 4 };

export function parseMusicXml(sourceXml: string): NormalizedScore {
  if (!sourceXml.trim()) {
    throw new MusicXmlParseError("The selected file is empty.");
  }

  const document = new DOMParser({
    onError: () => undefined,
  }).parseFromString(sourceXml, "application/xml");

  const root = document.documentElement as XmlElement | null;
  if (!root || root.nodeName === "parsererror") {
    throw new MusicXmlParseError("The selected file is not valid XML.");
  }

  if (root.nodeName !== "score-partwise") {
    throw new MusicXmlParseError("Only partwise MusicXML scores are supported in Milestone 1.");
  }

  const partList = firstChild(root, "part-list");
  if (!partList) {
    throw new MusicXmlParseError("MusicXML score is missing a part list.");
  }

  const partDefinitions = parsePartDefinitions(partList);
  if (partDefinitions.length === 0) {
    throw new MusicXmlParseError("MusicXML score does not define any parts.");
  }

  const metadata = {
    title:
      textAt(root, ["work", "work-title"]) ??
      textAt(root, ["movement-title"]) ??
      "Untitled score",
    composer: firstTextByType(root, "creator", "composer") ?? undefined,
  };

  const partsById = new Map<string, ScorePart>();
  for (const part of partDefinitions) {
    partsById.set(part.id, { ...part, staves: [] });
  }

  const noteEvents: NoteEvent[] = [];
  const tempoEvents: TempoEvent[] = [{ beat: 0, bpm: DEFAULT_TEMPO_BPM }];
  const meterEvents: MeterEvent[] = [{ beat: 0, ...DEFAULT_METER }];
  const measureMap = new Map<number, ScoreMeasure>();

  for (const partElement of children(root, "part")) {
    parsePartElement(partElement, partsById, noteEvents, tempoEvents, meterEvents, measureMap);
  }

  const measures = [...measureMap.values()].sort((a, b) => a.startBeat - b.startBeat || a.number - b.number);
  if (measures.length === 0) {
    throw new MusicXmlParseError("MusicXML score does not contain any measures.");
  }

  const parts = [...partsById.values()].map((part) => ({
    ...part,
    staves: part.staves.length > 0 ? part.staves : [{ id: "1", name: "Staff 1", voices: [{ id: "1", name: "Voice 1" }] }],
  }));

  return {
    metadata,
    parts,
    measures,
    noteEvents: noteEvents.sort((a, b) => a.startBeat - b.startBeat || a.partId.localeCompare(b.partId)),
    tempoEvents: uniqueTempoEvents(tempoEvents),
    meterEvents: uniqueMeterEvents(meterEvents),
    sourceXml,
  };
}

function parsePartDefinitions(partList: XmlElement): ScorePart[] {
  return children(partList, "score-part").map((partElement) => {
    const id = requiredAttribute(partElement, "id", "A score-part is missing its id.");
    return {
      id,
      name: childText(partElement, "part-name") ?? id,
      abbreviation: childText(partElement, "part-abbreviation") ?? undefined,
      staves: [],
    };
  });
}

function parsePartElement(
  partElement: XmlElement,
  partsById: Map<string, ScorePart>,
  noteEvents: NoteEvent[],
  tempoEvents: TempoEvent[],
  meterEvents: MeterEvent[],
  measureMap: Map<number, ScoreMeasure>,
) {
  const partId = requiredAttribute(partElement, "id", "A part is missing its id.");
  const part = partsById.get(partId);
  if (!part) {
    throw new MusicXmlParseError(`Part '${partId}' is used but not defined in the part list.`);
  }

  let divisions = DEFAULT_DIVISIONS;
  let cursorBeat = 0;
  const pendingTies = new Map<string, PendingTie>();

  for (const measureElement of children(partElement, "measure")) {
    const measureNumber = parseMeasureNumber(measureElement);
    const measureStartBeat = cursorBeat;
    let measureEndBeat = measureStartBeat;

    for (const node of childElements(measureElement)) {
      switch (node.nodeName) {
        case "attributes": {
          const parsedDivisions = numberFromText(childText(node, "divisions"));
          if (parsedDivisions && parsedDivisions > 0) {
            divisions = parsedDivisions;
          }

          const time = firstChild(node, "time");
          if (time) {
            const beats = numberFromText(childText(time, "beats"));
            const beatType = numberFromText(childText(time, "beat-type"));
            if (beats && beatType) {
              meterEvents.push({ beat: measureStartBeat, beats, beatType });
            }
          }
          break;
        }

        case "direction": {
          const bpm = parseTempo(node);
          if (bpm) {
            tempoEvents.push({ beat: cursorBeat, bpm });
          }
          break;
        }

        case "sound": {
          const tempo = numberFromText(node.getAttribute("tempo"));
          if (tempo) {
            tempoEvents.push({ beat: cursorBeat, bpm: tempo });
          }
          break;
        }

        case "backup": {
          cursorBeat = Math.max(measureStartBeat, cursorBeat - durationBeats(node, divisions));
          break;
        }

        case "forward": {
          cursorBeat += durationBeats(node, divisions);
          measureEndBeat = Math.max(measureEndBeat, cursorBeat);
          break;
        }

        case "note": {
          const isChord = firstChild(node, "chord") !== undefined;
          const duration = durationBeats(node, divisions);
          const startBeat = cursorBeat;
          const staffId = childText(node, "staff") ?? "1";
          const voiceId = childText(node, "voice") ?? "1";
          ensureVoice(part, staffId, voiceId);

          if (!firstChild(node, "rest") && !firstChild(node, "grace")) {
            const midiNote = parseMidiNote(node);
            const tieStarts = hasTie(node, "start");
            const tieStops = hasTie(node, "stop");
            const id = `${partId}-m${measureNumber}-b${formatBeat(startBeat)}-s${staffId}-v${voiceId}-n${midiNote}-${noteEvents.length}`;
            const tieKey = `${partId}:${staffId}:${voiceId}:${midiNote}`;

            if (tieStops) {
              const pending = pendingTies.get(tieKey);
              if (pending) {
                pending.durationBeats += duration;
                if (!tieStarts) {
                  noteEvents.push(pending);
                  pendingTies.delete(tieKey);
                }
              } else if (!tieStarts) {
                noteEvents.push(createNote(id, partId, staffId, voiceId, midiNote, startBeat, duration, measureNumber));
              }
            } else if (tieStarts) {
              pendingTies.set(tieKey, createNote(id, partId, staffId, voiceId, midiNote, startBeat, duration, measureNumber));
            } else {
              noteEvents.push(createNote(id, partId, staffId, voiceId, midiNote, startBeat, duration, measureNumber));
            }
          }

          if (!isChord) {
            cursorBeat += duration;
            measureEndBeat = Math.max(measureEndBeat, cursorBeat);
          }
          break;
        }

        default:
          break;
      }
    }

    upsertMeasure(measureMap, measureNumber, measureStartBeat, Math.max(0, measureEndBeat - measureStartBeat));
    cursorBeat = Math.max(cursorBeat, measureEndBeat);
  }

  for (const pending of pendingTies.values()) {
    noteEvents.push(pending);
  }
}

function parseMidiNote(noteElement: XmlElement): number {
  const pitch = firstChild(noteElement, "pitch");
  if (!pitch) {
    throw new MusicXmlParseError("A pitched note is missing pitch information.");
  }

  const step = childText(pitch, "step");
  const octave = numberFromText(childText(pitch, "octave"));
  if (!step || octave === undefined) {
    throw new MusicXmlParseError("A pitched note is missing step or octave information.");
  }

  const semitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[step as "A" | "B" | "C" | "D" | "E" | "F" | "G"];
  const alter = numberFromText(childText(pitch, "alter")) ?? 0;
  return (octave + 1) * 12 + semitone + alter;
}

function createNote(
  id: string,
  partId: string,
  staffId: string,
  voiceId: string,
  midiNote: number,
  startBeat: number,
  durationBeats: number,
  measureNumber: number,
): NoteEvent {
  return {
    id,
    partId,
    staffId,
    voiceId,
    midiNote,
    startBeat,
    durationBeats,
    measureNumber,
    velocity: 0.82,
  };
}

function parseTempo(element: XmlElement): number | undefined {
  const soundTempo = numberFromText(firstChild(element, "sound")?.getAttribute("tempo"));
  if (soundTempo) {
    return soundTempo;
  }

  const metronome = firstChild(firstChild(element, "direction-type") ?? element, "metronome");
  return numberFromText(childText(metronome, "per-minute"));
}

function hasTie(noteElement: XmlElement, type: "start" | "stop"): boolean {
  return children(noteElement, "tie").some((tie) => tie.getAttribute("type") === type);
}

function durationBeats(element: XmlElement, divisions: number): number {
  return (numberFromText(childText(element, "duration")) ?? 0) / divisions;
}

function parseMeasureNumber(measureElement: XmlElement): number {
  const rawNumber = measureElement.getAttribute("number");
  const parsed = Number.parseInt(rawNumber ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ensureVoice(part: ScorePart, staffId: string, voiceId: string): void {
  let staff = part.staves.find((candidate) => candidate.id === staffId);
  if (!staff) {
    staff = { id: staffId, name: `Staff ${staffId}`, voices: [] };
    part.staves.push(staff);
  }

  if (!staff.voices.some((voice) => voice.id === voiceId)) {
    staff.voices.push({ id: voiceId, name: `Voice ${voiceId}` });
  }
}

function upsertMeasure(measures: Map<number, ScoreMeasure>, number: number, startBeat: number, durationBeats: number): void {
  const existing = measures.get(number);
  if (!existing) {
    measures.set(number, { number, startBeat, durationBeats });
    return;
  }

  const start = Math.min(existing.startBeat, startBeat);
  const end = Math.max(existing.startBeat + existing.durationBeats, startBeat + durationBeats);
  measures.set(number, { number, startBeat: start, durationBeats: end - start });
}

function uniqueTempoEvents(events: TempoEvent[]): TempoEvent[] {
  const byBeat = new Map<number, TempoEvent>();
  for (const event of events) {
    byBeat.set(event.beat, event);
  }
  return [...byBeat.values()].sort((a, b) => a.beat - b.beat);
}

function uniqueMeterEvents(events: MeterEvent[]): MeterEvent[] {
  const byBeat = new Map<number, MeterEvent>();
  for (const event of events) {
    byBeat.set(event.beat, event);
  }
  return [...byBeat.values()].sort((a, b) => a.beat - b.beat);
}

function requiredAttribute(element: XmlElement, name: string, message: string): string {
  const value = element.getAttribute(name);
  if (!value) {
    throw new MusicXmlParseError(message);
  }
  return value;
}

function childText(element: XmlElement | undefined, tagName: string): string | undefined {
  if (!element) {
    return undefined;
  }
  return firstChild(element, tagName)?.textContent?.trim() || undefined;
}

function textAt(element: XmlElement, path: string[]): string | undefined {
  let cursor: XmlElement | undefined = element;
  for (const segment of path) {
    cursor = firstChild(cursor, segment);
    if (!cursor) {
      return undefined;
    }
  }
  return cursor.textContent?.trim() || undefined;
}

function firstTextByType(element: XmlElement, tagName: string, type: string): string | undefined {
  return children(element, tagName).find((child) => child.getAttribute("type") === type)?.textContent?.trim() || undefined;
}

function firstChild(element: XmlElement | undefined, tagName: string): XmlElement | undefined {
  return children(element, tagName)[0];
}

function children(element: XmlElement | undefined, tagName: string): XmlElement[] {
  if (!element) {
    return [];
  }
  return childElements(element).filter((child) => child.nodeName === tagName);
}

function childElements(element: XmlElement): XmlElement[] {
  const nodes: XmlElement[] = [];
  for (let index = 0; index < element.childNodes.length; index += 1) {
    const child = element.childNodes.item(index);
    if (child && child.nodeType === 1) {
      nodes.push(child as XmlElement);
    }
  }
  return nodes;
}

function numberFromText(value: string | null | undefined): number | undefined {
  if (value === undefined || value === null || value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatBeat(beat: number): string {
  return beat.toFixed(3).replace(".", "_");
}
