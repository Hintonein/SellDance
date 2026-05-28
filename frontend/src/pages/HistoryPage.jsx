import PageShell from '../components/PageShell';

export default function HistoryPage({ tasks, onRetry, disabled, resolveMediaUrl }) {
  return (
    <PageShell
      title="Generation history"
      description="Track long-running jobs, retry failed tasks, and inspect progress states."
    >
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Task ID</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Step</th>
              <th>Error</th>
              <th>Export</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td>{task.id.slice(0, 8)}</td>
                <td>{task.status}</td>
                <td>{task.progress}%</td>
                <td>{task.currentStep || '-'}</td>
                <td>{task.errorMessage || '-'}</td>
                <td>
                  {task.videoUrl ? (
                    <a href={resolveMediaUrl(task.videoUrl)} target="_blank" rel="noreferrer">
                      MP4
                    </a>
                  ) : (
                    task.exportFile || '-'
                  )}
                </td>
                <td>
                  {task.status === 'failed' ? (
                    <button type="button" onClick={() => onRetry(task.id)} disabled={disabled}>
                      Retry
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={7}>No generation history yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
