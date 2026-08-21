import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMusicXml } from "@/lib/music/musicXml";
import {
  beatAtElapsedSeconds,
  createPlaybackState,
  effectiveBpm,
  getLoopWindow,
  resolvePartGain,
  secondsBetweenBeats,
  seekBeatForMeasure,
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
