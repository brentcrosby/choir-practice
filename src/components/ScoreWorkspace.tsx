const parts = ["Soprano", "Alto", "Tenor", "Bass"];

export function ScoreWorkspace() {
  return (
    <section className="workspace">
      <div className="scorePane">
        <div className="emptyScore">
          <h1>Upload a MusicXML score</h1>
          <p>Milestone 1 will render notation here, synchronize playback, and let singers isolate parts.</p>
        </div>
      </div>

      <aside className="practicePanel">
        <h2>Parts</h2>
        {parts.map((part) => (
          <div className="partRow" key={part}>
            <span>{part}</span>
            <button type="button" disabled>Solo</button>
            <button type="button" disabled>Mute</button>
          </div>
        ))}

        <h2>Practice</h2>
        <label>
          Speed
          <input type="range" min="50" max="120" defaultValue="100" disabled />
        </label>
        <label>
          Loop
          <input type="text" value="Off" readOnly />
        </label>
      </aside>
    </section>
  );
}
