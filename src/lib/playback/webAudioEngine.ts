import { NormalizedScore, NoteEvent } from "@/lib/music/model";
import {
  beatAtElapsedSeconds,
  currentMeasureNumber,
  eventsInBeatWindow,
  getLoopWindow,
  LoopRange,
  PartMix,
  rebaseTransportClock,
  resolvePartGain,
  schedulerBeatWindow,
  secondsBetweenBeats,
  shouldStopAtScoreEnd,
  shouldWrapLoop,
} from "./state";

export type WebAudioEngineOptions = {
  tempoMultiplier: number;
  parts: Record<string, PartMix>;
  loop: LoopRange | null;
  onBeat?: (beat: number, measureNumber: number) => void;
  onEnded?: () => void;
};

const LOOKAHEAD_SECONDS = 0.16;
const SCHEDULER_INTERVAL_MS = 25;
const WAVEFORM: OscillatorType = "triangle";

export class WebAudioPlaybackEngine {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private score: NormalizedScore | null = null;
  private options: WebAudioEngineOptions | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private transportStartTime = 0;
  private transportStartBeat = 0;
  private currentBeat = 0;
  private scheduledUntilBeat = 0;
  private activeNodes = new Set<AudioScheduledSourceNode>();

  load(score: NormalizedScore, options: WebAudioEngineOptions): void {
    this.stop();
    this.score = score;
    this.options = options;
    this.currentBeat = 0;
    this.scheduledUntilBeat = 0;
  }

  updateOptions(options: WebAudioEngineOptions): void {
    if (
      this.score &&
      this.options &&
      this.audioContext &&
      this.timer !== null &&
      this.options.tempoMultiplier !== options.tempoMultiplier
    ) {
      const rebased = rebaseTransportClock(
        this.score.tempoEvents,
        {
          transportStartBeat: this.transportStartBeat,
          transportStartTime: this.transportStartTime,
          currentBeat: this.currentBeat,
          scheduledUntilBeat: this.scheduledUntilBeat,
        },
        this.audioContext.currentTime,
        this.options.tempoMultiplier,
      );
      this.transportStartBeat = rebased.transportStartBeat;
      this.transportStartTime = rebased.transportStartTime;
      this.currentBeat = rebased.currentBeat;
      this.scheduledUntilBeat = rebased.scheduledUntilBeat;
      this.stopActiveNodes();
    }

    this.options = options;
  }

  async play(): Promise<void> {
    if (!this.score || !this.options) {
      return;
    }

    const context = this.ensureAudioContext();
    if (context.state === "suspended") {
      await context.resume();
    }

    this.transportStartBeat = this.currentBeat;
    this.transportStartTime = context.currentTime + 0.04;
    this.scheduledUntilBeat = this.currentBeat;
    this.clearTimer();
    this.timer = setInterval(() => this.schedule(), SCHEDULER_INTERVAL_MS);
    this.schedule();
  }

  pause(): number {
    this.refreshCurrentBeat();
    this.clearTimer();
    this.stopActiveNodes();
    return this.currentBeat;
  }

  stop(): void {
    this.clearTimer();
    this.stopActiveNodes();
    this.currentBeat = 0;
    this.scheduledUntilBeat = 0;
  }

  seek(beat: number): void {
    const wasPlaying = this.timer !== null;
    this.currentBeat = Math.max(0, beat);
    this.scheduledUntilBeat = this.currentBeat;
    this.stopActiveNodes();

    if (wasPlaying) {
      void this.play();
    }
  }

  dispose(): void {
    this.stop();
    void this.audioContext?.close();
    this.audioContext = null;
    this.masterGain = null;
  }

  getCurrentBeat(): number {
    this.refreshCurrentBeat();
    return this.currentBeat;
  }

  private ensureAudioContext(): AudioContext {
    if (this.audioContext) {
      return this.audioContext;
    }

    const context = new AudioContext();
    const masterGain = context.createGain();
    masterGain.gain.value = 0.15;
    masterGain.connect(context.destination);
    this.audioContext = context;
    this.masterGain = masterGain;
    return context;
  }

  private schedule(): void {
    if (!this.score || !this.options || !this.audioContext || !this.masterGain) {
      return;
    }

    this.refreshCurrentBeat();
    const loopWindow = getLoopWindow(this.score, this.options.loop);
    if (shouldWrapLoop(this.score, this.currentBeat, this.options.loop) && loopWindow) {
      this.currentBeat = loopWindow.startBeat;
      this.transportStartBeat = loopWindow.startBeat;
      this.transportStartTime = this.audioContext.currentTime;
      this.scheduledUntilBeat = loopWindow.startBeat;
      this.stopActiveNodes();
    }

    if (shouldStopAtScoreEnd(this.score, this.currentBeat, this.options.loop)) {
      this.finishAtScoreEnd();
      return;
    }

    const window = schedulerBeatWindow(
      this.score,
      this.currentBeat,
      LOOKAHEAD_SECONDS,
      this.options.tempoMultiplier,
      this.options.loop,
    );

    const events = eventsInBeatWindow(this.score.noteEvents, this.scheduledUntilBeat, window.endBeat);
    for (const event of events) {
      if (!loopWindow || (event.startBeat >= loopWindow.startBeat && event.startBeat < loopWindow.endBeat)) {
        this.scheduleNote(event);
      }
    }

    this.scheduledUntilBeat = Math.max(this.scheduledUntilBeat, window.endBeat);
    this.options.onBeat?.(this.currentBeat, currentMeasureNumber(this.score, this.currentBeat));
  }

  private scheduleNote(event: NoteEvent): void {
    if (!this.score || !this.options || !this.audioContext || !this.masterGain) {
      return;
    }

    const gainValue = resolvePartGain(event.partId, this.options.parts);
    if (gainValue <= 0) {
      return;
    }

    const startDelay = secondsBetweenBeats(
      this.score.tempoEvents,
      this.currentBeat,
      event.startBeat,
      this.options.tempoMultiplier,
    );
    const duration = secondsBetweenBeats(
      this.score.tempoEvents,
      event.startBeat,
      event.startBeat + event.durationBeats,
      this.options.tempoMultiplier,
    );
    const startTime = this.audioContext.currentTime + Math.max(0.005, startDelay);
    const stopTime = startTime + Math.max(0.05, duration * 0.92);

    const oscillator = this.audioContext.createOscillator();
    const noteGain = this.audioContext.createGain();
    oscillator.type = WAVEFORM;
    oscillator.frequency.value = midiToFrequency(event.midiNote);
    noteGain.gain.setValueAtTime(0.0001, startTime);
    noteGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainValue * event.velocity), startTime + 0.012);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);
    oscillator.connect(noteGain);
    noteGain.connect(this.masterGain);
    oscillator.start(startTime);
    oscillator.stop(stopTime + 0.02);
    oscillator.onended = () => this.activeNodes.delete(oscillator);
    this.activeNodes.add(oscillator);
  }

  private refreshCurrentBeat(): void {
    if (!this.score || !this.options || !this.audioContext || this.timer === null) {
      return;
    }

    const elapsed = Math.max(0, this.audioContext.currentTime - this.transportStartTime);
    this.currentBeat = beatAtElapsedSeconds(this.score.tempoEvents, this.transportStartBeat, elapsed, this.options.tempoMultiplier);
  }

  private finishAtScoreEnd(): void {
    if (!this.score || !this.options) {
      return;
    }

    this.clearTimer();
    this.stopActiveNodes();
    this.currentBeat = 0;
    this.transportStartBeat = 0;
    this.scheduledUntilBeat = 0;
    this.options.onBeat?.(0, currentMeasureNumber(this.score, 0));
    this.options.onEnded?.();
  }

  private stopActiveNodes(): void {
    for (const node of this.activeNodes) {
      try {
        node.stop();
      } catch {
        // Already stopped by the Web Audio clock.
      }
    }
    this.activeNodes.clear();
  }

  private clearTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

function midiToFrequency(midiNote: number): number {
  return 440 * 2 ** ((midiNote - 69) / 12);
}
