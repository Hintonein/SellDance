import { useState } from 'react';
import PageShell from '../components/PageShell';

const initialInput = {
  productInfo: '',
  sellingPoints: '',
  scene: '',
  audience: 'young professionals',
  style: 'energetic',
  prompt: '找参考 -> 提炼方法论 -> 生产脚本，突出前三秒 hook 和强 CTA。',
};

export default function ScriptPage({
  disabled,
  scriptText,
  scriptRecord,
  onGenerate,
  onRefine,
  onSelectVersion,
  onSave,
  onScriptChange,
  onScriptSceneUpdate,
  onSceneRegenerate,
}) {
  const [input, setInput] = useState(initialInput);
  const [refinePrompt, setRefinePrompt] = useState('更适合 TikTok Shop，语气更强，CTA 更直接。');

  const generate = async () => {
    await onGenerate({
      ...input,
      sellingPoints: input.sellingPoints
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
    });
  };

  return (
    <PageShell
      title="Script studio"
      description="Find references, mine creative methods, and generate structured selling scripts for this project."
    >
      <div className="strategy-grid">
        <section className="card section-card">
          <h3>1. 优质视频库</h3>
          <p>Search or upload reference videos, then save only structured analysis: hook, selling points, storyboard, style, BGM, subtitles, and source declaration.</p>
        </section>
        <section className="card section-card">
          <h3>2. 方法论提炼</h3>
          <p>Cluster similar winning videos into inspiration templates with strategy, factors, and platform/compliance constraints.</p>
        </section>
        <section className="card section-card">
          <h3>3. 剧本生成</h3>
          <p>Combine product info, strategy, factors, and constraints into editable structured scenes.</p>
        </section>
      </div>

      <div className="card form section-card">
        <div className="section-heading">
          <div>
            <h3>Script inputs</h3>
            <p>Describe the product, audience, selling points, and prompt strategy.</p>
          </div>
        </div>
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
        <div className="button-row">
          <button type="button" onClick={generate} disabled={disabled}>
            Generate script
          </button>
          <button type="button" onClick={onSave} disabled={disabled || (!scriptText.trim() && !scriptRecord?.scenes?.length)}>
            Save script
          </button>
        </div>
      </div>

      <div className="card form section-card">
        {scriptRecord?.versions?.length ? (
          <div>
            <h3>Script versions</h3>
            <div className="button-row">
              {scriptRecord.versions.map((version) => (
                <button
                  key={version.versionId}
                  type="button"
                  onClick={() => onSelectVersion(version)}
                  disabled={disabled}
                >
                  V{version.versionNumber}
                </button>
              ))}
            </div>
          </div>
        ) : null}
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
          disabled={disabled || !scriptRecord || !refinePrompt.trim()}
          onClick={() => onRefine(refinePrompt)}
        >
          Refine and save new version
        </button>
      </div>

      <div className="section-heading">
        <div>
          <h3>Structured scenes</h3>
          <p>Each scene is editable JSON-ready input for storyboard planning and creation.</p>
        </div>
      </div>
      <div className="scene-grid">
        {(scriptRecord?.scenes || []).map((scene, index) => (
          <article key={scene.id || index} className="card form scene-card">
            <div className="section-heading">
              <div>
                <h3>Scene {scene.order || index + 1}</h3>
                <p>{scene.sceneRole} · {scene.duration}s · {scene.sellingPoint || 'selling point pending'}</p>
              </div>
            </div>
            <label>
              Role
              <select
                value={scene.sceneRole || 'selling_point'}
                onChange={(event) => onScriptSceneUpdate(index, 'sceneRole', event.target.value)}
                disabled={disabled}
              >
                <option value="hook">hook</option>
                <option value="product_closeup">product_closeup</option>
                <option value="usage_demo">usage_demo</option>
                <option value="selling_point">selling_point</option>
                <option value="comparison">comparison</option>
                <option value="cta">cta</option>
                <option value="transition">transition</option>
              </select>
            </label>
            <label>
              Duration
              <input
                type="number"
                min="1"
                max="6"
                step="0.1"
                value={scene.duration || 3}
                onChange={(event) => onScriptSceneUpdate(index, 'duration', Number(event.target.value) || 3)}
                disabled={disabled}
              />
            </label>
            <label>
              Visual description
              <textarea
                rows={3}
                value={scene.visualDescription || ''}
                onChange={(event) => onScriptSceneUpdate(index, 'visualDescription', event.target.value)}
                disabled={disabled}
              />
            </label>
            <label>
              Voiceover
              <textarea
                rows={3}
                value={scene.voiceover || ''}
                onChange={(event) => onScriptSceneUpdate(index, 'voiceover', event.target.value)}
                disabled={disabled}
              />
            </label>
            <label>
              Subtitle
              <input
                value={scene.subtitle || ''}
                onChange={(event) => onScriptSceneUpdate(index, 'subtitle', event.target.value)}
                disabled={disabled}
              />
            </label>
            <label>
              Asset intent
              <textarea
                rows={2}
                value={scene.narrativeGoal || ''}
                onChange={(event) => onScriptSceneUpdate(index, 'narrativeGoal', event.target.value)}
                disabled={disabled}
              />
            </label>
            <button
              type="button"
              disabled={disabled || !scriptRecord}
              onClick={() => onSceneRegenerate(scene.id, { prompt: refinePrompt })}
            >
              Regenerate scene
            </button>
          </article>
        ))}
        {scriptRecord && !scriptRecord.scenes?.length ? <p className="card">No structured scenes yet.</p> : null}
      </div>
    </PageShell>
  );
}
