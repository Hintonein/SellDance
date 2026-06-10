import { useState } from 'react';
import PageShell from '../components/PageShell';

const DEFAULT_EXPECTED_DURATION_SECONDS = 15;
const MAX_EXPECTED_DURATION_SECONDS = 300;

export default function ProjectPage({ projects, selectedProjectId, onSelect, onCreate, onArchive, authStatus, onUpdateArkKey }) {
  const [showCreate, setShowCreate] = useState(false);
  const [showArkKeyForm, setShowArkKeyForm] = useState(false);
  const [arkApiKey, setArkApiKey] = useState('');
  const [arkSaving, setArkSaving] = useState(false);
  const [arkError, setArkError] = useState('');
  const [form, setForm] = useState({
    name: '',
    productName: '',
    productUrl: '',
    productCategory: '',
    sellingPoints: '',
    targetAudience: '',
    style: 'fast TikTok product demo',
    targetPlatform: 'TikTok Shop',
    expectedDuration: DEFAULT_EXPECTED_DURATION_SECONDS,
    description: '',
  });

  const submit = async (event) => {
    event.preventDefault();
    await onCreate({
      ...form,
      projectName: form.name,
      sellingPoints: form.sellingPoints
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    });
    setForm({
      name: '',
      productName: '',
      productUrl: '',
      productCategory: '',
      sellingPoints: '',
      targetAudience: '',
      style: 'fast TikTok product demo',
      targetPlatform: 'TikTok Shop',
      expectedDuration: DEFAULT_EXPECTED_DURATION_SECONDS,
      description: '',
    });
    setShowCreate(false);
  };

  const submitArkKey = async (event) => {
    event.preventDefault();
    setArkError('');
    setArkSaving(true);
    try {
      await onUpdateArkKey(arkApiKey);
      setArkApiKey('');
      setShowArkKeyForm(false);
    } catch (error) {
      setArkError(error.message);
    } finally {
      setArkSaving(false);
    }
  };

  return (
    <PageShell
      title="Project setup"
      description="Open an existing project or create a new product video workflow."
    >
      <section className="card section-card">
        <div className="section-heading">
          <div>
            <h3>Ark connection</h3>
            <p>
              {authStatus?.arkApiKeyConfigured
                ? `Configured: ${authStatus.arkApiKeyMasked || 'available'}`
                : 'Ark API key is not configured.'}
            </p>
          </div>
          <button type="button" onClick={() => setShowArkKeyForm((prev) => !prev)}>
            {showArkKeyForm ? 'Close' : 'Change API key'}
          </button>
        </div>
        {showArkKeyForm ? (
          <form className="inline-config-form" onSubmit={submitArkKey}>
            <label>
              Ark API key
              <input
                type="password"
                value={arkApiKey}
                onChange={(event) => setArkApiKey(event.target.value)}
                placeholder="Paste a new Ark API key"
                autoComplete="off"
                required
              />
            </label>
            {arkError ? <div className="message error-message">{arkError}</div> : null}
            <div className="button-row">
              <button type="submit" disabled={arkSaving || !arkApiKey.trim()}>
                {arkSaving ? 'Saving...' : 'Save API key'}
              </button>
              <button type="button" onClick={() => { setShowArkKeyForm(false); setArkApiKey(''); setArkError(''); }} disabled={arkSaving}>
                Cancel
              </button>
            </div>
            <small>The key is written to the backend .env file and is not stored in browser localStorage.</small>
          </form>
        ) : null}
      </section>

      <section className="card section-card">
        <div className="section-heading">
          <div>
            <h3>Create project</h3>
            <p>Optional. You can open an existing project below and continue assets, script, storyboard, and creation in one place.</p>
          </div>
          <button type="button" onClick={() => setShowCreate((prev) => !prev)}>
            {showCreate ? 'Close' : 'New project'}
          </button>
        </div>
      </section>

      {showCreate ? <form className="card form section-card" onSubmit={submit}>
        <label>
          Project name
          <input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Summer bottle campaign"
            required
          />
        </label>
        <label>
          Product name
          <input
            value={form.productName}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, productName: event.target.value }))
            }
            placeholder="Leakproof sports bottle"
          />
        </label>
        <label>
          Product link or ID
          <input
            value={form.productUrl}
            onChange={(event) => setForm((prev) => ({ ...prev, productUrl: event.target.value }))}
            placeholder="TikTok Shop URL or SKU"
          />
        </label>
        <label>
          Product category
          <input
            value={form.productCategory}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, productCategory: event.target.value }))
            }
            placeholder="Beauty, apparel, home, electronics"
          />
        </label>
        <label>
          Selling points
          <textarea
            value={form.sellingPoints}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, sellingPoints: event.target.value }))
            }
            placeholder="Foldable design, 1L capacity, BPA free"
            rows={3}
          />
        </label>
        <label>
          Target audience
          <input
            value={form.targetAudience}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, targetAudience: event.target.value }))
            }
            placeholder="Young commuters, moms, outdoor shoppers"
          />
        </label>
        <label>
          Video style
          <input
            value={form.style}
            onChange={(event) => setForm((prev) => ({ ...prev, style: event.target.value }))}
          />
        </label>
        <label>
          Target platform
          <input
            value={form.targetPlatform}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, targetPlatform: event.target.value }))
            }
          />
        </label>
        <label>
          Expected duration
          <input
            type="number"
            min="6"
            max={MAX_EXPECTED_DURATION_SECONDS}
            value={form.expectedDuration}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, expectedDuration: Number(event.target.value) }))
            }
          />
        </label>
        <button type="submit">Create project</button>
      </form> : null}

      <div className="card section-card">
        <div className="section-heading">
          <div>
            <h3>Projects</h3>
            <p>Select an active merchant campaign or archive completed work.</p>
          </div>
        </div>
        <ul className="list">
          {projects.filter((project) => project.status !== 'archived').map((project) => (
            <li key={project.id}>
              <div
                className={project.id === selectedProjectId ? 'list-item active' : 'list-item'}
                onClick={() => onSelect(project.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onSelect(project.id);
                }}
              >
                <span>
                  <strong>{project.projectName || project.name}</strong>
                  <small>
                    {project.productName} · {project.productCategory || 'general'} ·{' '}
                    {project.targetPlatform || 'TikTok Shop'}
                  </small>
                </span>
                <span className="project-actions">
                  <small>{new Date(project.updatedAt || project.createdAt).toLocaleString()}</small>
                  <button type="button" onClick={(event) => { event.stopPropagation(); onArchive(project.id); }}>
                    Archive
                  </button>
                </span>
              </div>
            </li>
          ))}
          {projects.length === 0 ? <li>No projects yet.</li> : null}
        </ul>
      </div>
    </PageShell>
  );
}
