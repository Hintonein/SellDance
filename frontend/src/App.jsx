import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import { api } from './services/api';
import ProjectPage from './pages/ProjectPage';
import MaterialPage from './pages/MaterialPage';
import ScriptPage from './pages/ScriptPage';
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
  { key: 'projects', label: 'Project' },
  { key: 'materials', label: 'Assets' },
  { key: 'script', label: 'Script' },
  { key: 'workflow', label: 'Creation' },
  { key: 'history', label: 'History' },
];

const assetGenerationStageLabels = {
  queued: 'Queued',
  generating: 'Generating',
  downloading: 'Downloading',
  indexed: 'Indexing assets',
  ready: 'Completed',
  failed: 'Failed',
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

function normalizePath(pathname = window.location.pathname) {
  const path = pathname.replace(/\/+$/, '') || '/projects';
  return path === '/' ? '/projects' : path;
}

function parseRoute(pathname = window.location.pathname) {
  const parts = normalizePath(pathname).split('/').filter(Boolean);
  if (parts[0] !== 'projects') return { page: 'projects', projectId: '', section: '' };
  if (!parts[1]) return { page: 'projects', projectId: '', section: '' };
  const projectId = parts[1];
  const page = parts[2] || 'projects';
  return {
    page: page === 'assets' ? 'materials' : page === 'creation' ? 'workflow' : page,
    projectId,
    section: parts[3] || '',
    detailId: parts[4] || '',
    rawPage: page,
  };
}

function projectPath(projectId, page = 'projects', section = '', detailId = '') {
  if (!projectId) return '/projects';
  const pagePath = page === 'materials' ? 'assets' : page === 'workflow' ? 'creation' : page;
  return ['/projects', projectId, pagePath === 'projects' ? '' : pagePath, section, detailId]
    .filter(Boolean)
    .join('/');
}

function TaskDetailPage({ task, onBack, onRetry, disabled, resolveMediaUrl }) {
  if (!task) {
    return (
      <div className="page-shell">
        <div className="detail-page-header">
          <button type="button" onClick={onBack}>Back to History</button>
          <h2>Task not found</h2>
        </div>
      </div>
    );
  }
  return (
    <div className="page-shell">
      <div className="detail-page-header">
        <button type="button" onClick={onBack}>Back to History</button>
        <div>
          <h2>Task detail</h2>
          <p>{task.id}</p>
        </div>
      </div>
      <section className="card section-card">
        <div className="section-heading">
          <div>
            <h3>{task.status}</h3>
            <p>{task.currentStep || task.stage || 'No current step.'}</p>
          </div>
          {task.status === 'failed' ? <button type="button" onClick={() => onRetry(task.id)} disabled={disabled}>Retry</button> : null}
        </div>
        <div className="inline-progress"><span style={{ width: `${task.progress || 0}%` }} /></div>
        <dl className="detail-list">
          <div><dt>Progress</dt><dd>{task.progress || 0}%</dd></div>
          <div><dt>Error</dt><dd>{task.errorMessage || task.error?.message || '-'}</dd></div>
          <div><dt>Created</dt><dd>{task.createdAt || '-'}</dd></div>
          <div><dt>Updated</dt><dd>{task.updatedAt || '-'}</dd></div>
          <div><dt>Export</dt><dd>{task.videoUrl ? <a href={resolveMediaUrl(task.videoUrl)} target="_blank" rel="noreferrer">Open MP4</a> : task.exportFile || '-'}</dd></div>
        </dl>
      </section>
    </div>
  );
}

function LoginPage({ onLogin, statusError = '' }) {
  const [arkApiKey, setArkApiKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onLogin(arkApiKey);
      setArkApiKey('');
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-panel" onSubmit={submit}>
        <div>
          <p className="login-kicker">SellDance Studio</p>
          <h1>Connect Ark</h1>
          <p className="login-copy">
            Enter the Ark API key for this server. The key is written to the backend .env file and used by Seed 2.0 and SeedDance calls.
          </p>
        </div>
        <label>
          <span>Ark API key</span>
          <input
            type="password"
            value={arkApiKey}
            onChange={(event) => setArkApiKey(event.target.value)}
            placeholder="Paste your Ark API key"
            autoComplete="off"
            required
          />
        </label>
        {statusError ? <div className="login-error">{statusError}</div> : null}
        {error ? <div className="login-error">{error}</div> : null}
        <button type="submit" disabled={submitting || !arkApiKey.trim()}>
          {submitting ? 'Connecting...' : 'Enter Studio'}
        </button>
        <small>The key is not stored in browser localStorage.</small>
      </form>
    </div>
  );
}

function App() {
  const [route, setRoute] = useState(() => parseRoute());
  const [authStatus, setAuthStatus] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
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
  const [deletedTasks, setDeletedTasks] = useState([]);
  const [message, setMessage] = useState('');
  const [statusPanelOpen, setStatusPanelOpen] = useState(false);
  const [dismissedRenderTaskIds, setDismissedRenderTaskIds] = useState([]);
  const [dismissedCrawlerTaskIds, setDismissedCrawlerTaskIds] = useState([]);
  const [dismissedInspirationTaskIds, setDismissedInspirationTaskIds] = useState([]);
  const [dismissedScriptTaskIds, setDismissedScriptTaskIds] = useState([]);
  const [dismissedCreationWorkflowTaskIds, setDismissedCreationWorkflowTaskIds] = useState([]);
  const [dismissedAssetAnalysisTaskIds, setDismissedAssetAnalysisTaskIds] = useState([]);
  const [assetGenerationTask, setAssetGenerationTask] = useState(null);
  const [assetAnalysisTasks, setAssetAnalysisTasks] = useState([]);
  const [assetGenerationNow, setAssetGenerationNow] = useState(Date.now());
  const [inspirationVideos, setInspirationVideos] = useState([]);
  const [inspirationTemplates, setInspirationTemplates] = useState([]);
  const [crawlerTask, setCrawlerTask] = useState(null);
  const [inspirationWorkflowTask, setInspirationWorkflowTask] = useState(null);
  const [scriptWorkflowTask, setScriptWorkflowTask] = useState(null);
  const [creationWorkflowTask, setCreationWorkflowTask] = useState(null);

  const activePage = route.page || 'projects';
  const routeProjectId = route.projectId || '';

  const navigate = useCallback((path) => {
    const nextPath = normalizePath(path);
    if (nextPath !== normalizePath(window.location.pathname)) {
      window.history.pushState({}, '', nextPath);
    }
    setRoute(parseRoute(nextPath));
  }, []);

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId),
    [projects, selectedProjectId]
  );

  useEffect(() => {
    let cancelled = false;
    api.getAuthStatus()
      .then((status) => {
        if (!cancelled) setAuthStatus(status);
      })
      .catch((error) => {
        if (!cancelled) setAuthError(error.message);
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleLogin = useCallback(async (arkApiKey) => {
    const status = await api.loginWithArkKey(arkApiKey);
    setAuthStatus(status);
    setAuthError('');
    return status;
  }, []);

  const handleUpdateArkKey = useCallback(async (arkApiKey) => {
    const status = await api.loginWithArkKey(arkApiKey);
    setAuthStatus(status);
    setAuthError('');
    setMessage('Ark API key updated.');
    return status;
  }, []);

  const clearProjectScopedState = useCallback(() => {
    setMaterials([]);
    setScriptRecord(null);
    setScriptText('');
    setStoryboardRecord(null);
    setScenes([]);
    setEditingPlan(null);
    setTasks([]);
    setDeletedTasks([]);
    setInspirationVideos([]);
    setInspirationTemplates([]);
    setCrawlerTask(null);
    setInspirationWorkflowTask(null);
    setScriptWorkflowTask(null);
    setCreationWorkflowTask(null);
    setAssetGenerationTask(null);
    setAssetAnalysisTasks([]);
  }, []);

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

  useEffect(() => {
    if (routeProjectId && routeProjectId !== selectedProjectId) {
      clearProjectScopedState();
      setSelectedProjectId(routeProjectId);
    }
  }, [clearProjectScopedState, routeProjectId, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) return;
    const current = parseRoute();
    if (!current.projectId && normalizePath(window.location.pathname) === '/projects') return;
    if (!current.projectId) navigate(projectPath(selectedProjectId));
  }, [navigate, selectedProjectId]);

  const loadProjectData = useCallback(async (projectId) => {
    const [
      materialsData,
      globalAssetsData,
      scriptData,
      storyboardData,
      taskData,
      deletedTaskData,
      inspirationVideoData,
      inspirationTemplateData,
      crawlerTaskData,
      workflowTaskData,
      scriptWorkflowTaskData,
      creationWorkflowTaskData,
      assetAnalysisTaskData,
    ] = await Promise.all([
      api.listAssets(projectId),
      api.listGlobalAssets(),
      api.getScript(projectId),
      api.getStoryboard(projectId),
      api.listTasks(projectId),
      api.listDeletedTasks(projectId),
      api.listInspirationVideos(projectId),
      api.listInspirationTemplates(projectId),
      api.listCrawlerTasks(projectId),
      api.listInspirationWorkflowTasks(projectId),
      api.listScriptWorkflowTasks(projectId),
      api.listCreationWorkflowTasks(projectId),
      api.listAssetAnalysisTasks(projectId),
    ]);

    return {
      projectId,
      materials: normalizeAssetsResponse(materialsData),
      globalAssets: normalizeAssetsResponse(globalAssetsData),
      scriptData,
      storyboardData,
      taskData,
      deletedTaskData,
      inspirationVideoData,
      inspirationTemplateData,
      crawlerTaskData,
      workflowTaskData,
      scriptWorkflowTaskData,
      creationWorkflowTaskData,
      assetAnalysisTaskData,
    };
  }, []);

  const applyProjectData = useCallback((data) => {
    setMaterials(data.materials);
    setGlobalAssets(data.globalAssets);
    const scriptData = data.scriptData || {};
    const storyboardData = data.storyboardData || {};
    setScriptRecord(scriptData.scriptId ? scriptData : null);
    setScriptText(scriptData.scriptText || '');
    setStoryboardRecord(storyboardData.storyboardId ? storyboardData : null);
    setScenes(storyboardData.scenes || []);
    setEditingPlan(null);
    setTasks(data.taskData || []);
    setDeletedTasks(data.deletedTaskData || []);
    setInspirationVideos(data.inspirationVideoData || []);
    setInspirationTemplates(data.inspirationTemplateData || []);
    setCrawlerTask(data.crawlerTaskData?.[0] || null);
    setInspirationWorkflowTask(data.workflowTaskData?.[0] || null);
    setScriptWorkflowTask(data.scriptWorkflowTaskData?.[0] || null);
    setCreationWorkflowTask(data.creationWorkflowTaskData?.[0] || null);
    setAssetAnalysisTasks(data.assetAnalysisTaskData || []);
  }, []);

  useEffect(() => {
    if (authStatus?.arkApiKeyConfigured) loadProjects();
  }, [authStatus?.arkApiKeyConfigured, loadProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      clearProjectScopedState();
      return undefined;
    }
    clearProjectScopedState();
    let cancelled = false;
    const projectId = selectedProjectId;
    withToast(async () => {
      const data = await loadProjectData(projectId);
      if (!cancelled && projectId === selectedProjectId) applyProjectData(data);
      return data;
    }, 'Project data synced.');
    return () => { cancelled = true; };
  }, [applyProjectData, clearProjectScopedState, loadProjectData, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId || !crawlerTask?.id || ['succeeded', 'partial', 'failed', 'timeout', 'cancelled'].includes(crawlerTask.status)) return undefined;
    const poll = async () => {
      try {
        const next = await api.getCrawlerTask(selectedProjectId, crawlerTask.id);
        setCrawlerTask(next);
        if (['succeeded', 'partial'].includes(next.status)) {
          setInspirationVideos(await api.listInspirationVideos(selectedProjectId));
          setMessage(`MediaCrawler search completed. Imported ${next.resultCount || 0} videos.`);
        }
        if (['failed', 'timeout', 'cancelled'].includes(next.status)) {
          setMessage(next.error?.message || 'MediaCrawler search failed.');
        }
      } catch (error) {
        setMessage(error.message);
      }
    };
    poll();
    const timer = setInterval(poll, 1600);
    return () => clearInterval(timer);
  }, [selectedProjectId, crawlerTask?.id, crawlerTask?.status]);

  useEffect(() => {
    if (!selectedProjectId || !inspirationVideos.some((video) => video.analysisStatus === 'processing')) return undefined;
    const poll = async () => {
      try {
        setInspirationVideos(await api.listInspirationVideos(selectedProjectId));
      } catch {
        // silent polling
      }
    };
    const timer = setInterval(poll, 1800);
    return () => clearInterval(timer);
  }, [selectedProjectId, inspirationVideos]);

  useEffect(() => {
    if (!inspirationWorkflowTask?.id?.startsWith('local_analysis_')) return;
    if (inspirationVideos.some((video) => video.analysisStatus === 'processing')) return;
    setInspirationWorkflowTask((prev) => prev?.id?.startsWith('local_analysis_') ? {
      ...prev,
      status: 'completed',
      stage: 'completed',
      progress: 100,
      completed: 1,
    } : prev);
  }, [inspirationVideos, inspirationWorkflowTask?.id]);

  useEffect(() => {
    if (!selectedProjectId || !inspirationWorkflowTask?.id || inspirationWorkflowTask.id.startsWith('local_') || ['completed', 'failed'].includes(inspirationWorkflowTask.status)) return undefined;
    const poll = async () => {
      try {
        const next = await api.getInspirationWorkflowTask(selectedProjectId, inspirationWorkflowTask.id);
        setInspirationWorkflowTask(next);
        setInspirationVideos(await api.listInspirationVideos(selectedProjectId));
        if (next.status === 'completed') {
          setInspirationTemplates(await api.listInspirationTemplates(selectedProjectId));
          setMessage('Inspiration analysis and template generation completed.');
        }
        if (next.status === 'failed') {
          setMessage(next.error?.message || 'Inspiration workflow failed.');
        }
      } catch (error) {
        setMessage(error.message);
      }
    };
    poll();
    const timer = setInterval(poll, 1800);
    return () => clearInterval(timer);
  }, [selectedProjectId, inspirationWorkflowTask?.id, inspirationWorkflowTask?.status]);

  useEffect(() => {
    if (!selectedProjectId || !scriptWorkflowTask?.id || ['completed', 'partial', 'failed'].includes(scriptWorkflowTask.status)) return undefined;
    const poll = async () => {
      try {
        const next = await api.getScriptWorkflowTask(selectedProjectId, scriptWorkflowTask.id);
        setScriptWorkflowTask(next);
        if (['completed', 'partial'].includes(next.status)) {
          const [currentScript, currentStoryboard] = await Promise.all([
            api.getScript(selectedProjectId),
            api.getStoryboard(selectedProjectId),
          ]);
          setScriptRecord(currentScript?.scriptId || currentScript?.id ? currentScript : null);
          setScriptText(currentScript?.scriptText || '');
          setStoryboardRecord(currentStoryboard?.storyboardId || currentStoryboard?.id ? currentStoryboard : null);
          setScenes(currentStoryboard?.scenes || []);
          setEditingPlan(next.result?.editingPlan || null);
          setMessage(`${next.label || 'Script workflow'} completed.`);
        }
        if (next.status === 'failed') {
          setMessage(next.error?.message || 'Script workflow failed.');
        }
      } catch (error) {
        setMessage(error.message);
      }
    };
    poll();
    const timer = setInterval(poll, 1800);
    return () => clearInterval(timer);
  }, [selectedProjectId, scriptWorkflowTask?.id, scriptWorkflowTask?.status]);

  useEffect(() => {
    if (!selectedProjectId || !creationWorkflowTask?.id || ['completed', 'failed'].includes(creationWorkflowTask.status)) return undefined;
    const poll = async () => {
      try {
        const next = await api.getCreationWorkflowTask(selectedProjectId, creationWorkflowTask.id);
        setCreationWorkflowTask(next);
        if (['completed', 'failed'].includes(next.status)) {
          const [currentScript, currentStoryboard, renderTasks] = await Promise.all([
            api.getScript(selectedProjectId),
            api.getStoryboard(selectedProjectId),
            api.listTasks(selectedProjectId),
          ]);
          setScriptRecord(currentScript?.scriptId || currentScript?.id ? currentScript : null);
          setScriptText(currentScript?.scriptText || '');
          setStoryboardRecord(currentStoryboard?.storyboardId || currentStoryboard?.id ? currentStoryboard : null);
          setScenes(currentStoryboard?.scenes || []);
          setTasks(renderTasks);
          if (next.result?.editingPlan) setEditingPlan(next.result.editingPlan);
          if (next.status === 'completed') setMessage(next.type === 'smart_editing' ? 'Smart editing plan completed.' : 'One-click video completed.');
          if (next.status === 'failed') setMessage(next.error?.message || 'Creation workflow failed.');
        }
      } catch (error) {
        setMessage(error.message);
      }
    };
    poll();
    const timer = setInterval(poll, 2000);
    return () => clearInterval(timer);
  }, [creationWorkflowTask?.id, creationWorkflowTask?.status, selectedProjectId]);

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
    if (!selectedProjectId) return undefined;
    const activeAnalysisTasks = assetAnalysisTasks.filter((task) => ['queued', 'running'].includes(task.status));
    if (!activeAnalysisTasks.length) return undefined;
    const poll = async () => {
      try {
        const [nextTasks, nextMaterials, nextGlobalAssets] = await Promise.all([
          api.listAssetAnalysisTasks(selectedProjectId),
          api.listAssets(selectedProjectId),
          api.listGlobalAssets(),
        ]);
        setAssetAnalysisTasks(nextTasks);
        setMaterials(normalizeAssetsResponse(nextMaterials));
        setGlobalAssets(normalizeAssetsResponse(nextGlobalAssets));
        const completed = nextTasks.filter((task) => ['completed', 'failed'].includes(task.status) && activeAnalysisTasks.some((active) => active.id === task.id));
        if (completed.length) {
          const failed = completed.filter((task) => task.status === 'failed').length;
          setMessage(failed ? `${completed.length} asset analysis task(s) finished, ${failed} failed.` : `${completed.length} asset analysis task(s) completed.`);
        }
      } catch (error) {
        setMessage(`Asset analysis polling failed: ${error.message}`);
      }
    };
    poll();
    const timer = setInterval(poll, 1500);
    return () => clearInterval(timer);
  }, [assetAnalysisTasks, selectedProjectId]);

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
  const visibleCrawlerTask = crawlerTask?.id && !dismissedCrawlerTaskIds.includes(crawlerTask.id) ? crawlerTask : null;
  const visibleInspirationTask = inspirationWorkflowTask?.id && !dismissedInspirationTaskIds.includes(inspirationWorkflowTask.id) ? inspirationWorkflowTask : null;
  const visibleScriptTask = scriptWorkflowTask?.id && !dismissedScriptTaskIds.includes(scriptWorkflowTask.id) ? scriptWorkflowTask : null;
  const visibleCreationWorkflowTask = creationWorkflowTask?.id && !dismissedCreationWorkflowTaskIds.includes(creationWorkflowTask.id) ? creationWorkflowTask : null;
  const visibleAssetAnalysisTasks = assetAnalysisTasks
    .filter((task) => task.id && !dismissedAssetAnalysisTaskIds.includes(task.id))
    .slice(0, 5);

  if (authLoading) {
    return (
      <div className="login-screen">
        <div className="login-panel">
          <p className="login-kicker">SellDance Studio</p>
          <h1>Loading</h1>
          <p className="login-copy">Checking backend configuration...</p>
        </div>
      </div>
    );
  }

  if (!authStatus?.arkApiKeyConfigured) {
    return (
      <LoginPage
        onLogin={handleLogin}
        statusError={authError}
      />
    );
  }

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
              onClick={() => navigate(projectPath(selectedProjectId, page.key))}
              disabled={page.key !== 'projects' && !selectedProjectId}
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
            ) : null}
            {visibleAssetAnalysisTasks.map((task) => (
              <div className="global-task" key={task.id}>
                <div className="global-task-header">
                  <strong>Asset analysis</strong>
                  <span>{task.stage || task.status}</span>
                </div>
                <div className="inline-progress"><span style={{ width: `${task.progress || 0}%` }} /></div>
                <div className="global-task-meta">
                  <span>{task.assetTitle || task.assetId}</span>
                  <span>{task.provider || 'seed2'}</span>
                </div>
                {task.logs?.length ? <small>{task.logs.at(-1).message}</small> : null}
                {task.error ? <small>{task.error.message || task.error}</small> : null}
                {['completed', 'failed', 'cancelled'].includes(task.status) ? (
                  <button type="button" onClick={() => setDismissedAssetAnalysisTaskIds((prev) => [...prev, task.id])}>Dismiss</button>
                ) : null}
              </div>
            ))}
            {visibleStatusTask ? (
              <div className="global-task">
                <div className="global-task-header">
                  <strong>Render task</strong>
                  <span>{visibleStatusTask.status}</span>
                </div>
                <div className="inline-progress"><span style={{ width: `${visibleStatusTask.progress || 0}%` }} /></div>
                <div className="global-task-meta">
                  <span>{visibleStatusTask.progress || 0}%</span>
                  {visibleStatusTask.audioMixSummary ? <span>{visibleStatusTask.audioMixSummary}</span> : null}
                  {visibleStatusTask.backgroundMusicMixMode ? <span>{String(visibleStatusTask.backgroundMusicMixMode).replace(/_/g, ' ')}</span> : null}
                  <button type="button" onClick={() => navigate(projectPath(selectedProjectId, 'history'))}>History</button>
                </div>
                {['completed', 'failed', 'canceled', 'cancelled'].includes(visibleStatusTask.status) ? (
                  <button type="button" onClick={() => setDismissedRenderTaskIds((prev) => [...prev, visibleStatusTask.id || visibleStatusTask.taskId])}>Close</button>
                ) : null}
              </div>
            ) : null}
            {visibleCrawlerTask ? (
              <div className="global-task">
                <div className="global-task-header">
                  <strong>Public video search</strong>
                  <span>{visibleCrawlerTask.status}</span>
                </div>
                <div className="inline-progress"><span style={{ width: `${visibleCrawlerTask.progress || (['succeeded', 'partial'].includes(visibleCrawlerTask.status) ? 100 : 0)}%` }} /></div>
                <div className="global-task-meta">
                  <span>{visibleCrawlerTask.resultCount || 0} imported</span>
                  <span>{visibleCrawlerTask.rankingFallback ? 'Fallback ranking' : 'Ranked'}</span>
                </div>
                {['running', 'queued'].includes(visibleCrawlerTask.status) ? (
                  <button type="button" onClick={() => api.cancelCrawlerTask(selectedProjectId, visibleCrawlerTask.id).then(setCrawlerTask).catch((error) => setMessage(error.message))}>Stop search</button>
                ) : null}
                {['succeeded', 'partial', 'failed', 'timeout', 'cancelled'].includes(visibleCrawlerTask.status) ? (
                  <button type="button" onClick={() => setDismissedCrawlerTaskIds((prev) => [...prev, visibleCrawlerTask.id])}>Dismiss</button>
                ) : null}
              </div>
            ) : null}
            {visibleInspirationTask ? (
              <div className="global-task">
                <div className="global-task-header">
                  <strong>Inspiration workflow</strong>
                  <span>{visibleInspirationTask.stage || visibleInspirationTask.status}</span>
                </div>
                <div className="inline-progress"><span style={{ width: `${visibleInspirationTask.progress || 0}%` }} /></div>
                <div className="global-task-meta">
                  <span>{visibleInspirationTask.completed || 0}/{visibleInspirationTask.total || 0}</span>
                  <span>{visibleInspirationTask.failed || 0} failed</span>
                </div>
                {visibleInspirationTask.currentVideoIds?.length ? (
                  <small>{visibleInspirationTask.currentVideoIds.join(', ')}</small>
                ) : visibleInspirationTask.currentVideoId ? <small>{visibleInspirationTask.currentVideoId}</small> : null}
                {visibleInspirationTask.error ? <small>{visibleInspirationTask.error.message}</small> : null}
                {['completed', 'failed'].includes(visibleInspirationTask.status) ? (
                  <button type="button" onClick={() => setDismissedInspirationTaskIds((prev) => [...prev, visibleInspirationTask.id])}>Dismiss</button>
                ) : null}
              </div>
            ) : null}
            {visibleScriptTask ? (
              <div className="global-task">
                <div className="global-task-header">
                  <strong>{visibleScriptTask.label || 'Script workflow'}</strong>
                  <span>{visibleScriptTask.stage || visibleScriptTask.status}</span>
                </div>
                <div className="inline-progress"><span style={{ width: `${visibleScriptTask.progress || 0}%` }} /></div>
                {visibleScriptTask.error ? <small>{visibleScriptTask.error.message}</small> : null}
                {visibleScriptTask.logs?.length ? <small>{visibleScriptTask.logs.at(-1).message}</small> : null}
                {visibleScriptTask.totalScenes ? (
                  <div className="global-task-meta">
                    <span>{visibleScriptTask.completedScenes || 0}/{visibleScriptTask.totalScenes} scenes</span>
                    <span>{visibleScriptTask.runningScenes || 0} running</span>
                    <span>{visibleScriptTask.failedScenes || 0} failed</span>
                  </div>
                ) : null}
                {visibleScriptTask.planningScenes ? (
                  <div className="global-task-meta">
                    <span>{visibleScriptTask.plannedScenes || 0}/{visibleScriptTask.planningScenes} planned</span>
                    <span>{visibleScriptTask.planningProvider || 'seed2'}</span>
                    <span>{visibleScriptTask.lowConfidenceScenes?.length || 0} low confidence</span>
                  </div>
                ) : null}
                {visibleScriptTask.currentSceneIds?.length ? <small>Current: {visibleScriptTask.currentSceneIds.join(', ')}</small> : null}
                {['completed', 'partial', 'failed'].includes(visibleScriptTask.status) ? (
                  <button type="button" onClick={() => setDismissedScriptTaskIds((prev) => [...prev, visibleScriptTask.id])}>Dismiss</button>
                ) : null}
              </div>
            ) : null}
            {visibleCreationWorkflowTask ? (
              <div className="global-task">
                <div className="global-task-header">
                  <strong>{visibleCreationWorkflowTask.label || 'Creation workflow'}</strong>
                  <span>{visibleCreationWorkflowTask.stage || visibleCreationWorkflowTask.status}</span>
                </div>
                <div className="inline-progress"><span style={{ width: `${visibleCreationWorkflowTask.progress || 0}%` }} /></div>
                <div className="global-task-meta">
                  <span>{visibleCreationWorkflowTask.progress || 0}%</span>
                  <span>{visibleCreationWorkflowTask.renderTaskId ? `Render ${visibleCreationWorkflowTask.renderTaskId}` : visibleCreationWorkflowTask.type}</span>
                </div>
                {visibleCreationWorkflowTask.error ? <small>{visibleCreationWorkflowTask.error.message}</small> : null}
                {visibleCreationWorkflowTask.logs?.length ? <small>{visibleCreationWorkflowTask.logs.at(-1).message}</small> : null}
                {['completed', 'failed'].includes(visibleCreationWorkflowTask.status) ? (
                  <button type="button" onClick={() => setDismissedCreationWorkflowTaskIds((prev) => [...prev, visibleCreationWorkflowTask.id])}>Dismiss</button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      <main>
        {message ? <div className="toast-message">{message}</div> : null}
        {activePage === 'projects' ? (
          <ProjectPage
            projects={projects}
            selectedProjectId={selectedProjectId}
            authStatus={authStatus}
            onUpdateArkKey={handleUpdateArkKey}
            onSelect={(projectId) => {
              setSelectedProjectId(projectId);
              navigate(projectPath(projectId));
            }}
            onCreate={(payload) =>
              withToast(async () => {
                const created = await api.createProject(payload);
                await loadProjects();
                setSelectedProjectId(created.id);
                navigate(projectPath(created.id));
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
            analysisTasks={assetAnalysisTasks}
            isGenerating={isSelectedProjectGenerating}
            generationElapsedLabel={assetGenerationElapsedLabel}
            section={route.section || 'project'}
            onNavigateSection={(section) => navigate(projectPath(selectedProjectId, 'materials', section))}
            assetRouteId={activePage === 'materials' && route.section === 'detail' ? route.detailId : ''}
            onOpenAsset={(assetId) => navigate(projectPath(selectedProjectId, 'materials', 'detail', assetId))}
            onBackToAssets={() => navigate(projectPath(selectedProjectId, 'materials', 'project'))}
            onReanalyze={(assetId) =>
              withToast(async () => {
                const task = await api.reanalyzeAsset(selectedProjectId, assetId);
                setAssetAnalysisTasks((prev) => [task, ...prev.filter((item) => item.id !== task.id)]);
                setMaterials(normalizeAssetsResponse(await api.listAssets(selectedProjectId)));
                setMessage('Asset analysis task created. You can start other analyses while it runs.');
                return task;
              }, 'Asset analysis task created.')
            }
            onRefresh={() => api.listAssets(selectedProjectId).then((response) => setMaterials(normalizeAssetsResponse(response)))}
          />
        ) : null}

        {activePage === 'script' ? (
          <ScriptPage
            disabled={disabled}
            section={route.section || 'overview'}
            detailId={route.detailId || ''}
            onNavigateSection={(section) => navigate(projectPath(selectedProjectId, 'script', section))}
            onNavigateStoryboardScene={(sceneId) => navigate(projectPath(selectedProjectId, 'script', 'storyboard', sceneId))}
            onBackToStoryboard={() => navigate(projectPath(selectedProjectId, 'script', 'storyboard'))}
            scriptText={scriptText}
            storyboardRecord={storyboardRecord}
            storyboardScenes={scenes}
            materials={materials}
            resolveMediaUrl={resolveMediaUrl}
            scriptWorkflowTask={scriptWorkflowTask}
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
            onStoryboardSceneUpdate={(index, key, value) => {
              setScenes((prev) => prev.map((scene, sceneIndex) => (sceneIndex === index ? { ...scene, [key]: value } : scene)));
              setStoryboardRecord((prev) => {
                if (!prev) return prev;
                const scenesNext = (prev.scenes || []).map((scene, sceneIndex) => (sceneIndex === index ? { ...scene, [key]: value } : scene));
                return { ...prev, scenes: scenesNext };
              });
            }}
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
                const task = await api.createScriptWorkflowTask(selectedProjectId, {
                  type: 'refine_script',
                  scriptId: scriptRecord?.scriptId || scriptRecord?.id,
                  prompt,
                });
                setScriptWorkflowTask(task);
              }, 'Script refinement started.')
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
            onDeleteVersion={(versionId) =>
              withToast(async () => {
                const saved = await api.deleteScriptVersion(selectedProjectId, scriptRecord?.scriptId || scriptRecord?.id, versionId);
                setScriptRecord(saved);
                setScriptText(saved.scriptText || '');
              }, 'Script version deleted.')
            }
            onGenerateStoryboard={(storyboardInput = {}) =>
              withToast(async () => {
                const task = await api.createScriptWorkflowTask(selectedProjectId, {
                  type: 'generate_storyboard',
                  scriptId: scriptRecord?.scriptId || scriptRecord?.id,
                  scriptVersionId: storyboardInput.scriptVersionId || scriptRecord?.selectedVersionId,
                  scriptText: storyboardInput.scriptText || scriptText,
                  scenes: storyboardInput.scenes || scriptRecord?.scenes || [],
                  aspectRatio: '9:16',
                  provider: 'seedance_1_5_pro_video',
                  sceneConcurrency: 3,
                  createEditingPlan: true,
                });
                setStoryboardRecord(null);
                setScenes([]);
                setEditingPlan(null);
                setScriptWorkflowTask(task);
              }, 'Storyboard generation started.')
            }
            onDeleteStoryboard={() =>
              withToast(async () => {
                if (!storyboardRecord?.storyboardId && !storyboardRecord?.id) return;
                await api.deleteStoryboard(selectedProjectId, storyboardRecord.storyboardId || storyboardRecord.id);
                setStoryboardRecord(null);
                setScenes([]);
                setEditingPlan(null);
              }, 'Storyboard deleted.')
            }
            onSaveStoryboardScene={(sceneId, payload) =>
              withToast(async () => {
                const storyboardId = storyboardRecord?.storyboardId || storyboardRecord?.id;
                const saved = await api.updateStoryboardScene(selectedProjectId, storyboardId, sceneId, payload);
                setStoryboardRecord(saved);
                setScenes(saved.scenes || []);
                setEditingPlan(null);
              }, 'Storyboard scene saved.')
            }
            onRegenerateStoryboardScene={(sceneId, payload) =>
              withToast(async () => {
                const storyboardId = storyboardRecord?.storyboardId || storyboardRecord?.id;
                const saved = await api.regenerateStoryboardScene(selectedProjectId, storyboardId, sceneId, payload);
                setStoryboardRecord(saved);
                setScenes(saved.scenes || []);
                setEditingPlan(null);
              }, 'Storyboard scene regenerated.')
            }
            onDeleteStoryboardScene={(sceneId) =>
              withToast(async () => {
                const storyboardId = storyboardRecord?.storyboardId || storyboardRecord?.id;
                const saved = await api.deleteStoryboardScene(selectedProjectId, storyboardId, sceneId);
                setStoryboardRecord(saved);
                setScenes(saved.scenes || []);
                setEditingPlan(null);
                navigate(projectPath(selectedProjectId, 'script', 'storyboard'));
              }, 'Storyboard scene deleted.')
            }
            onReorderStoryboardScenes={(sceneIds) =>
              withToast(async () => {
                const storyboardId = storyboardRecord?.storyboardId || storyboardRecord?.id;
                const saved = await api.reorderStoryboardScenes(selectedProjectId, storyboardId, sceneIds);
                setStoryboardRecord(saved);
                setScenes(saved.scenes || []);
                setEditingPlan(null);
              }, 'Storyboard reordered.')
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
            inspirationProps={{
              videos: inspirationVideos,
              templates: inspirationTemplates,
              crawlerTask,
              onRefresh: () =>
                withToast(async () => {
                  await api.clearInspirationVideos(selectedProjectId);
                  setInspirationVideos([]);
                }, 'Inspiration video library cleared.'),
              onCancelSearch: () =>
                withToast(async () => {
                  if (!crawlerTask?.id) return;
                  const next = await api.cancelCrawlerTask(selectedProjectId, crawlerTask.id);
                  setCrawlerTask(next);
                  setInspirationVideos(await api.listInspirationVideos(selectedProjectId));
                }, 'Search cancellation requested.'),
              onSearch: (payload) =>
                withToast(async () => {
                  const result = await api.searchInspirationVideos(selectedProjectId, payload);
                  setCrawlerTask(result.task || { id: result.taskId, status: result.status });
                }, 'MediaCrawler search started.'),
              onAnalyze: (videoId) =>
                withToast(async () => {
                  setInspirationWorkflowTask({
                    id: `local_analysis_${videoId}`,
                    status: 'running',
                    stage: 'video_analysis',
                    progress: 15,
                    total: 1,
                    completed: 0,
                    failed: 0,
                    currentVideoId: videoId,
                  });
                  await api.analyzeInspirationVideo(selectedProjectId, videoId);
                  setInspirationVideos(await api.listInspirationVideos(selectedProjectId));
                  setInspirationWorkflowTask((prev) => prev?.id === `local_analysis_${videoId}` ? {
                    ...prev,
                    status: 'running',
                    stage: 'video_analysis',
                    progress: 45,
                  } : prev);
                }, 'Video analysis started.'),
              onAnalyzeAndTemplate: (payload) =>
                withToast(async () => {
                  const task = await api.analyzeAndTemplateInspirationVideos(selectedProjectId, payload);
                  setInspirationWorkflowTask(task);
                }, 'Deep analysis and template workflow started.'),
              onDeleteTemplate: (templateId) =>
                withToast(async () => {
                  await api.deleteInspirationTemplate(selectedProjectId, templateId);
                  setInspirationTemplates(await api.listInspirationTemplates(selectedProjectId));
                }, 'Inspiration template deleted.'),
              onGenerateScript: (payload) =>
                (async () => {
                  try {
                    const task = await api.createScriptWorkflowTask(selectedProjectId, {
                      type: 'generate_script',
                      ...payload,
                    });
                    setScriptWorkflowTask(task);
                    setMessage('Script generation started.');
                    return task;
                  } catch (error) {
                    setMessage(error.message);
                    throw error;
                  }
                })(),
            }}
          />
        ) : null}

        {activePage === 'workflow' ? (
          <VideoWorkflowPage
            disabled={disabled}
            scenes={scenes}
            materials={materials}
            scriptRecord={scriptRecord}
            storyboardRecord={storyboardRecord}
            latestTask={tasks[0]}
            workflowTask={creationWorkflowTask}
            editingPlan={editingPlan}
            resolveMediaUrl={resolveMediaUrl}
            onSmartEdit={(payload) =>
              withToast(async () => {
                const task = await api.createSmartEditingPlan(selectedProjectId, payload);
                setCreationWorkflowTask(task);
              }, 'Smart editing workflow started.')
            }
            onOneClick={(payload) =>
              withToast(async () => {
                const task = await api.createOneClickVideo(selectedProjectId, payload);
                setCreationWorkflowTask(task);
              }, 'One-click video workflow started.')
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
          route.section ? (
            <TaskDetailPage
              disabled={disabled}
              task={tasks.find((task) => task.id === route.section || task.taskId === route.section)}
              resolveMediaUrl={resolveMediaUrl}
              onBack={() => navigate(projectPath(selectedProjectId, 'history'))}
              onRetry={(taskId) =>
                withToast(async () => {
                  await api.retryTask(selectedProjectId, taskId);
                  setTasks(await api.listTasks(selectedProjectId));
                }, 'Task retried.')
              }
            />
          ) : (
            <HistoryPage
              disabled={disabled}
              tasks={tasks}
              deletedTasks={deletedTasks}
              resolveMediaUrl={resolveMediaUrl}
              onOpenTask={(taskId) => navigate(projectPath(selectedProjectId, 'history', taskId))}
              onRetry={(taskId) =>
                withToast(async () => {
                  await api.retryTask(selectedProjectId, taskId);
                  setTasks(await api.listTasks(selectedProjectId));
                }, 'Task retried.')
              }
              onDeleteTask={(taskId) =>
                withToast(async () => {
                  await api.deleteTask(selectedProjectId, taskId);
                  const [nextTasks, nextDeletedTasks] = await Promise.all([
                    api.listTasks(selectedProjectId),
                    api.listDeletedTasks(selectedProjectId),
                  ]);
                  setTasks(nextTasks);
                  setDeletedTasks(nextDeletedTasks);
                }, 'Task moved to trash.')
              }
              onRestoreTask={(taskId) =>
                withToast(async () => {
                  await api.restoreTask(selectedProjectId, taskId);
                  const [nextTasks, nextDeletedTasks] = await Promise.all([
                    api.listTasks(selectedProjectId),
                    api.listDeletedTasks(selectedProjectId),
                  ]);
                  setTasks(nextTasks);
                  setDeletedTasks(nextDeletedTasks);
                }, 'Task restored.')
              }
              onDeleteTaskPermanent={(taskId) =>
                withToast(async () => {
                  await api.deleteTaskPermanent(selectedProjectId, taskId);
                  setDeletedTasks(await api.listDeletedTasks(selectedProjectId));
                }, 'Task permanently deleted.')
              }
            />
          )
        ) : null}
      </main>
    </div>
  );
}

export default App;
