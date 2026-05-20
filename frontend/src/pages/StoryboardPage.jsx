import PageShell from '../components/PageShell';

export default function StoryboardPage({ disabled, scriptText, scenes, onGenerate, onSceneUpdate, onSave }) {
  return (
    <PageShell
      title="Storyboard editing"
      description="Split script into scenes and pair each scene with product materials for preview."
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
          <article key={scene.sceneNumber || index} className="card form">
            <h3>Scene {scene.sceneNumber || index + 1}</h3>
            <label>
              Narration
              <textarea
                rows={3}
                value={scene.narration || ''}
                onChange={(event) => onSceneUpdate(index, 'narration', event.target.value)}
                disabled={disabled}
              />
            </label>
            <label>
              Subtitle
              <input
                value={scene.subtitle || ''}
                onChange={(event) => onSceneUpdate(index, 'subtitle', event.target.value)}
                disabled={disabled}
              />
            </label>
            <label>
              Matched asset
              <input
                value={scene.selectedAssetName || ''}
                onChange={(event) => onSceneUpdate(index, 'selectedAssetName', event.target.value)}
                disabled={disabled}
              />
            </label>
          </article>
        ))}
        {scenes.length === 0 ? <p className="card">No scenes yet.</p> : null}
      </div>
    </PageShell>
  );
}
