import { useState } from 'react';
import PageShell from '../components/PageShell';

export default function VideoWorkflowPage({ disabled, scenes, latestTask, onCreateTask }) {
  const [forceFail, setForceFail] = useState(false);

  return (
    <PageShell
      title="Video preview & generation"
      description="Configure subtitle/voiceover placeholders, preview scenes, and trigger export tasks."
    >
      <div className="card form">
        <p>
          Subtitle, voiceover, and background music are prefilled as placeholders in this starter.
        </p>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={forceFail}
            onChange={(event) => setForceFail(event.target.checked)}
            disabled={disabled}
          />
          Simulate a failed render (for retry demo)
        </label>
        <button type="button" disabled={disabled || scenes.length === 0} onClick={() => onCreateTask({ forceFail })}>
          Start export task
        </button>
      </div>

      <div className="card">
        <h3>Scene preview</h3>
        <ol>
          {scenes.map((scene) => (
            <li key={scene.sceneNumber}>
              <strong>Scene {scene.sceneNumber}: </strong>
              {scene.subtitle} <em>({scene.selectedAssetName})</em>
            </li>
          ))}
          {scenes.length === 0 ? <li>No storyboard scenes available.</li> : null}
        </ol>
      </div>

      <div className="card">
        <h3>Latest task status</h3>
        {latestTask ? (
          <p>
            {latestTask.status} · {latestTask.progress}%
            {latestTask.errorMessage ? ` · ${latestTask.errorMessage}` : ''}
          </p>
        ) : (
          <p>No tasks submitted yet.</p>
        )}
      </div>
    </PageShell>
  );
}
