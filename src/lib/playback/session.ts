import { NormalizedScore } from "@/lib/music/model";
import {
  createPlaybackState,
  currentMeasureNumber,
  getLoopWindow,
  LoopRange,
  PlaybackState,
  resolvePartGain,
  seekBeatForMeasure,
} from "./state";

export type PracticeSession = {
  score: NormalizedScore;
  playback: PlaybackState;
};

export function createPracticeSession(score: NormalizedScore): PracticeSession {
  return {
    score,
    playback: createPlaybackState(score),
  };
}

export function startSession(session: PracticeSession): PracticeSession {
  return {
    ...session,
    playback: { ...session.playback, status: "playing" },
  };
}

export function soloPart(session: PracticeSession, partId: string): PracticeSession {
  return {
    ...session,
    playback: {
      ...session.playback,
      parts: {
        ...session.playback.parts,
        [partId]: {
          ...session.playback.parts[partId],
          solo: !session.playback.parts[partId]?.solo,
        },
      },
    },
  };
}

export function setLoop(session: PracticeSession, loop: LoopRange | null): PracticeSession {
  return {
    ...session,
    playback: {
      ...session.playback,
      loop,
    },
  };
}

export function seekSessionToMeasure(session: PracticeSession, measureNumber: number): PracticeSession {
  return {
    ...session,
    playback: {
      ...session.playback,
      currentBeat: seekBeatForMeasure(session.score, measureNumber),
    },
  };
}

export function getSessionSnapshot(session: PracticeSession) {
  return {
    status: session.playback.status,
    measureNumber: currentMeasureNumber(session.score, session.playback.currentBeat),
    loopWindow: getLoopWindow(session.score, session.playback.loop),
    gains: Object.fromEntries(session.score.parts.map((part) => [part.id, resolvePartGain(part.id, session.playback.parts)])),
  };
}
