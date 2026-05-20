import { useMemo, useState } from 'react';
import PageShell from '../components/PageShell';

export default function VideoWorkflowPage({
  disabled,
  scenes,
  materials,
  latestTask,
  onCreateTask,
  resolveMediaUrl,
}) {
  const [backgroundMusicAssetId, setBackgroundMusicAssetId] = useState('');
  const backgroundMusicAssets = useMemo(
    () => materials.filter((asset) => (asset.mimeType || '').startsWith('audio/')),
    [materials]
  );
  const completedVideoUrl = latestTask?.status === 'completed' ? resolveMediaUrl(latestTask.videoUrl) : '';

  return (
    <PageShell
      title="Video preview & generation"
      description="Generate real MP4 output, track rendering progress, then preview and download the result."
    >
      <div className="card form">
        <label>
          Optional background music
          <select
            value={backgroundMusicAssetId}
            onChange={(event) => setBackgroundMusicAssetId(event.target.value)}
            disabled={disabled}
          >
            <option value="">None (placeholder only)</option>
            {backgroundMusicAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.originalName}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={disabled || scenes.length === 0}
          onClick={() => onCreateTask({ backgroundMusicAssetId: backgroundMusicAssetId || null })}
        >
          Start video generation
        </button>
      </div>

      <div className="card">
        <h3>Scene preview</h3>
        <ol>
          {scenes.map((scene, index) => (
            <li key={scene.sceneOrder || index}>
              <strong>Scene {scene.sceneOrder || index + 1}</strong> · {scene.durationSeconds}s ·{' '}
              {scene.subtitleText || scene.scriptText}
            </li>
          ))}
          {scenes.length === 0 ? <li>No storyboard scenes available.</li> : null}
        </ol>
      </div>

      <div className="card">
        <h3>Latest generation task</h3>
        {latestTask ? (
          <p>
            {latestTask.status} · {latestTask.progress}%
            {latestTask.errorMessage ? ` · ${latestTask.errorMessage}` : ''}
          </p>
        ) : (
          <p>No tasks submitted yet.</p>
        )}
      </div>

      <div className="card">
        <h3>Rendered video</h3>
        {completedVideoUrl ? (
          <>
            <video controls src={completedVideoUrl} style={{ width: '100%', maxWidth: 480 }} />
            <div style={{ marginTop: '0.75rem' }}>
              <a href={completedVideoUrl} download>
                Download MP4
              </a>
            </div>
          </>
        ) : (
          <p>Generate a task to preview the final MP4 here.</p>
        )}
      </div>
    </PageShell>
  );
}
