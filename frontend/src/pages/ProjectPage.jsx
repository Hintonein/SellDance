import { useState } from 'react';
import PageShell from '../components/PageShell';

export default function ProjectPage({ projects, selectedProjectId, onSelect, onCreate }) {
  const [form, setForm] = useState({ name: '', productName: '', description: '' });

  const submit = async (event) => {
    event.preventDefault();
    await onCreate(form);
    setForm({ name: '', productName: '', description: '' });
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
          Description
          <textarea
            value={form.description}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, description: event.target.value }))
            }
            placeholder="Foldable design, 1L capacity, BPA free"
            rows={3}
          />
        </label>
        <button type="submit">Create project</button>
      </form>

      <div className="card">
        <h3>Projects</h3>
        <ul className="list">
          {projects.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                className={project.id === selectedProjectId ? 'list-item active' : 'list-item'}
                onClick={() => onSelect(project.id)}
              >
                <span>{project.name}</span>
                <small>{new Date(project.createdAt).toLocaleString()}</small>
              </button>
            </li>
          ))}
          {projects.length === 0 ? <li>No projects yet.</li> : null}
        </ul>
      </div>
    </PageShell>
  );
}
