import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import { api } from './services/api';
import ProjectPage from './pages/ProjectPage';
import MaterialPage from './pages/MaterialPage';
import ScriptPage from './pages/ScriptPage';
import StoryboardPage from './pages/StoryboardPage';
import VideoWorkflowPage from './pages/VideoWorkflowPage';
import HistoryPage from './pages/HistoryPage';

function normalizeAssetsResponse(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.items)) return response.items.map((item) => item.asset || item);
  return [];
}

function resolveMediaUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
  if (!import.meta.env.VITE_API_BASE_URL) {
    return path.startsWith('/') ? path : `/${path}`;
  }
  const origin = new URL(apiBase).origin;
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

const pages = [
  { key: 'projects', label: 'Project Setup' },
  { key: 'materials', label: 'Assets' },
  { key: 'script', label: 'Script' },
  { key: 'storyboard', label: 'Storyboard' },
  { key: 'workflow', label: 'Creation' },
];

const assetGenerationStageLabels = {
  queued: '正在创建任务',
  generating: '后端生成中',
  downloading: '下载中',
  indexed: '写入素材库',
  ready: '完成',
  failed: '失败',
};

function isAssetGenerationRunning(task) {
  return Boolean(task?.id && task.id !== 'pending' && !['ready', 'failed'].includes(task.status));
}

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (!minutes) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function taskStartedAt(task) {
  const value = task?.createdAt || task?.startedAt || task?.updatedAt;
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function App() {
  const [activePage, setActivePage] = useState('projects');
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [materials, setMaterials] = useState([]);
  const [globalAssets, setGlobalAssets] = useState([]);
  const [scriptRecord, setScriptRecord] = useState(null);
  const [scriptText, setScriptText] = useState('');
  const [storyboardRecord, setStoryboardRecord] = useState(null);
  const [scenes, setScenes] = useState([]);
  const [editingPlan, setEditingPlan] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [message, setMessage] = useState('');
  const [statusPanelOpen, setStatusPanelOpen] = useState(false);
  const [dismissedRenderTaskIds, setDismissedRenderTaskIds] = useState([]);
  const [assetGenerationTask, setAssetGenerationTask] = useState(null);
  const [assetGenerationNow, setAssetGenerationNow] = useState(Date.now());

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId),
    [projects, selectedProjectId]
  );

  const assetGenerationElapsedMs = useMemo(() => {
    if (!assetGenerationTask) return 0;
    const endTime = ['ready', 'failed'].includes(assetGenerationTask.status)
      ? Date.parse(assetGenerationTask.updatedAt || assetGenerationTask.completedAt || '') || assetGenerationNow
      : assetGenerationNow;
    return endTime - taskStartedAt(assetGenerationTask);
  }, [assetGenerationNow, assetGenerationTask]);

  const assetGenerationElapsedLabel = formatElapsed(assetGenerationElapsedMs);
  const assetGenerationTaskId = assetGenerationTask?.id;
  const assetGenerationTaskStatus = assetGenerationTask?.status;
  const assetGenerationTaskProjectId = assetGenerationTask?.projectId;
  const shouldPollAssetGeneration =
    Boolean(assetGenerationTaskId) &&
    assetGenerationTaskId !== 'pending' &&
    !['ready', 'failed'].includes(assetGenerationTaskStatus);

  const withToast = async (fn, successMessage) => {
    try {
      const data = await fn();
      setMessage(successMessage);
      return data;
    } catch (error) {
      setMessage(error.message);
      return null;
    }
  };

  const loadProjects = useCallback(async () => {
    const data = await withToast(() => api.listProjects(), 'Projects loaded.');
    if (data) {
      setProjects(data);
      if (!selectedProjectId && data[0]) {
        setSelectedProjectId(data[0].id);
      }
    }
  }, [selectedProjectId]);

  const loadProjectData = async (projectId) => {
    const [materialsData, globalAssetsData, scriptData, storyboardData, taskData] = await Promise.all([
      api.listAssets(projectId),
      api.listGlobalAssets(),
      api.getScript(projectId),
      api.getStoryboard(projectId),
      api.listTasks(projectId),
    ]);

    setMaterials(normalizeAssetsResponse(materialsData));
    setGlobalAssets(normalizeAssetsResponse(globalAssetsData));
    setScriptRecord(scriptData.scriptId ? scriptData : null);
    setScriptText(scriptData.scriptText || '');
    setStoryboardRecord(storyboardData.storyboardId ? storyboardData : null);
    setScenes(storyboardData.scenes || []);
    setEditingPlan(null);
    setTasks(taskData);
  };

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!selectedProjectId) return;
    withToast(() => loadProjectData(selectedProjectId), 'Project data synced.');
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) return;
    const timer = setInterval(async () => {
      try {
        const taskData = await api.listTasks(selectedProjectId);
        setTasks(taskData);
      } catch {
        // polling should be silent
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [selectedProjectId]);

  useEffect(() => {
    if (!assetGenerationTask || ['ready', 'failed'].includes(assetGenerationTask.status)) return undefined;
    const timer = setInterval(() => setAssetGenerationNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [assetGenerationTask]);

  useEffect(() => {
    const taskId = assetGenerationTaskId;
    if (!taskId || !shouldPollAssetGeneration) return undefined;
    const projectId = assetGenerationTaskProjectId || selectedProjectId;
    if (!projectId) return undefined;

    const poll = async () => {
      try {
        const next = await api.getAssetGenerationTask(projectId, taskId);
        const normalizedTask = {
          ...next,
          projectId,
          stageLabel: assetGenerationStageLabels[next.status] || next.status,
        };
        setAssetGenerationTask(normalizedTask);
        if (next.status === 'ready') {
          if (projectId === selectedProjectId) {
            setMaterials(normalizeAssetsResponse(await api.listAssets(projectId)));
          }
          setGlobalAssets(normalizeAssetsResponse(await api.listGlobalAssets()));
          setMessage(`AI asset generation completed. Elapsed ${formatElapsed(Date.now() - taskStartedAt(normalizedTask))}.`);
        }
        if (next.status === 'failed') {
          setMessage(`AI asset generation failed after ${formatElapsed(Date.now() - taskStartedAt(normalizedTask))}: ${next.error || 'unknown error'}`);
        }
      } catch (error) {
        setAssetGenerationTask((prev) => ({
          ...(prev || { id: taskId, projectId }),
          status: 'failed',
          stageLabel: assetGenerationStageLabels.failed,
          error: error.message,
        }));
        setMessage(`AI asset generation polling failed: ${error.message}`);
      }
    };

    poll();
    const timer = setInterval(poll, 1200);
    return () => clearInterval(timer);
  }, [assetGenerationTaskId, assetGenerationTaskProjectId, selectedProjectId, shouldPollAssetGeneration]);

  const disabled = !selectedProjectId;
  const selectedProjectGenerationTask = assetGenerationTask?.projectId === selectedProjectId ? assetGenerationTask : null;
  const isSelectedProjectGenerating = isAssetGenerationRunning(selectedProjectGenerationTask) || selectedProjectGenerationTask?.id === 'pending';
  const visibleStatusTask = tasks.find((task) => !dismissedRenderTaskIds.includes(task.id || task.taskId));

  return (
    <div className="layout">
      <aside>
        <h1>SellDance Studio</h1>
        <p>E-commerce video generation</p>
        <div className="project-chip">Current: {selectedProject?.name || 'No project selected'}</div>
        <div className="nav-group-label">Project flow</div>
        <nav>
          {pages.map((page) => (
            <button
              key={page.key}
              type="button"
              className={activePage === page.key ? 'active' : ''}
              onClick={() => setActivePage(page.key)}
            >
              {page.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className={statusPanelOpen ? 'status-dock expanded' : 'status-dock'}>
          <button type="button" className="status-toggle" onClick={() => setStatusPanelOpen((prev) => !prev)}>
            <span>Status</span>
            <small>{statusPanelOpen ? 'Collapse' : 'Open'}</small>
          </button>
          <div className="status-panel">
            {assetGenerationTask ? (
              <div className="global-task">
                <div className="global-task-header">
                  <strong>AI asset generation</strong>
                  <span>{assetGenerationTask.stageLabel || assetGenerationTask.status}</span>
                </div>
                <div className="inline-progress"><span style={{ width: `${assetGenerationTask.progress || 0}%` }} /></div>
                <div className="global-task-meta">
                  <span>{assetGenerationTask.progress || 0}%</span>
                  <span>Elapsed {assetGenerationElapsedLabel}</span>
                </div>
                {['ready', 'failed'].includes(assetGenerationTask.status) ? (
                  <button type="button" onClick={() => setAssetGenerationTask(null)}>Close</button>
                ) : null}
                {assetGenerationTask.error ? <small>{assetGenerationTask.error}</small> : null}
              </div>
            ) : <small>No AI asset generation task.</small>}
            {visibleStatusTask ? (
              <div className="global-task">
                <div className="global-task-header">
                  <strong>Render task</strong>
                  <span>{visibleStatusTask.status}</span>
                </div>
                <div className="inline-progress"><span style={{ width: `${visibleStatusTask.progress || 0}%` }} /></div>
                <div className="global-task-meta">
                  <span>{visibleStatusTask.progress || 0}%</span>
                  <button type="button" onClick={() => setActivePage('history')}>History</button>
                </div>
                {['completed', 'failed', 'canceled', 'cancelled'].includes(visibleStatusTask.status) ? (
                  <button type="button" onClick={() => setDismissedRenderTaskIds((prev) => [...prev, visibleStatusTask.id || visibleStatusTask.taskId])}>Close</button>
                ) : null}
              </div>
            ) : <small>No render task yet.</small>}
          </div>
        </div>
        {message ? <div className="message">{message}</div> : null}
      </aside>

      <main>
        {activePage === 'projects' ? (
          <ProjectPage
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelect={setSelectedProjectId}
            onCreate={(payload) =>
              withToast(async () => {
                const created = await api.createProject(payload);
                await loadProjects();
                setSelectedProjectId(created.id);
              }, 'Project created.')
            }
            onArchive={(projectId) =>
              withToast(async () => {
                await api.archiveProject(projectId);
                await loadProjects();
              }, 'Project archived.')
            }
          />
        ) : null}

        {activePage === 'materials' ? (
          <MaterialPage
            disabled={disabled}
            materials={materials}
            globalAssets={globalAssets}
            resolveMediaUrl={resolveMediaUrl}
            onUpload={(payload) =>
              withToast(async () => {
                await api.uploadAsset(selectedProjectId, payload);
                setMaterials(normalizeAssetsResponse(await api.listAssets(selectedProjectId)));
                setGlobalAssets(normalizeAssetsResponse(await api.listGlobalAssets()));
              }, 'Material uploaded.')
            }
            onDelete={(assetId, options = {}) =>
              withToast(async () => {
                await api.deleteAsset(selectedProjectId, assetId, options);
                setMaterials(normalizeAssetsResponse(await api.listAssets(selectedProjectId)));
                setGlobalAssets(normalizeAssetsResponse(await api.listGlobalAssets()));
                setEditingPlan(null);
              }, options.deleteGlobal ? 'Asset deleted from global library.' : 'Asset removed from project.')
            }
            onLinkAsset={(assetId) =>
              withToast(async () => {
                await api.linkAssetToProject(selectedProjectId, assetId, { addedFrom: 'library' });
                setMaterials(normalizeAssetsResponse(await api.listAssets(selectedProjectId)));
              }, 'Asset added to project.')
            }
            onDeleteGlobalAsset={(assetId) =>
              withToast(async () => {
                await api.deleteGlobalAsset(assetId);
                setMaterials(normalizeAssetsResponse(await api.listAssets(selectedProjectId)));
                setGlobalAssets(normalizeAssetsResponse(await api.listGlobalAssets()));
                setEditingPlan(null);
              }, 'Global asset deleted.')
            }
            onUpdate={(assetId, payload) => api.updateAsset(selectedProjectId, assetId, payload)}
            onSearch={async (payload) => {
              const result = await api.listGlobalAssets(payload);
              return result;
            }}
            onGetDetail={(assetId) => api.getAsset(selectedProjectId, assetId)}
            onGetGlobalDetail={(assetId) => api.getGlobalAsset(assetId)}
            onGetSlices={(assetId) => api.getAssetSlices(selectedProjectId, assetId)}
            onGetGlobalSlices={(assetId) => api.getGlobalAssetSlices(assetId)}
            onGenerateAsset={(payload) =>
              (async () => {
                try {
                  const pendingTask = {
                    id: 'pending',
                    projectId: selectedProjectId,
                    status: 'queued',
                    progress: 0,
                    stageLabel: assetGenerationStageLabels.queued,
                    createdAt: new Date().toISOString(),
                  };
                  setAssetGenerationTask(pendingTask);
                  setAssetGenerationNow(Date.now());
                  const task = await api.generateAsset(selectedProjectId, payload);
                  const normalizedTask = {
                    ...task,
                    projectId: task.projectId || selectedProjectId,
                    stageLabel: assetGenerationStageLabels[task.status] || task.status,
                  };
                  setAssetGenerationTask(normalizedTask);
                  setGlobalAssets(normalizeAssetsResponse(await api.listGlobalAssets()));
                  setMessage('AI asset generation task created. You can switch pages while it runs.');
                  return normalizedTask;
                } catch (error) {
                  setAssetGenerationTask((prev) => ({
                    ...(prev || { id: 'pending', projectId: selectedProjectId }),
                    status: 'failed',
                    progress: prev?.progress || 0,
                    stageLabel: assetGenerationStageLabels.failed,
                    error: error.message,
                  }));
                  setMessage(error.message);
                  throw error;
                }
              })()
            }
            generationTask={selectedProjectGenerationTask}
            isGenerating={isSelectedProjectGenerating}
            generationElapsedLabel={assetGenerationElapsedLabel}
            onReanalyze={(assetId) =>
              withToast(async () => {
                const analyzed = await api.reanalyzeAsset(selectedProjectId, assetId);
                setMaterials(normalizeAssetsResponse(await api.listAssets(selectedProjectId)));
                return analyzed;
              }, 'Material reanalyzed.')
            }
            onRefresh={() => api.listAssets(selectedProjectId).then((response) => setMaterials(normalizeAssetsResponse(response)))}
          />
        ) : null}

        {activePage === 'script' ? (
          <ScriptPage
            disabled={disabled}
            scriptText={scriptText}
            onScriptChange={setScriptText}
            onScriptSceneUpdate={(index, key, value) =>
              setScriptRecord((prev) => {
                if (!prev) return prev;
                const scenesNext = (prev.scenes || []).map((scene, sceneIndex) =>
                  sceneIndex === index ? { ...scene, [key]: value } : scene
                );
                return { ...prev, scenes: scenesNext };
              })
            }
            onGenerate={(payload) =>
              withToast(async () => {
                const generated = await api.generateScript(selectedProjectId, payload);
                setScriptRecord(generated);
                setScriptText(generated.scriptText || '');
                setStoryboardRecord(null);
                setScenes([]);
                setEditingPlan(null);
              }, 'Script generated.')
            }
            scriptRecord={scriptRecord}
            onRefine={(prompt) =>
              withToast(async () => {
                const refined = await api.refineScript(
                  selectedProjectId,
                  scriptRecord?.scriptId || scriptRecord?.id,
                  prompt
                );
                setScriptRecord(refined);
                setScriptText(refined.scriptText || '');
                setStoryboardRecord(null);
                setScenes([]);
                setEditingPlan(null);
              }, 'Script refined.')
            }
            onSelectVersion={(version) => {
              setScriptText(version.scriptText || '');
              setScriptRecord((prev) =>
                prev ? { ...prev, selectedVersionId: version.versionId, scriptText: version.scriptText || prev.scriptText, scenes: version.scenes || prev.scenes } : prev
              );
            }}
            onSave={() =>
              withToast(async () => {
                const saved = await api.saveScript(selectedProjectId, scriptRecord ? { ...scriptRecord, scriptText } : scriptText);
                setScriptRecord(saved);
                setScriptText(saved.scriptText || scriptText);
              }, 'Script saved.')
            }
            onSceneRegenerate={(sceneId, payload) =>
              withToast(async () => {
                const regenerated = await api.regenerateScriptScene(
                  selectedProjectId,
                  scriptRecord?.id || scriptRecord?.scriptId,
                  sceneId,
                  payload
                );
                setScriptRecord(regenerated);
                setScriptText(regenerated.scriptText || '');
                setStoryboardRecord(null);
                setScenes([]);
                setEditingPlan(null);
              }, 'Script scene regenerated.')
            }
          />
        ) : null}

        {activePage === 'storyboard' ? (
          <StoryboardPage
            disabled={disabled}
            scriptText={scriptText}
            scriptRecord={scriptRecord}
            storyboard={storyboardRecord}
            scenes={scenes}
            materials={materials}
            onGenerate={(payload) =>
              withToast(async () => {
                const generated = await api.generateStoryboard(selectedProjectId, payload);
                setStoryboardRecord(generated);
                setScenes(generated.scenes || []);
                setEditingPlan(null);
              }, 'Storyboard generated.')
            }
            onSceneUpdate={(index, key, value) =>
              setScenes((prev) =>
                prev.map((scene, sceneIndex) =>
                  sceneIndex === index ? { ...scene, [key]: value } : scene
                )
              )
            }
            onSave={() =>
              withToast(async () => {
                const saved = await api.saveStoryboard(selectedProjectId, scenes);
                setStoryboardRecord(saved);
                setEditingPlan(null);
              }, 'Storyboard saved.')
            }
            onSceneSave={(storyboardId, sceneId, payload) =>
              withToast(async () => {
                const saved = await api.updateStoryboardScene(selectedProjectId, storyboardId, sceneId, payload);
                setStoryboardRecord(saved);
                setScenes(saved.scenes || []);
                setEditingPlan(null);
              }, 'Storyboard scene saved.')
            }
            onSceneRegenerate={(storyboardId, sceneId, payload) =>
              withToast(async () => {
                const saved = await api.regenerateStoryboardScene(selectedProjectId, storyboardId, sceneId, payload);
                setStoryboardRecord(saved);
                setScenes(saved.scenes || []);
                setEditingPlan(null);
              }, 'Storyboard scene regenerated.')
            }
          />
        ) : null}

        {activePage === 'workflow' ? (
          <VideoWorkflowPage
            disabled={disabled}
            scenes={scenes}
            materials={materials}
            latestTask={tasks[0]}
            editingPlan={editingPlan}
            resolveMediaUrl={resolveMediaUrl}
            onCreatePlan={(payload) =>
              withToast(async () => {
                const plan = await api.createEditingPlan(selectedProjectId, payload);
                setEditingPlan(plan);
              }, 'Editing plan created.')
            }
            onRenderPlan={(payload) =>
              withToast(async () => {
                await api.renderCreation(selectedProjectId, payload);
                setTasks(await api.listTasks(selectedProjectId));
              }, 'Render task started.')
            }
            onRetryTask={(taskId) =>
              withToast(async () => {
                await api.retryCreationTask(selectedProjectId, taskId);
                setTasks(await api.listTasks(selectedProjectId));
              }, 'Task retried.')
            }
            onCancelTask={(taskId) =>
              withToast(async () => {
                await api.cancelCreationTask(selectedProjectId, taskId);
                setTasks(await api.listTasks(selectedProjectId));
              }, 'Task canceled.')
            }
          />
        ) : null}

        {activePage === 'history' ? (
          <HistoryPage
            disabled={disabled}
            tasks={tasks}
            resolveMediaUrl={resolveMediaUrl}
            onRetry={(taskId) =>
              withToast(async () => {
                await api.retryTask(taskId);
                setTasks(await api.listTasks(selectedProjectId));
              }, 'Task retried.')
            }
          />
        ) : null}
      </main>
    </div>
  );
}

export default App;
