import { useMemo, useState } from 'react';
import PageShell from '../components/PageShell';
import MediaVideo from '../components/MediaVideo';
import EditingPlanPreview from '../components/creation/EditingPlanPreview';

const tabs = [
  { key: 'smart', label: 'Smart Editing' },
  { key: 'oneClick', label: 'One-click Video' },
  { key: 'export', label: 'Preview & Export' },
];

function assetId(asset) {
  return asset?.id || asset?.assetId || asset?.materialId;
}

function statusText(value) {
  return value ? String(value).replace(/_/g, ' ') : '-';
}

function audioAssetMixMode(asset) {
  return asset?.metadata?.audio?.mixMode === 'replace_source' ? 'replace_source' : 'mix_under_source';
}

function audioAssetVolume(asset, mixMode) {
  const parsed = Number(asset?.metadata?.audio?.recommendedVolume);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return mixMode === 'replace_source' ? 1 : 0.16;
}

function PlanMetrics({ scriptRecord, storyboardRecord, materials, editingPlan }) {
  const videoCount = materials.filter((asset) => asset.mediaType === 'video' || asset.type === 'video').length;
  const imageCount = materials.filter((asset) => asset.mediaType === 'image' || asset.type === 'image').length;
  const sliceCount = materials.reduce((sum, asset) => sum + Number(asset.slices?.length || 0), 0);
  return (
    <div className="metric-grid">
      <div className="metric-tile"><strong>{scriptRecord?.scenes?.length || 0}</strong><span>Script scenes</span></div>
      <div className="metric-tile"><strong>{storyboardRecord?.scenes?.length || 0}</strong><span>Storyboard scenes</span></div>
      <div className="metric-tile"><strong>{videoCount}</strong><span>Video assets</span></div>
      <div className="metric-tile"><strong>{imageCount}</strong><span>Image assets</span></div>
      <div className="metric-tile"><strong>{sliceCount}</strong><span>Local slice refs</span></div>
      <div className="metric-tile"><strong>{editingPlan?.clips?.length || 0}</strong><span>Plan clips</span></div>
    </div>
  );
}

function WorkflowProgress({ task, resolveMediaUrl }) {
  if (!task) return <p>No workflow task yet.</p>;
  const resultVideoUrl = task.result?.videoUrl ? resolveMediaUrl(task.result.videoUrl) : '';
  return (
    <div className="task-summary">
      <strong>{task.label || task.type}</strong>
      <span>{statusText(task.stage || task.status)}</span>
      <span>{task.progress || 0}%</span>
      <div className="inline-progress"><span style={{ width: `${task.progress || 0}%` }} /></div>
      {task.error ? <small className="error-text">{task.error.message}</small> : null}
      {task.logs?.length ? <small>{task.logs.at(-1).message}</small> : null}
      {resultVideoUrl ? <a href={resultVideoUrl} target="_blank" rel="noreferrer">Open output</a> : null}
    </div>
  );
}

function CaptionDrafts({ plan }) {
  const rows = plan?.captionDrafts || plan?.subtitles || [];
  if (!rows.length) return <p>No caption drafts. Render output remains clean unless sidecar export is selected.</p>;
  return (
    <ol className="flow-list">
      {rows.map((row, index) => (
        <li key={row.clipId || index}>
          <strong>Caption draft {row.clipIndex || index + 1}</strong> · {row.text}
        </li>
      ))}
    </ol>
  );
}

export default function VideoWorkflowPage({
  disabled,
  scenes,
  materials,
  scriptRecord,
  storyboardRecord,
  latestTask,
  workflowTask,
  editingPlan,
  onSmartEdit,
  onOneClick,
  onRenderPlan,
  onRetryTask,
  onCancelTask,
  resolveMediaUrl,
}) {
  const [activeTab, setActiveTab] = useState('smart');
  const [backgroundMusicAssetId, setBackgroundMusicAssetId] = useState('');
  const [audioHandling, setAudioHandling] = useState('asset_default');
  const [subtitleMode, setSubtitleMode] = useState('off');
  const [isBusy, setIsBusy] = useState(false);
  const backgroundMusicAssets = useMemo(
    () => materials.filter((asset) => (asset.mimeType || '').startsWith('audio/')),
    [materials]
  );
  const completedVideoUrl = latestTask?.status === 'completed' ? resolveMediaUrl(latestTask.videoUrl) : '';
  const selectedBackgroundMusic = backgroundMusicAssets.find((asset) => assetId(asset) === backgroundMusicAssetId) || null;
  const effectiveBgmMixMode = backgroundMusicAssetId
    ? (audioHandling === 'asset_default' ? audioAssetMixMode(selectedBackgroundMusic) : audioHandling)
    : null;
  const effectiveBgmVolume = backgroundMusicAssetId ? audioAssetVolume(selectedBackgroundMusic, effectiveBgmMixMode) : null;
  const effectiveAudioMode = !backgroundMusicAssetId
    ? 'preserve_source'
    : effectiveBgmMixMode === 'replace_source'
      ? 'uploaded_bgm'
      : 'preserve_source';
  const audioPayload = () => ({
    audioMode: effectiveAudioMode,
    backgroundMusicAssetId: backgroundMusicAssetId || null,
    backgroundMusicMixMode: effectiveBgmMixMode,
    backgroundMusicVolume: effectiveBgmVolume,
  });

  const runSmartEdit = async () => {
    setIsBusy(true);
    try {
      await onSmartEdit({
        mode: 'smart_editing',
        scenes,
        targetDuration: 15,
        aspectRatio: '9:16',
        style: 'smart_ecommerce',
        language: 'auto',
        subtitleMode,
        ...audioPayload(),
      });
    } finally {
      setIsBusy(false);
    }
  };

  const runOneClick = async () => {
    setIsBusy(true);
    try {
      await onOneClick({
        targetDuration: 15,
        aspectRatio: '9:16',
        language: 'auto',
        subtitleMode,
        ...audioPayload(),
      });
      setActiveTab('oneClick');
    } finally {
      setIsBusy(false);
    }
  };

  const renderPlan = async () => {
    await onRenderPlan({
      editingPlan,
      subtitleMode: editingPlan?.renderSettings?.subtitleMode || subtitleMode,
      ...audioPayload(),
    });
    setActiveTab('export');
  };

  return (
    <PageShell
      title="Creation"
      description="Plan clean video edits, run one-click automation, and export final MP4 without forced burned-in captions."
    >
      <div className="section-tabs">
        {tabs.map((tab) => (
          <button key={tab.key} type="button" className={activeTab === tab.key ? 'active' : ''} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'smart' ? (
        <div className="creation-workspace">
          <section className="card section-card">
            <div className="section-heading">
              <div>
                <h3>Smart editing agent</h3>
                <p>Seed2 plans asset/slice matching, transitions, caption drafts, and BGM guidance. TTS and dubbing audio are not generated.</p>
              </div>
              <button type="button" onClick={runSmartEdit} disabled={disabled || isBusy || (!materials.length && !scenes.length)}>
                Generate smart editing plan
              </button>
            </div>
            <PlanMetrics scriptRecord={scriptRecord} storyboardRecord={storyboardRecord} materials={materials} editingPlan={editingPlan} />
            <div className="form-grid">
              <label>
                Subtitle export
                <select value={subtitleMode} onChange={(event) => setSubtitleMode(event.target.value)} disabled={disabled || isBusy}>
                  <option value="off">Off - clean video</option>
                  <option value="sidecar">Sidecar subtitle file</option>
                  <option value="burned_in_experimental">Burned-in experimental</option>
                </select>
              </label>
              <label>
                Optional BGM asset
                <select value={backgroundMusicAssetId} onChange={(event) => setBackgroundMusicAssetId(event.target.value)} disabled={disabled || isBusy}>
                  <option value="">No uploaded BGM</option>
                  {backgroundMusicAssets.map((asset) => (
                    <option key={assetId(asset)} value={assetId(asset)}>{asset.originalName || asset.title || assetId(asset)}</option>
                  ))}
                </select>
              </label>
              {backgroundMusicAssetId ? (
                <label>
                  Audio handling
                  <select value={audioHandling} onChange={(event) => setAudioHandling(event.target.value)} disabled={disabled || isBusy}>
                    <option value="asset_default">Use asset default - {statusText(audioAssetMixMode(selectedBackgroundMusic))}</option>
                    <option value="mix_under_source">Mix under generated scene dialogue</option>
                    <option value="replace_source">Replace generated scene dialogue</option>
                  </select>
                </label>
              ) : null}
            </div>
            {backgroundMusicAssetId ? (
              <p className="muted-line">
                {effectiveBgmMixMode === 'replace_source'
                  ? 'This audio track will replace generated scene dialogue audio.'
                  : `This BGM will be mixed quietly under generated scene dialogue at volume ${effectiveBgmVolume}.`}
              </p>
            ) : null}
          </section>

          <section className="card section-card">
            <div className="section-heading">
              <div>
                <h3>Agent progress</h3>
                <p>Smart editing runs as a background workflow and is also shown in the floating Status panel.</p>
              </div>
            </div>
            <WorkflowProgress task={workflowTask?.type === 'smart_editing' ? workflowTask : null} resolveMediaUrl={resolveMediaUrl} />
          </section>

          <section className="card section-card">
            <div className="section-heading">
              <div>
                <h3>Current editing plan</h3>
                <p>Caption drafts are stored separately and are not burned into the video by default.</p>
              </div>
            </div>
            {editingPlan ? (
              <>
                <div className="task-summary">
                  <strong>{statusText(editingPlan.mode)}</strong>
                  <span>{editingPlan.metadata?.duration || editingPlan.targetDuration}s</span>
                  <span>{editingPlan.renderSettings?.subtitleMode || 'off'} subtitles</span>
                </div>
                <EditingPlanPreview plan={editingPlan} />
                <CaptionDrafts plan={editingPlan} />
              </>
            ) : <p>No editing plan generated yet.</p>}
          </section>
        </div>
      ) : null}

      {activeTab === 'oneClick' ? (
        <div className="creation-workspace">
          <section className="card section-card">
            <div className="section-heading">
              <div>
                <h3>One-click video</h3>
                <p>Automatically reuses existing script/storyboard when available, otherwise fills missing steps and renders a clean MP4.</p>
              </div>
              <button type="button" onClick={runOneClick} disabled={disabled || isBusy || !materials.length}>
                Start one-click video
              </button>
            </div>
            <div className="flow-list">
              <li>Use current script if available; otherwise generate with Seed2.</li>
              <li>Use current storyboard if available; otherwise generate storyboard videos with SeedDance 1.5 Pro.</li>
              <li>Run Seed2 smart editing plan, then render without hard subtitles.</li>
              <li>Public video methodology is attempted only when needed; failure falls back to project info.</li>
            </div>
          </section>
          <section className="card section-card">
            <div className="section-heading">
              <div>
                <h3>Workflow status</h3>
                <p>Detailed progress also appears in the floating Status panel.</p>
              </div>
            </div>
            <WorkflowProgress task={workflowTask} resolveMediaUrl={resolveMediaUrl} />
          </section>
        </div>
      ) : null}

      {activeTab === 'export' ? (
        <div className="creation-workspace">
          <section className="card section-card">
            <div className="section-heading">
              <div>
                <h3>Render</h3>
                <p>Render from the current editing plan. Captions remain off unless sidecar or experimental burned-in mode is selected.</p>
              </div>
              <button type="button" disabled={disabled || !editingPlan} onClick={renderPlan}>
                Render from editing plan
              </button>
            </div>
            {editingPlan ? <EditingPlanPreview plan={editingPlan} /> : <p>No editing plan available.</p>}
          </section>

          <section className="card section-card">
            <div className="section-heading">
              <div>
                <h3>Latest render task</h3>
                <p>Queued/running/completed/failed states are tracked here and in Status.</p>
              </div>
            </div>
            {latestTask ? (
              <div className="task-summary">
                <strong>{latestTask.status}</strong><span>{latestTask.progress}%</span><span>{latestTask.currentStep || 'queued'}</span>
                {latestTask.audioMode ? <span>{statusText(latestTask.audioMode)} audio</span> : null}
                {latestTask.backgroundMusicMixMode ? <span>{statusText(latestTask.backgroundMusicMixMode)}</span> : null}
                {latestTask.hasAudioTrack === false ? <span>No audio track</span> : null}
                <div className="inline-progress"><span style={{ width: `${latestTask.progress || 0}%` }} /></div>
                {latestTask.errorMessage ? <small className="error-text">{latestTask.errorMessage}</small> : null}
                {latestTask.captionUrl ? <a href={resolveMediaUrl(latestTask.captionUrl)} target="_blank" rel="noreferrer">Open sidecar subtitles</a> : null}
                {latestTask.audioMixSummary ? <small>{latestTask.audioMixSummary}</small> : null}
                <div className="button-row">
                  <button type="button" disabled={latestTask.status !== 'failed'} onClick={() => onRetryTask(latestTask.id || latestTask.taskId)}>
                    Retry
                  </button>
                  <button type="button" disabled={!['queued', 'running'].includes(latestTask.status)} onClick={() => onCancelTask(latestTask.id || latestTask.taskId)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : <p>No render task submitted yet.</p>}
          </section>

          <section className="card section-card">
            <div className="section-heading">
              <div>
                <h3>Rendered video</h3>
                <p>Preview the final MP4 and export available aspect ratios.</p>
              </div>
            </div>
            {completedVideoUrl ? (
              <>
                <MediaVideo className="rendered-video" src={completedVideoUrl} label="Rendered video" />
                <div className="download-row">
                  <a href={completedVideoUrl} download>Download MP4</a>
                </div>
                <div className="button-row" style={{ marginTop: '0.75rem' }}>
                  {(latestTask.exportPresets || []).map((preset) => (
                    <a key={preset.presetId} href={resolveMediaUrl(preset.url)} target="_blank" rel="noreferrer">
                      Export {preset.aspectRatio}
                    </a>
                  ))}
                </div>
              </>
            ) : <p>Render a task to preview the final MP4 here.</p>}
          </section>
        </div>
      ) : null}
    </PageShell>
  );
}
