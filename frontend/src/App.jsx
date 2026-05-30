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
  { key: 'projects', label: 'Project' },
  { key: 'materials', label: 'Materials' },
  { key: 'script', label: 'Script' },
  { key: 'storyboard', label: 'Storyboard' },
  { key: 'workflow', label: 'Video Preview' },
  { key: 'history', label: 'History' },
];

function App() {
  const [activePage, setActivePage] = useState('projects');
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [materials, setMaterials] = useState([]);
  const [scriptRecord, setScriptRecord] = useState(null);
  const [scriptText, setScriptText] = useState('');
  const [scenes, setScenes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [message, setMessage] = useState('');

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId),
    [projects, selectedProjectId]
  );

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
    const [materialsData, scriptData, storyboardData, taskData] = await Promise.all([
      api.listAssets(projectId),
      api.getScript(projectId),
      api.getStoryboard(projectId),
      api.listTasks(projectId),
    ]);

    setMaterials(normalizeAssetsResponse(materialsData));
    setScriptRecord(scriptData.scriptId ? scriptData : null);
    setScriptText(scriptData.scriptText || '');
    setScenes(storyboardData.scenes || []);
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

  const disabled = !selectedProjectId;

  return (
    <div className="layout">
      <aside>
        <h1>SellDance AIGC Studio</h1>
        <p>E-commerce video generation with local FFmpeg rendering</p>
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
        <div className="project-chip">Current: {selectedProject?.name || 'No project selected'}</div>
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
            resolveMediaUrl={resolveMediaUrl}
            onUpload={(payload) =>
              withToast(async () => {
                await api.uploadAsset(selectedProjectId, payload);
                setMaterials(normalizeAssetsResponse(await api.listAssets(selectedProjectId)));
              }, 'Material uploaded.')
            }
            onDelete={(assetId) =>
              withToast(async () => {
                await api.deleteAsset(selectedProjectId, assetId);
                setMaterials(normalizeAssetsResponse(await api.listAssets(selectedProjectId)));
              }, 'Material deleted.')
            }
            onUpdate={(assetId, payload) => api.updateAsset(selectedProjectId, assetId, payload)}
            onSearch={async (payload) => {
              const result = await api.searchAssets(selectedProjectId, payload);
              setMaterials(normalizeAssetsResponse(result));
              return result;
            }}
            onGetDetail={(assetId) => api.getAsset(selectedProjectId, assetId)}
            onGetSlices={(assetId) => api.getAssetSlices(selectedProjectId, assetId)}
            onGenerateAsset={(payload) =>
              (async () => {
                try {
                const task = await api.generateAsset(selectedProjectId, payload);
                setMaterials(normalizeAssetsResponse(await api.listAssets(selectedProjectId)));
                setMessage('Asset generation task created.');
                return task;
                } catch (error) {
                  setMessage(error.message);
                  throw error;
                }
              })()
            }
            onGetGenerationTask={(taskId) => api.getAssetGenerationTask(selectedProjectId, taskId)}
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
            onGenerate={(payload) =>
              withToast(async () => {
                const generated = await api.generateScript(selectedProjectId, payload);
                setScriptRecord(generated);
                setScriptText(generated.scriptText || '');
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
              }, 'Script refined.')
            }
            onSelectVersion={(version) => {
              setScriptText(version.scriptText || '');
              setScriptRecord((prev) =>
                prev ? { ...prev, selectedVersionId: version.versionId, scriptText: version.scriptText || prev.scriptText } : prev
              );
            }}
            onSave={() =>
              withToast(async () => {
                const saved = await api.saveScript(selectedProjectId, scriptText);
                setScriptRecord(saved);
              }, 'Script saved.')
            }
          />
        ) : null}

        {activePage === 'storyboard' ? (
          <StoryboardPage
            disabled={disabled}
            scriptText={scriptText}
            scenes={scenes}
            materials={materials}
            onGenerate={(text) =>
              withToast(async () => {
                const generated = await api.generateStoryboard(selectedProjectId, text);
                setScenes(generated.scenes || []);
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
                await api.saveStoryboard(selectedProjectId, scenes);
              }, 'Storyboard saved.')
            }
          />
        ) : null}

        {activePage === 'workflow' ? (
          <VideoWorkflowPage
            disabled={disabled}
            scenes={scenes}
            materials={materials}
            latestTask={tasks[0]}
            resolveMediaUrl={resolveMediaUrl}
            onCreateTask={(payload) =>
              withToast(async () => {
                await api.createTask(selectedProjectId, payload);
                setTasks(await api.listTasks(selectedProjectId));
              }, 'Generation task started.')
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
