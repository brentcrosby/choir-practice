import { ScoreWorkspace } from "@/components/ScoreWorkspace";

export default function Home() {
  return (
    <main>
      <header className="topbar">
        <div>
          <strong>Choir Practice</strong>
          <span className="subtitle">MusicXML-first rehearsal player</span>
        </div>
      </header>
      <ScoreWorkspace />
    </main>
  );
}
