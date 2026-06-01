export default function EditingPlanPreview({ plan }) {
  if (!plan) return null;
  const rows = plan.clips || plan.steps || [];
  return (
    <ol className="flow-list">
      {rows.map((clip, index) => (
        <li key={clip.id || clip.index || index}>
          <strong>Clip {clip.order || clip.index || index + 1}</strong> · {clip.duration}s · {clip.mediaType || 'asset'} · {clip.subtitle || clip.visualDescription || clip.reason}
        </li>
      ))}
    </ol>
  );
}
