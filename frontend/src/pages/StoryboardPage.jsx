import PageShell from '../components/PageShell';

function selectedOptionsToIds(event) {
  return Array.from(event.target.selectedOptions).map((option) => option.value);
}

export default function StoryboardPage({
  disabled,
  scriptText,
  scenes,
  materials,
  onGenerate,
  onSceneUpdate,
  onSave,
}) {
  return (
    <PageShell
      title="Storyboard editing"
      description="Edit scene duration/subtitles and manually assign uploaded assets to each scene."
    >
      <div className="card button-row">
        <button type="button" disabled={disabled || !scriptText.trim()} onClick={() => onGenerate(scriptText)}>
          Generate storyboard from script
        </button>
        <button type="button" disabled={disabled || scenes.length === 0} onClick={onSave}>
          Save storyboard
        </button>
      </div>

      <div className="scene-grid">
        {scenes.map((scene, index) => (
          <article key={scene.sceneOrder || index} className="card form">
            <h3>Scene {scene.sceneOrder || index + 1}</h3>
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
                value={scene.durationSeconds || 3}
                onChange={(event) => onSceneUpdate(index, 'durationSeconds', Number(event.target.value) || 3)}
                disabled={disabled}
              />
            </label>
            <label>
              Script text
              <textarea
                rows={3}
                value={scene.scriptText || ''}
                onChange={(event) => onSceneUpdate(index, 'scriptText', event.target.value)}
                disabled={disabled}
              />
            </label>
            <label>
              Subtitle text
              <input
                value={scene.subtitleText || ''}
                onChange={(event) => onSceneUpdate(index, 'subtitleText', event.target.value)}
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
                value={scene.cameraMotion || ''}
                onChange={(event) => onSceneUpdate(index, 'cameraMotion', event.target.value)}
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
                    {asset.originalName} ({asset.type})
                  </option>
                ))}
              </select>
            </label>
          </article>
        ))}
        {scenes.length === 0 ? <p className="card">No scenes yet.</p> : null}
      </div>
    </PageShell>
  );
}
