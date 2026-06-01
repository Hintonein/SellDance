import { useMemo, useState } from 'react';
import PageShell from '../components/PageShell';
import EditingPlanPreview from '../components/creation/EditingPlanPreview';

export default function VideoWorkflowPage({
  disabled,
  scenes,
  materials,
  latestTask,
  editingPlan,
  onCreatePlan,
  onRenderPlan,
  onRetryTask,
  onCancelTask,
  resolveMediaUrl,
}) {
  const [backgroundMusicAssetId, setBackgroundMusicAssetId] = useState('');
  const [selectedAssetIds, setSelectedAssetIds] = useState([]);
  const [mode, setMode] = useState('asset_first');
  const backgroundMusicAssets = useMemo(
    () => materials.filter((asset) => (asset.mimeType || '').startsWith('audio/')),
    [materials]
  );
  const completedVideoUrl = latestTask?.status === 'completed' ? resolveMediaUrl(latestTask.videoUrl) : '';
  const toggleAsset = (assetId) => {
    setSelectedAssetIds((prev) => prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]);
  };
  const sceneDuration = (scene) => scene.duration || scene.durationSeconds || 3;
  const sceneText = (scene) => scene.subtitle || scene.subtitleText || scene.voiceover || scene.scriptText || scene.visualDescription || 'Storyboard scene';

  return (
    <PageShell
      title="Creation"
      description="Create an editing plan, render a preview, and export platform-ready selling videos."
    >
      <div className="strategy-grid">
        <section className="card section-card"><h3>一键成片</h3><p>Use product link, main image, or selected assets to produce a short commerce video.</p></section>
        <section className="card section-card"><h3>智能剪辑</h3><p>Assemble clips, transitions, subtitles, voiceover, and BGM from asset/slice tags and storyboard scenes.</p></section>
        <section className="card section-card"><h3>分镜级干预</h3><p>Replace slices, adjust duration, regenerate a single scene, then render quickly.</p></section>
        <section className="card section-card"><h3>预览与导出</h3><p>Preview online and export vertical or horizontal variants for distribution.</p></section>
      </div>

      <div className="card form section-card">
        <label>
          Creation mode
          <select value={mode} onChange={(event) => setMode(event.target.value)} disabled={disabled}>
            <option value="asset_first">asset_first</option>
            <option value="storyboard_driven">storyboard_driven</option>
          </select>
        </label>
        {mode === 'asset_first' ? (
          <div className="asset-checkbox-grid">
            {materials.map((asset) => (
              <label key={asset.id} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={selectedAssetIds.includes(asset.id)}
                  onChange={() => toggleAsset(asset.id)}
                  disabled={disabled}
                />
                <span>{asset.title || asset.originalName || asset.id} · {asset.mediaType || asset.type}</span>
              </label>
            ))}
            {!materials.length ? <p>No assets available.</p> : null}
          </div>
        ) : null}
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
          disabled={disabled || (mode === 'storyboard_driven' && scenes.length === 0)}
          onClick={() => onCreatePlan({
            mode,
            selectedAssetIds,
            scenes,
            targetDuration: 15,
            aspectRatio: '9:16',
            style: 'clean_ecommerce',
            language: 'zh-CN',
          })}
        >
          Generate editing plan
        </button>
        <button
          type="button"
          disabled={disabled || !editingPlan}
          onClick={() => onRenderPlan({ editingPlan, backgroundMusicAssetId: backgroundMusicAssetId || null })}
        >
          Render from editing plan
        </button>
      </div>

      <div className="card section-card">
        <div className="section-heading">
          <div>
            <h3>Editing plan</h3>
            <p>Timeline clips, duration, aspect ratio, and selected assets are generated before rendering.</p>
          </div>
        </div>
        {editingPlan ? (
          <>
            <div className="task-summary">
              <strong>{editingPlan.mode}</strong>
              <span>{editingPlan.metadata?.duration || editingPlan.targetDuration}s</span>
              <span>{editingPlan.aspectRatio}</span>
            </div>
            <EditingPlanPreview plan={editingPlan} />
          </>
        ) : (
          <p>No editing plan generated yet.</p>
        )}
      </div>

      <div className="card section-card">
        <div className="section-heading">
          <div>
            <h3>Scene preview</h3>
            <p>Review storyboard timing before starting intelligent editing.</p>
          </div>
        </div>
        <ol className="flow-list">
          {scenes.map((scene, index) => (
            <li key={scene.id || scene.sceneId || scene.sceneOrder || index}>
              <strong>Scene {scene.sceneOrder || index + 1}</strong> · {sceneDuration(scene)}s ·{' '}
              {sceneText(scene)}
            </li>
          ))}
          {scenes.length === 0 ? <li>No storyboard scenes available.</li> : null}
        </ol>
      </div>

      <div className="card section-card">
        <div className="section-heading">
          <div>
            <h3>Latest generation task</h3>
            <p>Queued/running/completed/failed states are tracked here.</p>
          </div>
        </div>
        {latestTask ? (
          <div className="task-summary">
            <strong>{latestTask.status}</strong><span>{latestTask.progress}%</span><span>{latestTask.currentStep || 'queued'}</span>
            <div className="inline-progress"><span style={{ width: `${latestTask.progress || 0}%` }} /></div>
            {latestTask.errorMessage ? <small className="error-text">{latestTask.errorMessage}</small> : null}
            <div className="button-row">
              <button type="button" disabled={latestTask.status !== 'failed'} onClick={() => onRetryTask(latestTask.id || latestTask.taskId)}>
                Retry
              </button>
              <button type="button" disabled={!['queued', 'running'].includes(latestTask.status)} onClick={() => onCancelTask(latestTask.id || latestTask.taskId)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p>No tasks submitted yet.</p>
        )}
      </div>

      <div className="card section-card">
        <div className="section-heading">
          <div>
            <h3>Rendered video</h3>
            <p>Preview the final MP4 and export available aspect ratios.</p>
          </div>
        </div>
        {completedVideoUrl ? (
          <>
            <video className="rendered-video" controls src={completedVideoUrl} />
            <div className="download-row">
              <a href={completedVideoUrl} download>
                Download MP4
              </a>
            </div>
            <div className="button-row" style={{ marginTop: '0.75rem' }}>
              {(latestTask.exportPresets || []).map((preset) => (
                <a key={preset.presetId} href={resolveMediaUrl(preset.url)} target="_blank" rel="noreferrer">
                  Export {preset.aspectRatio}
                </a>
              ))}
            </div>
          </>
        ) : (
          <p>Generate a task to preview the final MP4 here.</p>
        )}
      </div>
    </PageShell>
  );
}
