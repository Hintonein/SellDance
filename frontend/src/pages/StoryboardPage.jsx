import PageShell from '../components/PageShell';

function selectedOptionsToIds(event) {
  return Array.from(event.target.selectedOptions).map((option) => option.value);
}

export default function StoryboardPage({
  disabled,
  scriptText,
  scriptRecord,
  storyboard,
  scenes,
  materials,
  onGenerate,
  onSceneUpdate,
  onSave,
  onSceneSave,
  onSceneRegenerate,
}) {
  const storyboardId = storyboard?.id || storyboard?.storyboardId;

  return (
    <PageShell
      title="Storyboard"
      description="Generate visual scenes from script, review the timeline, and refresh individual scenes without rerendering the whole video."
    >
      <div className="card action-card">
        <button
          type="button"
          disabled={disabled || (!scriptText.trim() && !scriptRecord?.scenes?.length)}
          onClick={() => onGenerate(scriptRecord?.id || scriptRecord?.scriptId ? { scriptId: scriptRecord.id || scriptRecord.scriptId, scenes: scriptRecord.scenes } : { scriptText })}
        >
          Generate storyboard from structured script
        </button>
        <button type="button" disabled={disabled || scenes.length === 0} onClick={onSave}>
          Save storyboard
        </button>
      </div>

      <div className="timeline-strip">
        {scenes.map((scene, index) => (
          <button
            type="button"
            key={scene.id || scene.sceneId || index}
            className="timeline-scene"
            style={{ flexGrow: Math.max(1, Number(scene.duration || scene.durationSeconds || 3)) }}
            onClick={() => document.getElementById(`scene-${scene.id || scene.sceneId || index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          >
            <strong>{index + 1}</strong>
            <span>{scene.duration || scene.durationSeconds || 3}s</span>
          </button>
        ))}
      </div>

      <div className="scene-grid">
        {scenes.map((scene, index) => (
          <article id={`scene-${scene.id || scene.sceneId || index}`} key={scene.id || scene.sceneId || scene.sceneOrder || index} className="card form scene-card">
            <div className="section-heading">
              <div>
                <h3>Scene {scene.sceneOrder || index + 1}</h3>
                <p>{scene.sceneRole || 'selling_point'} · {scene.duration || scene.durationSeconds || 3}s · {scene.cameraMovement || scene.cameraMotion || 'camera motion pending'}</p>
              </div>
            </div>
            <label>
              Order
              <input
                type="number"
                min="1"
                value={scene.sceneOrder || index + 1}
                onChange={(event) => onSceneUpdate(index, 'sceneOrder', Number(event.target.value) || index + 1)}
                disabled={disabled}
              />
            </label>
            <label>
              Duration (seconds)
              <input
                type="number"
                min="1"
                step="0.1"
                value={scene.duration || scene.durationSeconds || 3}
                onChange={(event) => onSceneUpdate(index, 'duration', Number(event.target.value) || 3)}
                disabled={disabled}
              />
            </label>
            <label>
              Script text
              <textarea
                rows={3}
                value={scene.voiceover || scene.scriptText || ''}
                onChange={(event) => onSceneUpdate(index, 'voiceover', event.target.value)}
                disabled={disabled}
              />
            </label>
            <label>
              Subtitle text
              <input
                value={scene.subtitle || scene.subtitleText || ''}
                onChange={(event) => onSceneUpdate(index, 'subtitle', event.target.value)}
                disabled={disabled}
              />
            </label>
            <label>
              Visual description
              <textarea
                rows={3}
                value={scene.visualDescription || ''}
                onChange={(event) => onSceneUpdate(index, 'visualDescription', event.target.value)}
                disabled={disabled}
              />
            </label>
            <label>
              Camera motion
              <input
                value={scene.cameraMovement || scene.cameraMotion || ''}
                onChange={(event) => onSceneUpdate(index, 'cameraMovement', event.target.value)}
                disabled={disabled}
              />
            </label>
            <label>
              Layout
              <select
                value={scene.layout || 'cover'}
                onChange={(event) => onSceneUpdate(index, 'layout', event.target.value)}
                disabled={disabled}
              >
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
              </select>
            </label>
            <label>
              Transition
              <select
                value={scene.transition || 'cut'}
                onChange={(event) => onSceneUpdate(index, 'transition', event.target.value)}
                disabled={disabled}
              >
                <option value="cut">Cut</option>
                <option value="fade">Fade</option>
              </select>
            </label>
            <label>
              BGM hint
              <input
                value={scene.bgmHint || ''}
                onChange={(event) => onSceneUpdate(index, 'bgmHint', event.target.value)}
                disabled={disabled}
              />
            </label>
            <label>
              Assigned assets (manual)
              <select
                multiple
                value={scene.selectedAssetIds || []}
                onChange={(event) => onSceneUpdate(index, 'selectedAssetIds', selectedOptionsToIds(event))}
                disabled={disabled}
              >
                {materials.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.title || asset.name || asset.originalName || asset.id} ({asset.type})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Selected slices
              <select
                multiple
                value={scene.selectedAssetSliceIds || []}
                onChange={(event) => onSceneUpdate(index, 'selectedAssetSliceIds', selectedOptionsToIds(event))}
                disabled={disabled}
              >
                {(scene.candidateSlices || []).map((slice) => (
                  <option key={slice.id} value={slice.id}>
                    {slice.id} · {slice.startTime}s-{slice.endTime}s · {(slice.tags || []).slice(0, 3).join(', ')}
                  </option>
                ))}
              </select>
            </label>
            <div className="metadata-panel">
              <strong>Asset requirements</strong>
              <small>{scene.assetRequirements?.role || scene.sceneRole} · {(scene.assetRequirements?.optionalTags || []).join(', ') || 'No tags'}</small>
              <small>{scene.assetRequirements?.visualIntent || scene.visualDescription}</small>
            </div>
            <div className="metadata-panel">
              <strong>Recall candidates</strong>
              {(scene.candidateAssets || []).slice(0, 3).map((item) => (
                <small key={item.asset?.id || item.id}>
                  {(item.asset?.title || item.asset?.originalName || item.title || 'Asset')} · score {item.score ?? '-'} · {item.usageSuggestion || item.reason || ''}
                </small>
              ))}
              {scene.fallbackReason ? <small className="error-text">{scene.fallbackReason}</small> : null}
              {!scene.candidateAssets?.length && !scene.fallbackReason ? <small>No candidates yet.</small> : null}
            </div>
            <div className="button-row">
              <button
                type="button"
                disabled={disabled || !storyboardId}
                onClick={() => onSceneSave(storyboardId, scene.id || scene.sceneId || scene.sceneOrder, scene)}
              >
                Save scene
              </button>
              <button
                type="button"
                disabled={disabled || !storyboardId}
                onClick={() => onSceneRegenerate(storyboardId, scene.id || scene.sceneId || scene.sceneOrder, { prompt: scene.generationPrompt })}
              >
                Regenerate
              </button>
            </div>
          </article>
        ))}
        {scenes.length === 0 ? <p className="card">No scenes yet.</p> : null}
      </div>
    </PageShell>
  );
}
