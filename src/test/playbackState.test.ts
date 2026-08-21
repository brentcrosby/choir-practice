import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMusicXml } from "@/lib/music/musicXml";
import {
  beatAtElapsedSeconds,
  createPlaybackState,
  effectiveBpm,
  getScoreEndBeat,
  getLoopWindow,
  readTransportBeat,
  rebaseTransportClock,
  resolvePartGain,
  schedulerBeatWindow,
  secondsBetweenBeats,
  seekBeatForMeasure,
  shouldStopAtScoreEnd,
  shouldWrapLoop,
} from "@/lib/playback/state";
import {
  createPracticeSession,
  getSessionSnapshot,
  seekSessionToMeasure,
  setLoop,
  soloPart,
  startSession,
} from "@/lib/playback/session";

const fixture = readFileSync(join(process.cwd(), "test-data/satb-demo.musicxml"), "utf8");

describe("playback state", () => {
  it("calculates tempo multiplier without changing pitch data", () => {
    const score = parseMusicXml(fixture);
    const beforePitch = score.noteEvents[0].midiNote;

    expect(effectiveBpm(96, 0.75)).toBe(72);
    expect(secondsBetweenBeats(score.tempoEvents, 0, 4, 1)).toBeCloseTo(2.5);
    expect(secondsBetweenBeats(score.tempoEvents, 0, 4, 0.5)).toBeCloseTo(5);
    expect(beatAtElapsedSeconds(score.tempoEvents, 0, 2.5, 1)).toBeCloseTo(4);
    expect(score.noteEvents[0].midiNote).toBe(beforePitch);
  });

  it("resolves loop boundaries by measure", () => {
    const score = parseMusicXml(fixture);
    const state = createPlaybackState(score);

    expect(seekBeatForMeasure(score, 3)).toBe(8);
    expect(getLoopWindow(score, { startMeasure: 2, endMeasure: 3 })).toEqual({ startBeat: 4, endBeat: 12 });
    expect(getLoopWindow(score, state.loop)).toBeNull();
  });

  it("clamps scheduler windows to active loop boundaries", () => {
    const score = parseMusicXml(fixture);
    const loop = { startMeasure: 2, endMeasure: 2 };

    expect(schedulerBeatWindow(score, 6, 5, 1, loop)).toEqual({ startBeat: 6, endBeat: 8 });
    expect(shouldWrapLoop(score, 7.99, loop)).toBe(false);
    expect(shouldWrapLoop(score, 8, loop)).toBe(true);
    expect(shouldStopAtScoreEnd(score, 16, loop)).toBe(false);
  });

  it("rebases the transport clock when tempo changes while keeping the current beat stable", () => {
    const score = parseMusicXml(fixture);
    const pitchesBefore = score.noteEvents.map((event) => event.midiNote);
    const rebased = rebaseTransportClock(
      score.tempoEvents,
      {
        transportStartBeat: 0,
        transportStartTime: 10,
        currentBeat: 0,
        scheduledUntilBeat: 3,
      },
      11.25,
      1,
    );

    expect(rebased.currentBeat).toBeCloseTo(2);
    expect(readTransportBeat(score.tempoEvents, rebased, 11.25, 0.5)).toBeCloseTo(rebased.currentBeat);
    expect(readTransportBeat(score.tempoEvents, rebased, 12.5, 0.5)).toBeCloseTo(3);
    expect(score.noteEvents.map((event) => event.midiNote)).toEqual(pitchesBefore);
  });

  it("detects end-of-score behavior when no loop is active", () => {
    const score = parseMusicXml(fixture);

    expect(getScoreEndBeat(score)).toBe(16);
    expect(schedulerBeatWindow(score, 15.5, 5, 1, null)).toEqual({ startBeat: 15.5, endBeat: 16 });
    expect(shouldStopAtScoreEnd(score, 15.99, null)).toBe(false);
    expect(shouldStopAtScoreEnd(score, 16, null)).toBe(true);
  });

  it("applies solo, mute, and volume rules deterministically", () => {
    const score = parseMusicXml(fixture);
    const state = createPlaybackState(score);

    state.parts.S.volume = 0.4;
    expect(resolvePartGain("S", state.parts)).toBe(0.4);

    state.parts.T.solo = true;
    expect(resolvePartGain("S", state.parts)).toBe(0);
    expect(resolvePartGain("T", state.parts)).toBe(1);

    state.parts.T.muted = true;
    expect(resolvePartGain("T", state.parts)).toBe(0);
  });

  it("smoke tests upload parse -> start playback state -> solo part -> loop", () => {
    const score = parseMusicXml(fixture);
    const started = startSession(createPracticeSession(score));
    const tenorSolo = soloPart(started, "T");
    const looped = setLoop(seekSessionToMeasure(tenorSolo, 2), { startMeasure: 2, endMeasure: 2 });
    const snapshot = getSessionSnapshot(looped);

    expect(snapshot.status).toBe("playing");
    expect(snapshot.measureNumber).toBe(2);
    expect(snapshot.loopWindow).toEqual({ startBeat: 4, endBeat: 8 });
    expect(snapshot.gains).toMatchObject({ S: 0, A: 0, T: 1, B: 0 });
  });
});
