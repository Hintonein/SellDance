import { useState } from 'react';
import PageShell from '../components/PageShell';

const initialInput = {
  productInfo: '',
  sellingPoints: '',
  audience: 'young professionals',
  style: 'energetic',
};

export default function ScriptPage({ disabled, scriptText, onGenerate, onSave, onScriptChange }) {
  const [input, setInput] = useState(initialInput);

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
          Audience
          <input
            value={input.audience}
            onChange={(event) => setInput((prev) => ({ ...prev, audience: event.target.value }))}
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
        <label>
          Script
          <textarea
            rows={8}
            value={scriptText}
            onChange={(event) => onScriptChange(event.target.value)}
            disabled={disabled}
          />
        </label>
      </div>
    </PageShell>
  );
}
