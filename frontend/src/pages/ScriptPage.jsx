import { useEffect, useMemo, useRef, useState } from 'react';
import PageShell from '../components/PageShell';
import MediaVideo from '../components/MediaVideo';
import InspirationPage from './InspirationPage';

const initialInput = {
  productInfo: '',
  sellingPoints: '',
  scene: '',
  audience: 'young professionals',
  style: 'energetic',
  duration: 15,
  platform: 'dy',
  prompt: 'Use references, extract methodology, then generate a script with a strong first-three-second hook and direct CTA.',
};

const declarationText = {
  source: 'Only public metadata, source links, source declarations, and structured analysis are saved. Public videos are not retained, copied, remixed, or reused as assets.',
  reuse: 'Generated content may only reuse abstract strategy and creative factors. It must not copy source-video wording, shots, music, subtitles, sequencing, or unique expressions.',
};
const emptyTemplates = [];

function normalizeDeclaration(value, type) {
  const text = String(value || '').trim();
  if (!text) return declarationText[type];
  if (
    text.includes('仅保存公开视频公开元信息') ||
    text.includes('不下载、不保存、不复刻、不混剪原视频')
  ) return declarationText.source;
  if (
    text.includes('只能借鉴抽象策略') ||
    text.includes('不能照搬来源视频表达')
  ) return declarationText.reuse;
  return text;
}

function storyboardSceneId(scene, fallback = '') {
  return scene?.id || scene?.sceneId || String(scene?.order || scene?.sceneOrder || fallback);
}

function sceneDuration(scene) {
  return Math.max(1, Number(scene?.duration || scene?.durationSeconds || 3));
}

function sceneSummary(scene) {
  return scene?.subtitle || scene?.subtitleText || scene?.voiceover || scene?.visualDescription || scene?.sceneRole || 'Storyboard scene';
}

function selectedOptionsToIds(event) {
  return Array.from(event.target.selectedOptions).map((option) => option.value).filter(Boolean);
}

function assetId(asset) {
  return asset?.id || asset?.assetId || asset?.materialId;
}

function assetName(asset) {
  return asset?.title || asset?.name || asset?.originalName || assetId(asset) || 'Untitled asset';
}

function assetUrl(asset) {
  const isVideo = asset?.mediaType === 'video' || String(asset?.mimeType || '').startsWith('video/') || String(asset?.type || '').includes('video');
  if (isVideo) return asset?.previewUrl || asset?.browserPreviewUrl || asset?.metadata?.video?.previewUrl || asset?.fileUrl || asset?.url || asset?.thumbnailUrl || '';
  return asset?.thumbnailUrl || asset?.fileUrl || asset?.url || '';
}

function isVideoAsset(asset) {
  return asset?.mediaType === 'video' || String(asset?.mimeType || '').startsWith('video/') || String(asset?.type || '').includes('video');
}

function uniqueAssets(materials = [], candidateAssets = []) {
  const map = new Map();
  for (const asset of materials) {
    if (assetId(asset)) map.set(assetId(asset), asset);
  }
  for (const item of candidateAssets) {
    const asset = item?.asset || item;
    if (assetId(asset)) map.set(assetId(asset), asset);
  }
  return Array.from(map.values());
}

function scriptVersions(scriptRecord) {
  return Array.isArray(scriptRecord?.versions) ? scriptRecord.versions : [];
}

function activeScriptVersion(scriptRecord, versionId = '') {
  const versions = scriptVersions(scriptRecord);
  if (!versions.length) return null;
  if (versionId) return versions.find((version) => version.versionId === versionId) || versions[versions.length - 1];
  if (scriptRecord?.selectedVersionId) {
    const selected = versions.find((version) => version.versionId === scriptRecord.selectedVersionId);
    if (selected) return selected;
  }
  return versions[versions.length - 1];
}

function compactPrompt(value) {
  const text = String(value || '').trim();
  if (!text) return 'Manual version';
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function formatVersionDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

function StoryboardTimelineEditor({
  disabled,
  scenes,
  hasStoryboard,
  scriptRecord,
  storyboardRecord,
  scriptVersionOptions,
  selectedScriptVersionId,
  selectedScriptVersion,
  scriptWorkflowRunning,
  resolveMediaUrl,
  onSelectScriptVersion,
  onGenerateStoryboard,
  onDeleteStoryboard,
  onOpenScene,
  onReorderScenes,
}) {
  const [draggingId, setDraggingId] = useState('');
  const totalDuration = scenes.reduce((sum, scene) => sum + sceneDuration(scene), 0);

  const reorder = async (targetId) => {
    if (!draggingId || draggingId === targetId) return;
    const ids = scenes.map((scene, index) => storyboardSceneId(scene, index));
    const from = ids.indexOf(draggingId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = ids.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    await onReorderScenes(next);
    setDraggingId('');
  };

  return (
    <section className="storyboard-workspace">
      <div className="storyboard-toolbar">
        <label className="compact-field">
          Script version
          <select
            value={selectedScriptVersionId || ''}
            onChange={(event) => onSelectScriptVersion(event.target.value)}
            disabled={disabled || scriptWorkflowRunning || !scriptVersionOptions.length}
          >
            {scriptVersionOptions.map((version) => (
              <option key={version.versionId} value={version.versionId}>V{version.versionNumber}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={onGenerateStoryboard} disabled={disabled || scriptWorkflowRunning || !selectedScriptVersion?.scenes?.length}>
          Generate storyboard videos with Seedance 1.5 Pro
        </button>
        <div className="storyboard-stats">
          <span>{scenes.length} scenes</span>
          <span>{Number(totalDuration.toFixed(1))}s</span>
          <span>{hasStoryboard ? 'Storyboard ready' : 'Script draft only'}</span>
        </div>
        {hasStoryboard ? (
          <button type="button" onClick={onDeleteStoryboard} disabled={disabled || scriptWorkflowRunning}>
            Delete all storyboard
          </button>
        ) : null}
      </div>
      {scenes.length ? (
        <div className="storyboard-timeline" aria-label="Storyboard timeline">
          {scenes.map((scene, index) => {
            const id = storyboardSceneId(scene, index);
            const generatedVideoUrl = scene.generatedVideoUrl ? resolveMediaUrl(scene.generatedVideoUrl) : '';
            return (
              <article
                key={id}
                className={draggingId === id ? 'timeline-block dragging' : 'timeline-block'}
                draggable={!disabled && hasStoryboard}
                onDragStart={() => setDraggingId(id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => reorder(id)}
              >
                <div>
                  <strong>Scene {scene.order || scene.sceneOrder || index + 1}</strong>
                  <span>{sceneDuration(scene)}s</span>
                </div>
                <small>{scene.sceneRole || 'scene'}</small>
                {scene.generatedVideoUrl ? (
                  <MediaVideo
                    className="timeline-video"
                    muted
                    src={generatedVideoUrl}
                    label={`Scene ${scene.order || scene.sceneOrder || index + 1}`}
                    showActions={false}
                  />
                ) : null}
                <p>{sceneSummary(scene)}</p>
                {scene.generationStatus ? <small>{scene.generationStatus}</small> : null}
                {scene.generationError ? <small className="error-text">{scene.generationError}</small> : null}
                {scene.generatedOutputId ? <small>Output {scene.generatedOutputId}</small> : null}
                {scene.dialogueLanguage ? <small>Dialogue {scene.dialogueLanguage}</small> : null}
                {scene.seed2PlanningConfidence !== undefined ? <small>Seed2 confidence {Number(scene.seed2PlanningConfidence).toFixed(2)}</small> : null}
                {(scene.sourceReferenceAssetIds || []).length ? <small>Refs {(scene.sourceReferenceAssetIds || []).join(', ')}</small> : null}
                <div className="timeline-block-actions">
                  <button type="button" onClick={() => onOpenScene(id)} disabled={disabled || !hasStoryboard}>
                    Edit
                  </button>
                  {generatedVideoUrl ? (
                    <a className="button-link secondary" href={generatedVideoUrl} target="_blank" rel="noreferrer">
                      Open video
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="card empty-state">
          {scriptRecord?.scenes?.length ? 'Generate storyboard to create editable scenes.' : 'Generate a script before creating a storyboard.'}
        </div>
      )}
      {hasStoryboard && storyboardRecord?.scriptVersionId && selectedScriptVersionId && storyboardRecord.scriptVersionId !== selectedScriptVersionId ? (
        <p className="warning-text">This storyboard was generated from a different script version. Regenerate storyboard to align scenes, assets, and editing plan.</p>
      ) : null}
    </section>
  );
}

function ScriptVersionPicker({
  disabled,
  versions,
  selectedVersionId,
  scriptWorkflowRunning,
  onSelectVersion,
  onDeleteVersion,
}) {
  if (!versions.length) return null;
  const canDelete = versions.length > 1;
  return (
    <div>
      <h3>Script versions</h3>
      <div className="version-grid">
        {versions.map((version) => {
          const selected = selectedVersionId === version.versionId;
          return (
            <article
              key={version.versionId}
              role="button"
              tabIndex={disabled ? -1 : 0}
              className={selected ? 'version-card selected' : 'version-card'}
              onClick={() => !disabled && onSelectVersion(version)}
              onKeyDown={(event) => {
                if (!disabled && (event.key === 'Enter' || event.key === ' ')) onSelectVersion(version);
              }}
            >
              <div>
                <strong>V{version.versionNumber}</strong>
                <small>{formatVersionDate(version.createdAt)}</small>
              </div>
              <p>{compactPrompt(version.prompt || version.source)}</p>
              {canDelete ? (
                <button
                  type="button"
                  className="version-delete"
                  aria-label={`Delete version ${version.versionNumber}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (window.confirm(`Delete script version V${version.versionNumber}?`)) onDeleteVersion(version.versionId);
                  }}
                  disabled={disabled || scriptWorkflowRunning}
                >
                  x
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function StoryboardPreviewTimeline({ scenes, materials, resolveMediaUrl }) {
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef(null);
  const videoRef = useRef(null);
  const totalDuration = scenes.reduce((sum, scene) => sum + sceneDuration(scene), 0);
  let active = { scene: scenes[scenes.length - 1] || null, offset: 0 };
  {
    let cursor = 0;
    for (const scene of scenes) {
      const duration = sceneDuration(scene);
      if (currentTime < cursor + duration) {
        active = { scene, offset: currentTime - cursor };
        break;
      }
      cursor += duration;
    }
  }
  const generatedUrl = active.scene?.generatedVideoUrl || '';
  const ids = active.scene?.selectedAssetIds || [];
  const candidateAssets = uniqueAssets([], active.scene?.candidateAssets || []);
  const activeAsset = materials.find((asset) => ids.includes(assetId(asset))) || candidateAssets[0] || null;
  const previewUrl = generatedUrl
    ? resolveMediaUrl(generatedUrl)
    : activeAsset
        ? resolveMediaUrl(assetUrl(activeAsset))
        : '';
  const previewIsGenerated = Boolean(generatedUrl);
  const previewIsVideo = previewIsGenerated || (activeAsset && isVideoAsset(activeAsset));

  useEffect(() => {
    if (!playing || !totalDuration) return undefined;
    intervalRef.current = setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + 0.25;
        return next >= totalDuration ? 0 : next;
      });
    }, 250);
    return () => clearInterval(intervalRef.current);
  }, [playing, totalDuration]);

  useEffect(() => {
    if (!videoRef.current || !previewIsVideo || !previewUrl) return;
    const nextTime = Math.max(0, Number(active.offset || 0));
    if (Number.isFinite(nextTime)) {
      try { videoRef.current.currentTime = nextTime; } catch { /* browser may block seeking before metadata */ }
    }
  }, [active.scene, active.offset, previewIsVideo, previewUrl]);

  return (
    <section className="card section-card storyboard-preview">
      <div className="section-heading">
        <div>
          <h3>Realtime preview timeline</h3>
          <p>Fast front-end preview only. Final rendering still happens in Creation.</p>
        </div>
        <button type="button" onClick={() => setPlaying((prev) => !prev)} disabled={!scenes.length}>
          {playing ? 'Pause' : 'Play'}
        </button>
      </div>
      <div className="preview-stage">
        {previewIsVideo && previewUrl ? (
          <MediaVideo
            key={previewUrl}
            ref={videoRef}
            className="preview-video"
            autoPlay={playing}
            muted={!previewIsGenerated}
            src={previewUrl}
            label={previewIsGenerated ? 'Generated storyboard video' : 'Fallback source asset'}
            sourceLabel="Open video"
          />
        ) : null}
        {!previewIsVideo && activeAsset && previewUrl ? <img src={previewUrl} alt={assetName(activeAsset)} /> : null}
        {!previewUrl ? <div className="empty-state">No generated storyboard video or fallback asset for this scene.</div> : null}
      </div>
      <input
        type="range"
        min="0"
        max={totalDuration || 0}
        step="0.1"
        value={Math.min(currentTime, totalDuration || 0)}
        onChange={(event) => setCurrentTime(Number(event.target.value) || 0)}
        disabled={!totalDuration}
      />
      <div className="preview-timeline-strip">
        {scenes.map((scene, index) => (
          <span key={storyboardSceneId(scene, index)} style={{ flexGrow: sceneDuration(scene) }}>
            {scene.order || index + 1}
          </span>
        ))}
      </div>
      <p className="muted-line">
        {active.scene ? `Scene ${active.scene.order || active.scene.sceneOrder || '-'} · ${Number(active.offset.toFixed(1))}s / ${sceneDuration(active.scene)}s · ${previewIsGenerated ? 'Generated storyboard video' : 'Fallback source asset'}` : 'No scene selected'}
      </p>
    </section>
  );
}

function StoryboardSceneDetailPage({
  disabled,
  scene,
  materials,
  resolveMediaUrl,
  onBack,
  onSave,
  onRegenerate,
  onDelete,
}) {
  const [draft, setDraft] = useState(scene || {});
  const sceneId = storyboardSceneId(scene);
  const availableAssets = useMemo(() => uniqueAssets(materials, draft.candidateAssets || []), [draft.candidateAssets, materials]);

  useEffect(() => {
    setDraft(scene || {});
  }, [scene]);

  if (!scene) {
    return (
      <section className="card section-card">
        <div className="detail-page-header">
          <button type="button" className="back-button" onClick={onBack}>Back to Storyboard</button>
          <h3>Scene not found</h3>
        </div>
      </section>
    );
  }

  return (
    <section className="card form section-card">
      <div className="detail-page-header">
        <button type="button" className="back-button" onClick={onBack}>Back to Storyboard</button>
        <div>
          <h3>Scene {draft.order || draft.sceneOrder}</h3>
          <p>{draft.sceneRole || 'scene'} · {sceneDuration(draft)}s{draft.dialogueLanguage ? ` · Dialogue ${draft.dialogueLanguage}` : ''}</p>
        </div>
      </div>
      <div className="form-grid">
        <label>Role
          <select value={draft.sceneRole || 'selling_point'} onChange={(event) => setDraft((prev) => ({ ...prev, sceneRole: event.target.value }))} disabled={disabled}>
            <option value="hook">hook</option>
            <option value="product_closeup">product_closeup</option>
            <option value="usage_demo">usage_demo</option>
            <option value="selling_point">selling_point</option>
            <option value="comparison">comparison</option>
            <option value="cta">cta</option>
            <option value="transition">transition</option>
          </select>
        </label>
        <label>Duration
          <input type="number" min="1" max="10" step="0.1" value={draft.duration || 3} onChange={(event) => setDraft((prev) => ({ ...prev, duration: Number(event.target.value) || 3 }))} disabled={disabled} />
        </label>
        <label>Transition
          <input value={draft.transition || ''} onChange={(event) => setDraft((prev) => ({ ...prev, transition: event.target.value }))} disabled={disabled} />
        </label>
        <label>Layout
          <input value={draft.layout || ''} onChange={(event) => setDraft((prev) => ({ ...prev, layout: event.target.value }))} disabled={disabled} />
        </label>
      </div>
      <label>Visual description
        <textarea rows={3} value={draft.visualDescription || ''} onChange={(event) => setDraft((prev) => ({ ...prev, visualDescription: event.target.value }))} disabled={disabled} />
      </label>
      <label>Camera movement
        <input value={draft.cameraMovement || draft.cameraMotion || ''} onChange={(event) => setDraft((prev) => ({ ...prev, cameraMovement: event.target.value }))} disabled={disabled} />
      </label>
      <label>Voiceover
        <textarea rows={3} value={draft.voiceover || draft.narration || ''} onChange={(event) => setDraft((prev) => ({ ...prev, voiceover: event.target.value }))} disabled={disabled} />
      </label>
      <label>Subtitle
        <input value={draft.subtitle || draft.subtitleText || ''} onChange={(event) => setDraft((prev) => ({ ...prev, subtitle: event.target.value }))} disabled={disabled} />
      </label>
      <label>BGM
        <input value={draft.bgm || draft.bgmHint || ''} onChange={(event) => setDraft((prev) => ({ ...prev, bgm: event.target.value }))} disabled={disabled} />
      </label>
      <label>Selected assets
        <select multiple value={draft.selectedAssetIds || []} onChange={(event) => setDraft((prev) => ({ ...prev, selectedAssetIds: selectedOptionsToIds(event) }))} disabled={disabled}>
          {availableAssets.map((asset) => <option key={assetId(asset)} value={assetId(asset)}>{assetName(asset)}</option>)}
        </select>
      </label>
      <label>Selected slices
        <select multiple value={draft.selectedAssetSliceIds || []} onChange={(event) => setDraft((prev) => ({ ...prev, selectedAssetSliceIds: selectedOptionsToIds(event) }))} disabled={disabled}>
          {(draft.candidateSlices || []).map((slice) => <option key={slice.id} value={slice.id}>{slice.id} · {slice.startTime}s-{slice.endTime}s</option>)}
        </select>
      </label>
      <label>Generation prompt
        <textarea rows={2} value={draft.generationPrompt || ''} onChange={(event) => setDraft((prev) => ({ ...prev, generationPrompt: event.target.value }))} disabled={disabled} />
      </label>
      <label>Seedance prompt
        <textarea rows={5} value={draft.seedancePrompt || ''} onChange={(event) => setDraft((prev) => ({ ...prev, seedancePrompt: event.target.value }))} disabled={disabled} />
      </label>
      <label>Negative prompt
        <textarea rows={2} value={draft.negativePrompt || ''} onChange={(event) => setDraft((prev) => ({ ...prev, negativePrompt: event.target.value }))} disabled={disabled} />
      </label>
      <div className="scene-candidates">
        <strong>Seed2 planning</strong>
        <small>Confidence {draft.seed2PlanningConfidence !== undefined ? Number(draft.seed2PlanningConfidence).toFixed(2) : '-'}</small>
        <small>{draft.seed2PlanningReason || 'No planning reason yet.'}</small>
        {(draft.sourceReferenceAssetIds || []).length ? <small>Source assets {(draft.sourceReferenceAssetIds || []).join(', ')}</small> : null}
        {(draft.sourceReferenceSliceIds || []).length ? <small>Source slices {(draft.sourceReferenceSliceIds || []).join(', ')}</small> : null}
      </div>
      <div className="scene-candidates">
        <strong>Candidate assets</strong>
        {(draft.candidateAssets || []).slice(0, 4).map((item) => {
          const asset = item.asset || item;
          return <small key={assetId(asset)}>{assetName(asset)} · score {item.score ?? '-'}</small>;
        })}
        {draft.fallbackReason ? <small className="error-text">{draft.fallbackReason}</small> : null}
      </div>
      <div className="button-row">
        <button type="button" onClick={() => onSave(sceneId, draft)} disabled={disabled}>Save scene</button>
        <button type="button" onClick={() => onRegenerate(sceneId, { prompt: draft.generationPrompt || '' })} disabled={disabled}>Regenerate scene</button>
        <button type="button" onClick={() => window.confirm('Delete this storyboard scene?') && onDelete(sceneId)} disabled={disabled}>Delete scene</button>
      </div>
      <StoryboardPreviewTimeline scenes={[draft]} materials={materials} resolveMediaUrl={resolveMediaUrl} />
    </section>
  );
}

export default function ScriptPage({
  disabled,
  section = 'overview',
  detailId = '',
  onNavigateSection,
  onNavigateStoryboardScene,
  onBackToStoryboard,
  scriptText,
  scriptRecord,
  storyboardRecord,
  storyboardScenes = [],
  materials = [],
  resolveMediaUrl = (value) => value,
  scriptWorkflowTask,
  onGenerate,
  onRefine,
  onSelectVersion,
  onSave,
  onDeleteVersion,
  onGenerateStoryboard,
  onDeleteStoryboard,
  onSaveStoryboardScene,
  onRegenerateStoryboardScene,
  onDeleteStoryboardScene,
  onReorderStoryboardScenes,
  onScriptChange,
  inspirationProps,
}) {
  const [input, setInput] = useState(initialInput);
  const [refinePrompt, setRefinePrompt] = useState('Make it more suitable for TikTok Shop, with stronger pacing and a more direct CTA.');
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [selectedStoryboardVersionId, setSelectedStoryboardVersionId] = useState('');
  const [generationStatus, setGenerationStatus] = useState('');
  const [generationError, setGenerationError] = useState('');
  const templates = inspirationProps?.templates || emptyTemplates;
  const versions = useMemo(() => scriptVersions(scriptRecord), [scriptRecord]);
  const selectedVersion = useMemo(() => activeScriptVersion(scriptRecord), [scriptRecord]);
  const selectedStoryboardVersion = useMemo(() => activeScriptVersion(scriptRecord, selectedStoryboardVersionId), [scriptRecord, selectedStoryboardVersionId]);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) || null;
  const scriptWorkflowRunning = ['queued', 'running'].includes(scriptWorkflowTask?.status);
  const hasStoryboard = Boolean(storyboardRecord?.storyboardId || storyboardRecord?.id);
  const structuredScenes = hasStoryboard ? storyboardScenes : (scriptRecord?.scenes || []);
  const activeSection = section || 'references';
  const activeStoryboardScene = activeSection === 'storyboard' && detailId
    ? storyboardScenes.find((scene, index) => storyboardSceneId(scene, index) === detailId)
    : null;

  useEffect(() => {
    if (selectedTemplateId === null && templates[0]) setSelectedTemplateId(templates[0].id);
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    const next = selectedVersion?.versionId || '';
    if (!next) {
      setSelectedStoryboardVersionId('');
      return;
    }
    setSelectedStoryboardVersionId((prev) => (prev && versions.some((version) => version.versionId === prev) ? prev : next));
  }, [selectedVersion?.versionId, versions]);

  const generateStoryboard = () => {
    if (!selectedStoryboardVersion) return;
    onGenerateStoryboard({
      scriptVersionId: selectedStoryboardVersion.versionId,
      scriptVersionNumber: selectedStoryboardVersion.versionNumber,
      scriptText: selectedStoryboardVersion.scriptText || scriptText,
      scenes: selectedStoryboardVersion.scenes || scriptRecord?.scenes || [],
      createEditingPlan: true,
      provider: 'seedance_1_5_pro_video',
      sceneConcurrency: 3,
    });
  };

  const generate = async () => {
    setGenerationError('');
    setGenerationStatus('Generating script...');
    const sellingPoints = input.sellingPoints
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
    try {
      if (selectedTemplateId && inspirationProps?.onGenerateScript) {
        await inspirationProps.onGenerateScript({
          templateId: selectedTemplateId,
          productInfo: {
            title: input.productInfo,
            sellingPoints,
            targetAudience: input.audience,
            scene: input.scene,
            brandTone: input.style,
            duration: Number(input.duration) || 15,
            platform: input.platform || 'dy',
          },
          prompt: input.prompt,
        });
        setGenerationStatus('Script generation started. Track progress in Status.');
        return;
      }
      await onGenerate({ ...input, duration: Number(input.duration) || 15, sellingPoints });
      setGenerationStatus('Script generated.');
    } catch (error) {
      setGenerationStatus('');
      setGenerationError(error.message || 'Script generation failed.');
    }
  };

  return (
    <PageShell
      title="Script studio"
      description="Find references, mine creative methods, and generate structured selling scripts for this project."
    >
      <div className="section-tabs">
        {[
          ['references', 'References'],
          ['methodology', 'Methodology'],
          ['generate', 'Script Vision'],
          ['storyboard', 'Storyboard'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={activeSection === key ? 'active' : ''}
            onClick={() => onNavigateSection?.(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeSection === 'overview' ? <div className="strategy-grid">
        <section className="card section-card">
          <h3>1. Reference video library</h3>
          <p>Search or upload reference videos, then save only structured analysis: hook, selling points, storyboard, style, BGM, subtitles, and source declaration.</p>
          <button type="button" onClick={() => onNavigateSection?.('references')}>Open references</button>
        </section>
        <section className="card section-card">
          <h3>2. Methodology extraction</h3>
          <p>Cluster similar winning videos into inspiration templates with strategy, factors, and platform/compliance constraints.</p>
          <button type="button" onClick={() => onNavigateSection?.('methodology')}>Open methodology</button>
        </section>
        <section className="card section-card">
          <h3>3. Script generation</h3>
          <p>Combine product info, strategy, factors, and constraints into editable structured scenes.</p>
          <button type="button" onClick={() => onNavigateSection?.('generate')}>Open generator</button>
        </section>
      </div> : null}

      {inspirationProps && ['references', 'methodology'].includes(activeSection) ? (
        <InspirationPage
          {...inspirationProps}
          disabled={disabled}
          mode={activeSection}
          embedded
        />
      ) : null}

      {activeSection === 'generate' ? <div className="card form section-card">
        <div className="section-heading">
          <div>
            <h3>Unified Script Generator</h3>
            <p>Describe the product, select an optional methodology template, and generate one editable script with structured scenes.</p>
          </div>
        </div>
        <label>
          Methodology template
          <select
            value={selectedTemplateId || ''}
            onChange={(event) => setSelectedTemplateId(event.target.value)}
            disabled={disabled || !templates.length}
          >
            <option value="">No template - generate from inputs only</option>
            {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
        </label>
        {selectedTemplate ? (
          <div className="compliance-band compact">
            <span>{selectedTemplate.strategy?.name || 'Selected methodology'}</span>
            <span>{normalizeDeclaration(selectedTemplate.sourceDeclaration, 'source')}</span>
            <span>{normalizeDeclaration(selectedTemplate.reuseDeclaration, 'reuse')}</span>
          </div>
        ) : null}
        <label>
          Product info
          <input
            value={input.productInfo}
            onChange={(event) => setInput((prev) => ({ ...prev, productInfo: event.target.value }))}
            placeholder="Insulated coffee tumbler"
            disabled={disabled}
          />
        </label>
        <label>
          Selling points (comma separated)
          <input
            value={input.sellingPoints}
            onChange={(event) => setInput((prev) => ({ ...prev, sellingPoints: event.target.value }))}
            placeholder="Leakproof, 12h warm, one-click lid"
            disabled={disabled}
          />
        </label>
        <label>
          Scene
          <input
            value={input.scene}
            onChange={(event) => setInput((prev) => ({ ...prev, scene: event.target.value }))}
            placeholder="Morning commute, kitchen, outdoor travel"
            disabled={disabled}
          />
        </label>
        <label>
          Audience
          <input
            value={input.audience}
            onChange={(event) => setInput((prev) => ({ ...prev, audience: event.target.value }))}
            disabled={disabled}
          />
        </label>
        <label>
          Prompt method
          <textarea
            rows={3}
            value={input.prompt}
            onChange={(event) => setInput((prev) => ({ ...prev, prompt: event.target.value }))}
            disabled={disabled}
          />
        </label>
        <label>
          Marketing style
          <input
            value={input.style}
            onChange={(event) => setInput((prev) => ({ ...prev, style: event.target.value }))}
            disabled={disabled}
          />
        </label>
        <div className="form-grid">
          <label>
            Duration
            <input
              type="number"
              min="3"
              max="120"
              value={input.duration}
              onChange={(event) => setInput((prev) => ({ ...prev, duration: event.target.value }))}
              disabled={disabled}
            />
          </label>
          <label>
            Platform
            <select
              value={input.platform}
              onChange={(event) => setInput((prev) => ({ ...prev, platform: event.target.value }))}
              disabled={disabled}
            >
              <option value="dy">Douyin</option>
              <option value="tiktok">TikTok</option>
              <option value="xhs">Xiaohongshu</option>
              <option value="ks">Kuaishou</option>
              <option value="bili">Bilibili</option>
            </select>
          </label>
        </div>
        <div className="button-row">
          <button type="button" onClick={generate} disabled={disabled || scriptWorkflowRunning}>
            {selectedTemplateId ? 'Generate with template' : 'Generate script'}
          </button>
          <button type="button" onClick={onSave} disabled={disabled || (!scriptText.trim() && !scriptRecord?.scenes?.length)}>
            Save script
          </button>
        </div>
        {generationStatus ? <p className="muted-line">{generationStatus}</p> : null}
        {generationError ? <p className="error-text">{generationError}</p> : null}
      </div> : null}

      {activeSection === 'generate' ? <div className="card form section-card">
        <ScriptVersionPicker
          disabled={disabled}
          versions={versions}
          selectedVersionId={scriptRecord?.selectedVersionId || selectedVersion?.versionId || ''}
          scriptWorkflowRunning={scriptWorkflowRunning}
          onSelectVersion={onSelectVersion}
          onDeleteVersion={onDeleteVersion}
        />
        <label>
          Script text
          <textarea
            rows={8}
            value={scriptText}
            onChange={(event) => onScriptChange(event.target.value)}
            disabled={disabled}
          />
        </label>
        <label>
          Refine prompt
          <input
            value={refinePrompt}
            onChange={(event) => setRefinePrompt(event.target.value)}
            disabled={disabled || !scriptRecord}
          />
        </label>
        <button
          type="button"
          disabled={disabled || scriptWorkflowRunning || !scriptRecord || !refinePrompt.trim()}
          onClick={() => onRefine(refinePrompt)}
        >
          Refine and save new version
        </button>
      </div> : null}

      {activeSection === 'storyboard' ? (
        <>
          {detailId ? (
            <StoryboardSceneDetailPage
              disabled={disabled}
              scene={activeStoryboardScene}
              materials={materials}
              resolveMediaUrl={resolveMediaUrl}
              onBack={onBackToStoryboard}
              onSave={onSaveStoryboardScene}
              onRegenerate={onRegenerateStoryboardScene}
              onDelete={onDeleteStoryboardScene}
            />
          ) : (
            <>
              <StoryboardTimelineEditor
                disabled={disabled}
                scenes={structuredScenes}
                hasStoryboard={hasStoryboard}
                scriptRecord={scriptRecord}
                storyboardRecord={storyboardRecord}
                scriptVersionOptions={versions}
                selectedScriptVersionId={selectedStoryboardVersionId}
                selectedScriptVersion={selectedStoryboardVersion}
                scriptWorkflowRunning={scriptWorkflowRunning}
                resolveMediaUrl={resolveMediaUrl}
                onSelectScriptVersion={setSelectedStoryboardVersionId}
                onGenerateStoryboard={generateStoryboard}
                onDeleteStoryboard={onDeleteStoryboard}
                onOpenScene={onNavigateStoryboardScene}
                onReorderScenes={onReorderStoryboardScenes}
              />
              <StoryboardPreviewTimeline
                scenes={structuredScenes}
                materials={materials}
                resolveMediaUrl={resolveMediaUrl}
              />
            </>
          )}
        </>
      ) : null}
    </PageShell>
  );
}
