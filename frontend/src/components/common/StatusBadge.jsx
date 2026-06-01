const statusLabels = {
  pending: 'pending',
  processing: 'processing',
  queued: 'queued',
  running: 'running',
  generating: 'generating',
  downloading: 'downloading',
  indexed: 'indexed',
  completed: 'completed',
  ready: 'ready',
  failed: 'failed',
};

export default function StatusBadge({ status = 'pending', children }) {
  const normalized = String(status || 'pending').toLowerCase();
  return (
    <span className={`status-badge status-${normalized}`} title={normalized}>
      {children || statusLabels[normalized] || normalized}
    </span>
  );
}
