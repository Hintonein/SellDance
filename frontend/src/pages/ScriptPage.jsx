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
}) {
  const [input, setInput] = useState(initialInput);
  const [refinePrompt, setRefinePrompt] = useState('更适合 TikTok Shop，语气更强，CTA 更直接。');

  const generate = async () => {
    await onGenerate({
      ...input,
        sellingPoints: input.sellingPoints
        .split(',')
        .map((item) => item.trim())
            .filter(Boolean),
    });
  };

  return (
    <PageShell
      title="Script editing"
      description="Generate and edit short-form selling scripts with target audience and style controls."
    >
      <div className="card form">
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
          <button type="button" onClick={onSave} disabled={disabled || !scriptText.trim()}>
            Save script
          </button>
        </div>
      </div>

      <div className="card form">
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
          Script
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
    </PageShell>
  );
}
