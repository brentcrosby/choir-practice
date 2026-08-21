import { NormalizedScore, NoteEvent, ScoreMeasure, TempoEvent } from "@/lib/music/model";

export type TransportStatus = "stopped" | "playing" | "paused";

export type PartMix = {
  partId: string;
  volume: number;
  muted: boolean;
  solo: boolean;
};

export type LoopRange = {
  startMeasure: number;
  endMeasure: number;
};

export type PlaybackState = {
  status: TransportStatus;
  currentBeat: number;
  tempoMultiplier: number;
  parts: Record<string, PartMix>;
  loop: LoopRange | null;
};

export type BeatWindow = {
  startBeat: number;
  endBeat: number;
};

export type TransportClock = {
  transportStartBeat: number;
  transportStartTime: number;
  currentBeat: number;
  scheduledUntilBeat: number;
};

export function createPlaybackState(score: NormalizedScore): PlaybackState {
  return {
    status: "stopped",
    currentBeat: 0,
    tempoMultiplier: 1,
    parts: Object.fromEntries(
      score.parts.map((part) => [
        part.id,
        {
          partId: part.id,
          volume: 1,
          muted: false,
          solo: false,
        },
      ]),
    ),
    loop: null,
  };
}

export function clampTempoMultiplier(value: number): number {
  return clamp(value, 0.5, 1.2);
}

export function effectiveBpm(baseBpm: number, tempoMultiplier: number): number {
  return baseBpm * clampTempoMultiplier(tempoMultiplier);
}

export function resolvePartGain(partId: string, parts: Record<string, PartMix>): number {
  const mix = parts[partId];
  if (!mix) {
    return 0;
  }

  const hasSolo = Object.values(parts).some((part) => part.solo);
  if (mix.muted || (hasSolo && !mix.solo)) {
    return 0;
  }

  return clamp(mix.volume, 0, 1);
}

export function getLoopWindow(score: NormalizedScore, loop: LoopRange | null): { startBeat: number; endBeat: number } | null {
  if (!loop) {
    return null;
  }

  const start = findMeasure(score, loop.startMeasure);
  const end = findMeasure(score, loop.endMeasure);
  if (!start || !end) {
    return null;
  }

  return {
    startBeat: start.startBeat,
    endBeat: end.startBeat + end.durationBeats,
  };
}

export function getScoreEndBeat(score: NormalizedScore): number {
  return score.measures.reduce((endBeat, measure) => Math.max(endBeat, measure.startBeat + measure.durationBeats), 0);
}

export function seekBeatForMeasure(score: NormalizedScore, measureNumber: number): number {
  return findMeasure(score, measureNumber)?.startBeat ?? 0;
}

export function currentMeasureNumber(score: NormalizedScore, beat: number): number {
  const measure = [...score.measures]
    .sort((a, b) => a.startBeat - b.startBeat)
    .findLast((candidate) => beat >= candidate.startBeat);
  return measure?.number ?? score.measures[0]?.number ?? 1;
}

export function eventsInBeatWindow(events: NoteEvent[], startBeat: number, endBeat: number): NoteEvent[] {
  return events.filter((event) => event.startBeat >= startBeat && event.startBeat < endBeat);
}

export function readTransportBeat(
  tempoEvents: TempoEvent[],
  clock: Pick<TransportClock, "transportStartBeat" | "transportStartTime">,
  currentTime: number,
  tempoMultiplier: number,
): number {
  const elapsed = Math.max(0, currentTime - clock.transportStartTime);
  return beatAtElapsedSeconds(tempoEvents, clock.transportStartBeat, elapsed, tempoMultiplier);
}

export function rebaseTransportClock(
  tempoEvents: TempoEvent[],
  clock: TransportClock,
  currentTime: number,
  tempoMultiplier: number,
): TransportClock {
  const currentBeat = readTransportBeat(tempoEvents, clock, currentTime, tempoMultiplier);
  return {
    transportStartBeat: currentBeat,
    transportStartTime: currentTime,
    currentBeat,
    scheduledUntilBeat: currentBeat,
  };
}

export function shouldWrapLoop(score: NormalizedScore, currentBeat: number, loop: LoopRange | null): boolean {
  const loopWindow = getLoopWindow(score, loop);
  return loopWindow !== null && currentBeat >= loopWindow.endBeat;
}

export function shouldStopAtScoreEnd(score: NormalizedScore, currentBeat: number, loop: LoopRange | null): boolean {
  return loop === null && currentBeat >= getScoreEndBeat(score);
}

export function schedulerBeatWindow(
  score: NormalizedScore,
  currentBeat: number,
  lookaheadSeconds: number,
  tempoMultiplier: number,
  loop: LoopRange | null,
): BeatWindow {
  const rawEndBeat = beatAtElapsedSeconds(score.tempoEvents, currentBeat, lookaheadSeconds, tempoMultiplier);
  const loopWindow = getLoopWindow(score, loop);
  const hardEndBeat = loopWindow?.endBeat ?? getScoreEndBeat(score);

  return {
    startBeat: currentBeat,
    endBeat: Math.min(rawEndBeat, hardEndBeat),
  };
}

export function secondsBetweenBeats(
  tempoEvents: TempoEvent[],
  startBeat: number,
  endBeat: number,
  tempoMultiplier: number,
): number {
  if (endBeat <= startBeat) {
    return 0;
  }

  const sorted = sortTempoEvents(tempoEvents);
  let seconds = 0;
  let cursor = startBeat;
  let tempoIndex = activeTempoIndex(sorted, startBeat);

  while (cursor < endBeat) {
    const tempo = sorted[tempoIndex] ?? { beat: 0, bpm: 120 };
    const nextTempoBeat = sorted[tempoIndex + 1]?.beat ?? Number.POSITIVE_INFINITY;
    const segmentEnd = Math.min(endBeat, nextTempoBeat);
    seconds += ((segmentEnd - cursor) * 60) / effectiveBpm(tempo.bpm, tempoMultiplier);
    cursor = segmentEnd;
    tempoIndex += 1;
  }

  return seconds;
}

export function beatAtElapsedSeconds(
  tempoEvents: TempoEvent[],
  startBeat: number,
  elapsedSeconds: number,
  tempoMultiplier: number,
): number {
  if (elapsedSeconds <= 0) {
    return startBeat;
  }

  const sorted = sortTempoEvents(tempoEvents);
  let cursorBeat = startBeat;
  let remainingSeconds = elapsedSeconds;
  let tempoIndex = activeTempoIndex(sorted, startBeat);

  while (remainingSeconds > 0) {
    const tempo = sorted[tempoIndex] ?? { beat: 0, bpm: 120 };
    const nextTempoBeat = sorted[tempoIndex + 1]?.beat ?? Number.POSITIVE_INFINITY;
    const secondsToNextTempo = ((nextTempoBeat - cursorBeat) * 60) / effectiveBpm(tempo.bpm, tempoMultiplier);

    if (remainingSeconds <= secondsToNextTempo) {
      return cursorBeat + (remainingSeconds * effectiveBpm(tempo.bpm, tempoMultiplier)) / 60;
    }

    cursorBeat = nextTempoBeat;
    remainingSeconds -= secondsToNextTempo;
    tempoIndex += 1;
  }

  return cursorBeat;
}

function findMeasure(score: NormalizedScore, measureNumber: number): ScoreMeasure | undefined {
  return score.measures.find((measure) => measure.number === measureNumber);
}

function sortTempoEvents(events: TempoEvent[]): TempoEvent[] {
  return [...events].sort((a, b) => a.beat - b.beat);
}

function activeTempoIndex(events: TempoEvent[], beat: number): number {
  const index = events.findLastIndex((event) => event.beat <= beat);
  return Math.max(0, index);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
