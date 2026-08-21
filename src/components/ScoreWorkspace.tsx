"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { MusicXmlParseError, NormalizedScore } from "@/lib/music/model";
import { parseMusicXml } from "@/lib/music/musicXml";
import { WebAudioEngineOptions, WebAudioPlaybackEngine } from "@/lib/playback/webAudioEngine";
import {
  clampTempoMultiplier,
  createPlaybackState,
  currentMeasureNumber,
  LoopRange,
  PartMix,
  resolvePartGain,
  seekBeatForMeasure,
  TransportStatus,
} from "@/lib/playback/state";

type RenderState = {
  status: "idle" | "rendering" | "ready" | "error";
  pages: string[];
  error?: string;
};

export function ScoreWorkspace() {
  const [score, setScore] = useState<NormalizedScore | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [renderState, setRenderState] = useState<RenderState>({ status: "idle", pages: [] });
  const [status, setStatus] = useState<TransportStatus>("stopped");
  const [currentBeat, setCurrentBeat] = useState(0);
  const [currentMeasure, setCurrentMeasure] = useState(1);
  const [tempoMultiplier, setTempoMultiplier] = useState(1);
  const [parts, setParts] = useState<Record<string, PartMix>>({});
  const [loop, setLoop] = useState<LoopRange | null>(null);
  const engineRef = useRef<WebAudioPlaybackEngine | null>(null);
  const latestEngineOptionsRef = useRef<WebAudioEngineOptions | null>(null);
  const svgHostRef = useRef<HTMLDivElement | null>(null);

  const measureNumbers = useMemo(() => score?.measures.map((measure) => measure.number) ?? [], [score]);
  const lastMeasure = measureNumbers.at(-1) ?? 1;

  useEffect(() => {
    engineRef.current = new WebAudioPlaybackEngine();
    return () => engineRef.current?.dispose();
  }, []);

  useEffect(() => {
    if (!score || !engineRef.current) {
      return;
    }

    engineRef.current.load(score, latestEngineOptionsRef.current ?? {
      tempoMultiplier: 1,
      parts: createPlaybackState(score).parts,
      loop: null,
      onBeat: (beat, measureNumber) => {
        setCurrentBeat(beat);
        setCurrentMeasure(measureNumber);
      },
      onEnded: () => {
        setStatus("stopped");
        setCurrentBeat(0);
        setCurrentMeasure(score.measures[0]?.number ?? 1);
      },
    });
  }, [score]);

  useEffect(() => {
    const nextOptions: WebAudioEngineOptions = {
      tempoMultiplier,
      parts,
      loop,
      onBeat: (beat, measureNumber) => {
        setCurrentBeat(beat);
        setCurrentMeasure(measureNumber);
      },
      onEnded: () => {
        setStatus("stopped");
        setCurrentBeat(0);
        setCurrentMeasure(score?.measures[0]?.number ?? 1);
      },
    };
    latestEngineOptionsRef.current = nextOptions;
    engineRef.current?.updateOptions(nextOptions);
  }, [tempoMultiplier, parts, loop, score]);

  useEffect(() => {
    if (!score) {
      return;
    }

    let cancelled = false;

    async function renderScore(scoreToRender: NormalizedScore) {
      try {
        const [{ default: createVerovioModule }, { VerovioToolkit }] = await Promise.all([
          import("verovio/wasm"),
          import("verovio/esm"),
        ]);
        const verovioModule = await createVerovioModule();
        const toolkit = new VerovioToolkit(verovioModule);
        toolkit.setOptions({
          pageWidth: 1800,
          pageHeight: 2600,
          scale: 42,
          adjustPageHeight: true,
          breaks: "auto",
        });
        const loaded = toolkit.loadData(scoreToRender.sourceXml);
        const pageCount = Math.max(1, toolkit.getPageCount());
        const pages = Array.from({ length: pageCount }, (_, pageIndex) => toolkit.renderToSVG(pageIndex + 1, {}))
          .filter((svg) => svg.trim().length > 0);

        if (!cancelled) {
          if (!loaded || pages.length === 0) {
            setRenderState({
              status: "error",
              pages: [],
              error: "Verovio could not render this MusicXML score.",
            });
          } else {
            setRenderState({ status: "ready", pages });
          }
        }
      } catch (renderError) {
        if (!cancelled) {
          setRenderState({
            status: "error",
            pages: [],
            error: renderError instanceof Error ? renderError.message : "Notation rendering failed.",
          });
        }
      }
    }

    void renderScore(score);
    return () => {
      cancelled = true;
    };
  }, [score]);

  useEffect(() => {
    const host = svgHostRef.current;
    if (!host) {
      return;
    }

    const measureElements = Array.from(host.querySelectorAll<SVGGElement>("g.measure"));
    measureElements.forEach((element) => element.classList.remove("currentMeasure"));
    const measureIndex = measureNumbers.findIndex((measureNumber) => measureNumber === currentMeasure);
    measureElements[measureIndex]?.classList.add("currentMeasure");
    measureElements[measureIndex]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [currentMeasure, renderState.pages, measureNumbers]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    resetPlayback();
    setFileName(file.name);
    setError("");
    setRenderState({ status: "idle", pages: [] });

    if (file.name.toLowerCase().endsWith(".mxl")) {
      setScore(null);
      setError("Compressed .mxl files are not decompressed yet. TODO: add a zip/MXL reader; use .musicxml or .xml for Milestone 1.");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".musicxml") && !file.name.toLowerCase().endsWith(".xml")) {
      setScore(null);
      setError("Upload a MusicXML file with a .musicxml or .xml extension.");
      return;
    }

    try {
      const xml = await file.text();
      const parsedScore = parseMusicXml(xml);
      const initialPlayback = createPlaybackState(parsedScore);
      setRenderState({ status: "rendering", pages: [] });
      setScore(parsedScore);
      setParts(initialPlayback.parts);
      setTempoMultiplier(initialPlayback.tempoMultiplier);
      setLoop(null);
      setCurrentBeat(0);
      setCurrentMeasure(parsedScore.measures[0]?.number ?? 1);
    } catch (parseError) {
      setScore(null);
      setRenderState({ status: "idle", pages: [] });
      setError(parseError instanceof MusicXmlParseError || parseError instanceof Error ? parseError.message : "MusicXML parsing failed.");
    }
  }

  async function handlePlayPause() {
    if (!score || !engineRef.current) {
      return;
    }

    if (status === "playing") {
      const beat = engineRef.current.pause();
      setCurrentBeat(beat);
      setCurrentMeasure(currentMeasureNumber(score, beat));
      setStatus("paused");
      return;
    }

    await engineRef.current.play();
    setStatus("playing");
  }

  function handleStop() {
    resetPlayback();
  }

  function resetPlayback() {
    engineRef.current?.stop();
    setStatus("stopped");
    setCurrentBeat(0);
    setCurrentMeasure(score?.measures[0]?.number ?? 1);
  }

  function seekToMeasure(measureNumber: number) {
    if (!score) {
      return;
    }

    const beat = seekBeatForMeasure(score, measureNumber);
    engineRef.current?.seek(beat);
    setCurrentBeat(beat);
    setCurrentMeasure(measureNumber);
  }

  function patchPart(partId: string, patch: Partial<PartMix>) {
    setParts((current) => ({
      ...current,
      [partId]: {
        ...current[partId],
        ...patch,
      },
    }));
  }

  function updateLoop(patch: Partial<LoopRange>) {
    if (!score) {
      return;
    }

    const next = {
      startMeasure: loop?.startMeasure ?? score.measures[0]?.number ?? 1,
      endMeasure: loop?.endMeasure ?? lastMeasure,
      ...patch,
    };
    if (next.startMeasure > next.endMeasure) {
      next.endMeasure = next.startMeasure;
    }
    setLoop(next);
  }

  return (
    <section className="workspace">
      <div className="scorePane">
        <div className="scoreToolbar">
          <label className="fileButton">
            Upload score
            <input accept=".musicxml,.xml,.mxl" type="file" onChange={handleFileChange} />
          </label>
          <div className="scoreMeta">
            <strong>{score?.metadata.title ?? "No score loaded"}</strong>
            <span>{fileName || "MusicXML .musicxml/.xml supported"}</span>
          </div>
        </div>

        {error ? <div className="errorBanner" role="alert">{error}</div> : null}

        <div className="scoreSurface">
          {!score ? (
            <div className="emptyScore">
              <h1>Upload a MusicXML score</h1>
              <p>Render notation, follow the current measure, and rehearse with part isolation, tempo, seeking, and loops.</p>
            </div>
          ) : null}

          {score && renderState.status === "rendering" ? <div className="emptyScore">Rendering notation...</div> : null}
          {score && renderState.status === "error" ? (
            <div className="emptyScore errorText" role="alert">{renderState.error}</div>
          ) : null}
          {score && renderState.status === "ready" ? (
            <div ref={svgHostRef} className="scoreSvg">
              {renderState.pages.map((pageSvg, pageIndex) => (
                <div
                  className="scorePage"
                  key={pageIndex}
                  dangerouslySetInnerHTML={{ __html: pageSvg }}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <aside className="practicePanel">
        <section className="panelSection">
          <h2>Transport</h2>
          <div className="transportControls">
            <button type="button" onClick={handlePlayPause} disabled={!score}>
              {status === "playing" ? "Pause" : "Play"}
            </button>
            <button type="button" onClick={handleStop} disabled={!score}>
              Stop
            </button>
          </div>
          <label>
            Measure
            <select
              value={currentMeasure}
              onChange={(event) => seekToMeasure(Number(event.target.value))}
              disabled={!score}
            >
              {measureNumbers.map((measureNumber) => (
                <option key={measureNumber} value={measureNumber}>{measureNumber}</option>
              ))}
            </select>
          </label>
          <div className="readout">Beat {currentBeat.toFixed(2)}</div>
        </section>

        <section className="panelSection">
          <h2>Parts</h2>
          {score ? score.parts.map((part) => (
            <div className="partRow" key={part.id}>
              <div>
                <strong>{part.name}</strong>
                <span>{part.staves.map((staff) => `${staff.name}: ${staff.voices.map((voice) => voice.name).join(", ")}`).join(" | ")}</span>
              </div>
              <button
                className={parts[part.id]?.solo ? "activeToggle" : ""}
                type="button"
                onClick={() => patchPart(part.id, { solo: !parts[part.id]?.solo })}
              >
                Solo
              </button>
              <button
                className={parts[part.id]?.muted ? "activeToggle" : ""}
                type="button"
                onClick={() => patchPart(part.id, { muted: !parts[part.id]?.muted })}
              >
                Mute
              </button>
              <label className="volumeControl">
                Volume
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round((parts[part.id]?.volume ?? 1) * 100)}
                  onChange={(event) => patchPart(part.id, { volume: Number(event.target.value) / 100 })}
                />
              </label>
              <span className="gainReadout">{Math.round(resolvePartGain(part.id, parts) * 100)}%</span>
            </div>
          )) : <p className="mutedText">Load a score to see parsed parts.</p>}
        </section>

        <section className="panelSection">
          <h2>Practice</h2>
          <label>
            Speed {Math.round(tempoMultiplier * 100)}%
            <input
              type="range"
              min="50"
              max="120"
              value={Math.round(tempoMultiplier * 100)}
              onChange={(event) => setTempoMultiplier(clampTempoMultiplier(Number(event.target.value) / 100))}
              disabled={!score}
            />
          </label>

          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={loop !== null}
              disabled={!score}
              onChange={(event) => setLoop(event.target.checked ? {
                startMeasure: currentMeasure,
                endMeasure: currentMeasure,
              } : null)}
            />
            Loop measures
          </label>

          <div className="loopGrid">
            <label>
              Start
              <select
                value={loop?.startMeasure ?? currentMeasure}
                disabled={!score || !loop}
                onChange={(event) => updateLoop({ startMeasure: Number(event.target.value) })}
              >
                {measureNumbers.map((measureNumber) => (
                  <option key={measureNumber} value={measureNumber}>{measureNumber}</option>
                ))}
              </select>
            </label>
            <label>
              End
              <select
                value={loop?.endMeasure ?? currentMeasure}
                disabled={!score || !loop}
                onChange={(event) => updateLoop({ endMeasure: Number(event.target.value) })}
              >
                {measureNumbers.map((measureNumber) => (
                  <option key={measureNumber} value={measureNumber}>{measureNumber}</option>
                ))}
              </select>
            </label>
          </div>
        </section>
      </aside>
    </section>
  );
}
