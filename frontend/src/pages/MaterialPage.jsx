import { useState } from 'react';
import PageShell from '../components/PageShell';

export default function MaterialPage({ disabled, materials, onUpload }) {
  const [file, setFile] = useState(null);
  const [type, setType] = useState('image');

  const submit = async (event) => {
    event.preventDefault();
    if (!file) return;
    await onUpload({ file, type });
    setFile(null);
    event.target.reset();
  };

  return (
    <PageShell
      title="Material upload"
      description="Upload product photos, videos, and reference assets for scene matching."
    >
      <form className="card form" onSubmit={submit}>
        <label>
          Material type
          <select value={type} onChange={(event) => setType(event.target.value)} disabled={disabled}>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="reference">Reference asset</option>
          </select>
        </label>
        <label>
          File
          <input
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            disabled={disabled}
            required
          />
        </label>
        <button type="submit" disabled={disabled}>
          Upload asset
        </button>
      </form>

      <div className="card">
        <h3>Uploaded materials</h3>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((asset) => (
              <tr key={asset.id}>
                <td>{asset.originalName}</td>
                <td>{asset.type}</td>
                <td>{Math.round(asset.size / 1024)} KB</td>
              </tr>
            ))}
            {materials.length === 0 ? (
              <tr>
                <td colSpan={3}>No materials uploaded.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
