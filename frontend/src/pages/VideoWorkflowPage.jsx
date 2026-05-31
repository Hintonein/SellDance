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

  return (
    <PageShell
      title="Video preview & generation"
      description="Generate real MP4 output, track rendering progress, then preview and download the result."
    >
      <div className="workflow-steps">
        {['素材准备', '脚本生成', '分镜生成', '智能剪辑', '生成结果'].map((step, index) => (
          <span className={index <= (latestTask ? 4 : scenes.length ? 3 : 2) ? 'step-pill active' : 'step-pill'} key={step}>
            {index + 1}. {step}
          </span>
        ))}
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
            <li key={scene.sceneOrder || index}>
              <strong>Scene {scene.sceneOrder || index + 1}</strong> · {scene.durationSeconds}s ·{' '}
              {scene.subtitleText || scene.scriptText}
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
