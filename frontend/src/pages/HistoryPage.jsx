import PageShell from '../components/PageShell';
import { useState } from 'react';

const runningStatuses = new Set(['queued', 'processing', 'rendering', 'running']);

export default function HistoryPage({
  tasks,
  deletedTasks = [],
  onRetry,
  onOpenTask,
  onDeleteTask,
  onRestoreTask,
  onDeleteTaskPermanent,
  disabled,
  resolveMediaUrl,
}) {
  const [view, setView] = useState('history');
  const rows = view === 'trash' ? deletedTasks : tasks;

  const moveToTrash = (task) => {
    if (!window.confirm('Move this generation record to Trash? The generated video file will be kept until you delete it permanently.')) return;
    onDeleteTask?.(task.id || task.taskId);
  };

  const deletePermanently = (task) => {
    if (!window.confirm('Permanently delete this generation record and its generated video files? This cannot be undone.')) return;
    onDeleteTaskPermanent?.(task.id || task.taskId);
  };

  return (
    <PageShell
      title="Generation history"
      description="Track long-running jobs, retry failed tasks, and inspect progress states."
    >
      <div className="card section-card">
        <div className="section-tabs compact-tabs">
          <button type="button" className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>
            History
          </button>
          <button type="button" className={view === 'trash' ? 'active' : ''} onClick={() => setView('trash')}>
            Trash ({deletedTasks.length})
          </button>
        </div>
        <div className="table-scroll">
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
              {rows.map((task) => {
                const taskId = task.id || task.taskId;
                const isRunning = runningStatuses.has(task.status) || runningStatuses.has(task.rawStatus);
                return (
                <tr key={task.id}>
                  <td className="mono-cell">{task.id.slice(0, 8)}</td>
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
                    {view === 'history' ? (
                      <>
                        <button type="button" onClick={() => onOpenTask?.(taskId)} disabled={disabled}>
                          Detail
                        </button>
                        {task.status === 'failed' ? (
                          <button type="button" onClick={() => onRetry(taskId)} disabled={disabled}>
                            Retry
                          </button>
                        ) : null}
                        <button type="button" onClick={() => moveToTrash(task)} disabled={disabled || isRunning}>
                          Move to Trash
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => onRestoreTask?.(taskId)} disabled={disabled}>
                          Restore
                        </button>
                        <button type="button" onClick={() => deletePermanently(task)} disabled={disabled}>
                          Delete permanently
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );})}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>{view === 'trash' ? 'Trash is empty.' : 'No generation history yet.'}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </PageShell>
  );
}
