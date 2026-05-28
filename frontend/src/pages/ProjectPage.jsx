import { useState } from 'react';
import PageShell from '../components/PageShell';

export default function ProjectPage({ projects, selectedProjectId, onSelect, onCreate, onArchive }) {
  const [form, setForm] = useState({
    name: '',
    productName: '',
    productUrl: '',
    productCategory: '',
    sellingPoints: '',
    targetAudience: '',
    style: 'fast TikTok product demo',
    targetPlatform: 'TikTok Shop',
    expectedDuration: 15,
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
      expectedDuration: 15,
      description: '',
    });
  };

  return (
    <PageShell
      title="Project creation"
      description="Start a product video project for TikTok Shop or cross-border e-commerce campaigns."
    >
      <form className="card form" onSubmit={submit}>
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
            max="15"
            value={form.expectedDuration}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, expectedDuration: Number(event.target.value) }))
            }
          />
        </label>
        <button type="submit">Create project</button>
      </form>

      <div className="card">
        <h3>Projects</h3>
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
