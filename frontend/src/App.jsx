import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import { api } from './services/api';
import ProjectPage from './pages/ProjectPage';
import MaterialPage from './pages/MaterialPage';
import ScriptPage from './pages/ScriptPage';
import StoryboardPage from './pages/StoryboardPage';
import VideoWorkflowPage from './pages/VideoWorkflowPage';
import HistoryPage from './pages/HistoryPage';

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
      api.listMaterials(projectId),
      api.getScript(projectId),
      api.getStoryboard(projectId),
      api.listTasks(projectId),
    ]);

    setMaterials(materialsData);
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
        <p>Mock e-commerce video generation starter</p>
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
          />
        ) : null}

        {activePage === 'materials' ? (
          <MaterialPage
            disabled={disabled}
            materials={materials}
            onUpload={(payload) =>
              withToast(async () => {
                await api.uploadMaterial(selectedProjectId, payload);
                setMaterials(await api.listMaterials(selectedProjectId));
              }, 'Material uploaded.')
            }
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
                setScriptText(generated.scriptText || '');
              }, 'Script generated.')
            }
            onSave={() =>
              withToast(async () => {
                await api.saveScript(selectedProjectId, scriptText);
              }, 'Script saved.')
            }
          />
        ) : null}

        {activePage === 'storyboard' ? (
          <StoryboardPage
            disabled={disabled}
            scriptText={scriptText}
            scenes={scenes}
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
            latestTask={tasks[0]}
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
