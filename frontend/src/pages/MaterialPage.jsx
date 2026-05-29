import { useEffect, useMemo, useState } from 'react';
import PageShell from '../components/PageShell';
import AssetPreview from '../components/assets/AssetPreview';
import AssetAnalyzeButton from '../components/assets/AssetAnalyzeButton';
import EmptyState from '../components/common/EmptyState';

const uploadTypes = ['', 'image', 'video', 'reference', 'product_image', 'product_video', 'reference_image', 'reference_video', 'logo', 'other'];
const canonicalTypes = ['', 'image', 'video', 'reference', 'ai_generated'];
const sourceTypes = ['', 'upload', 'url', 'ai', 'reference', 'mock'];
const videoAssetTypes = ['product_video', 'reference_video', 'other'];
const generationStageLabels = {
  queued: '正在创建任务',
  generating: '后端生成中',
  downloading: '下载中',
  indexed: '写入素材库',
  ready: '完成',
  failed: '失败',
};

function formatSize(size) {
  const value = Number(size || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function assetId(asset) {
  return asset?.id || asset?.assetId || asset?.materialId;
}


function tagsToText(tags) {
  return Array.isArray(tags) ? tags.join(', ') : String(tags || '');
}

export default function MaterialPage({
  disabled,
  materials,
  resolveMediaUrl,
  onUpload,
  onDelete,
  onUpdate,
  onSearch,
  onGetDetail,
  onGetSlices,
  onGenerateAsset,
  onGetGenerationTask,
  onReanalyze,
  onRefresh,
}) {
  const [uploadForm, setUploadForm] = useState({ title: '', type: '', tags: '', description: '' });
  const [file, setFile] = useState(null);
  const [searchForm, setSearchForm] = useState({ keyword: '', type: '', tag: '' });
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [slices, setSlices] = useState([]);
  const [editForm, setEditForm] = useState({ title: '', description: '', type: 'image', source: 'upload', tags: '', metadata: '{}' });
  const [isUploading, setIsUploading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generationForm, setGenerationForm] = useState({
    generator: 'seed_dance',
    mediaType: 'video',
    assetType: 'product_video',
    prompt: '干净棚拍风格，柔和光线，突出商品质感和高级感。',
    durationSec: 5,
    ratio: '9:16',
  });
  const [generationTask, setGenerationTask] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  const sortedMaterials = useMemo(
    () => [...materials].sort((a, b) => String(b.createdAt || b.uploadedAt).localeCompare(String(a.createdAt || a.uploadedAt))),
    [materials]
  );

  useEffect(() => {
    if (!selectedAsset) return;
    setEditForm({
      title: selectedAsset.title || selectedAsset.name || '',
      description: selectedAsset.description || '',
      type: selectedAsset.type || 'image',
      source: selectedAsset.source || 'upload',
      tags: tagsToText(selectedAsset.tags),
      metadata: JSON.stringify(selectedAsset.metadata || {}, null, 2),
    });
  }, [selectedAsset]);

  useEffect(() => {
    if (!generationTask?.id || generationTask.id === 'pending' || ['ready', 'failed'].includes(generationTask.status)) return undefined;
    const timer = setInterval(async () => {
      try {
        const next = await onGetGenerationTask(generationTask.id);
        setGenerationTask({ ...next, stageLabel: generationStageLabels[next.status] || next.status });
        if (['ready', 'failed'].includes(next.status)) setIsGenerating(false);
        if (next.status === 'ready') await onRefresh();
      } catch (pollError) {
        setError(pollError.message);
        setIsGenerating(false);
      }
    }, 1200);
    return () => clearInterval(timer);
  }, [generationTask, onGetGenerationTask, onRefresh]);

  const selectAsset = async (asset) => {
    setError('');
    try {
      const id = assetId(asset);
      const detail = onGetDetail ? await onGetDetail(id) : asset;
      setSelectedAsset(detail);
      if (onGetSlices) {
        const result = await onGetSlices(id);
        setSlices(result.items || []);
      }
    } catch (detailError) {
      setError(detailError.message);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!file) return;
    setError('');
    setIsUploading(true);
    try {
      await onUpload({
        file,
        title: uploadForm.title,
        type: uploadForm.type,
        tags: uploadForm.tags,
        description: uploadForm.description,
        source: 'upload',
      });
      setFile(null);
      setUploadForm({ title: '', type: '', tags: '', description: '' });
      event.target.reset();
      await onRefresh();
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setIsUploading(false);
    }
  };

  const runSearch = async () => {
    setError('');
    setIsSearching(true);
    try {
      await onSearch({ keyword: searchForm.keyword, type: searchForm.type, tag: searchForm.tag });
    } catch (searchError) {
      setError(searchError.message);
    } finally {
      setIsSearching(false);
    }
  };

  const resetSearch = async () => {
    setSearchForm({ keyword: '', type: '', tag: '' });
    setError('');
    await onRefresh();
  };

  const saveSelectedAsset = async () => {
    if (!selectedAsset) return;
    setError('');
    setIsSaving(true);
    try {
      const updated = await onUpdate(assetId(selectedAsset), {
        title: editForm.title,
        description: editForm.description,
        type: editForm.type,
        source: editForm.source,
        tags: editForm.tags,
        metadata: editForm.metadata,
      });
      setSelectedAsset(updated);
      await onRefresh();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const analyzeSelectedAsset = async (asset) => {
    const target = asset || selectedAsset;
    if (!target) return;
    setError('');
    setIsAnalyzing(true);
    try {
      const analyzed = await onReanalyze(assetId(target));
      setSelectedAsset(analyzed);
      const result = await onGetSlices(assetId(analyzed));
      setSlices(result.items || []);
      await onRefresh();
    } catch (analyzeError) {
      setError(analyzeError.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateAsset = async () => {
    setError('');
    setIsGenerating(true);
    setGenerationTask({ id: 'pending', status: 'queued', progress: 0, stageLabel: generationStageLabels.queued });
    try {
      const task = await onGenerateAsset({
        generator: 'seed_dance',
        mediaType: 'video',
        assetType: generationForm.assetType,
        prompt: generationForm.prompt,
        ratio: generationForm.ratio,
        durationSec: Number(generationForm.durationSec || 5),
      });
      if (!task) throw new Error('Asset generation did not return a task. Please check the backend response.');
      setGenerationTask({ ...task, stageLabel: generationStageLabels[task.status] || task.status });
    } catch (generateError) {
      setError(generateError.message);
      setGenerationTask((prev) => ({
        ...(prev || { id: 'pending' }),
        status: 'failed',
        progress: prev?.progress || 20,
        stageLabel: generationStageLabels.failed,
        error: generateError.message,
      }));
      setIsGenerating(false);
    }
  };

  const deleteAsset = async (asset) => {
    const id = assetId(asset);
    if (!window.confirm(`Delete asset "${asset.title || asset.name || asset.originalName}"?`)) return;
    setError('');
    try {
      await onDelete(id);
      if (selectedAsset && assetId(selectedAsset) === id) {
        setSelectedAsset(null);
        setSlices([]);
      }
      await onRefresh();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  return (
    <PageShell title="Asset library" description="Upload, inspect, search, edit, analyze, and delete reusable product assets.">
      {error ? <div className="message error-message">{error}</div> : null}

      <form className="card form" onSubmit={submit}>
        <h3>Upload asset</h3>
        <label>
          Title
          <input value={uploadForm.title} onChange={(event) => setUploadForm((prev) => ({ ...prev, title: event.target.value }))} disabled={disabled || isUploading} placeholder="Hero product image" />
        </label>
        <label>
          Type
          <select value={uploadForm.type} onChange={(event) => setUploadForm((prev) => ({ ...prev, type: event.target.value }))} disabled={disabled || isUploading}>
            {uploadTypes.map((type) => <option key={type || 'auto'} value={type}>{type || 'Auto detect'}</option>)}
          </select>
        </label>
        <label>
          Tags
          <input value={uploadForm.tags} onChange={(event) => setUploadForm((prev) => ({ ...prev, tags: event.target.value }))} disabled={disabled || isUploading} placeholder="hero, product, detail" />
        </label>
        <label>
          Description
          <input value={uploadForm.description} onChange={(event) => setUploadForm((prev) => ({ ...prev, description: event.target.value }))} disabled={disabled || isUploading} placeholder="Optional asset note" />
        </label>
        <label>
          File
          <input type="file" accept="image/*,video/*" onChange={(event) => setFile(event.target.files?.[0] || null)} disabled={disabled || isUploading} required />
        </label>
        <button type="submit" disabled={disabled || isUploading}>{isUploading ? 'Uploading...' : 'Upload asset'}</button>
      </form>

      <section className="card form">
        <h3>Search assets</h3>
        <div className="form-grid">
          <label>
            Keyword
            <input value={searchForm.keyword} onChange={(event) => setSearchForm((prev) => ({ ...prev, keyword: event.target.value }))} disabled={disabled || isSearching} />
          </label>
          <label>
            Type
            <select value={searchForm.type} onChange={(event) => setSearchForm((prev) => ({ ...prev, type: event.target.value }))} disabled={disabled || isSearching}>
              {canonicalTypes.map((type) => <option key={type || 'all'} value={type}>{type || 'All'}</option>)}
            </select>
          </label>
          <label>
            Tag
            <input value={searchForm.tag} onChange={(event) => setSearchForm((prev) => ({ ...prev, tag: event.target.value }))} disabled={disabled || isSearching} />
          </label>
        </div>
        <div className="button-row">
          <button type="button" onClick={runSearch} disabled={disabled || isSearching}>{isSearching ? 'Searching...' : 'Search'}</button>
          <button type="button" onClick={resetSearch} disabled={disabled || isSearching}>Reset</button>
        </div>
      </section>

      <section className="card form">
        <h3>AI generated video asset</h3>
        <div className="form-grid">
          <label>Generation model<input value="seed_dance · 文生视频" disabled /></label>
          <label>
            Asset type
            <select value={generationForm.assetType} onChange={(event) => setGenerationForm((prev) => ({ ...prev, assetType: event.target.value }))} disabled={disabled || isGenerating}>
              {videoAssetTypes.map((assetType) => <option key={assetType} value={assetType}>{assetType}</option>)}
            </select>
          </label>
          <label>
            Duration
            <input type="number" min="1" max="15" value={generationForm.durationSec} onChange={(event) => setGenerationForm((prev) => ({ ...prev, durationSec: event.target.value }))} disabled={disabled || isGenerating} />
          </label>
          <label>
            Ratio
            <select value={generationForm.ratio} onChange={(event) => setGenerationForm((prev) => ({ ...prev, ratio: event.target.value }))} disabled={disabled || isGenerating}>
              <option value="9:16">9:16</option>
              <option value="16:9">16:9</option>
              <option value="1:1">1:1</option>
              <option value="4:3">4:3</option>
            </select>
          </label>
        </div>
        <label>
          Prompt
          <textarea rows={4} value={generationForm.prompt} onChange={(event) => setGenerationForm((prev) => ({ ...prev, prompt: event.target.value }))} disabled={disabled || isGenerating} />
        </label>
        <button type="button" disabled={disabled || isGenerating || !generationForm.prompt.trim()} onClick={generateAsset}>{isGenerating ? 'Generating...' : 'Generate asset'}</button>
        {generationTask ? (
          <div className="task-summary">
            <strong>{generationTask.id}</strong><span>{generationTask.stageLabel || generationTask.status}</span><span>{generationTask.progress}%</span>
            <div className="inline-progress"><span style={{ width: `${generationTask.progress || 0}%` }} /></div>
            {generationTask.error ? <small>{generationTask.error}</small> : null}
          </div>
        ) : null}
      </section>

      <div className="asset-library">
        {sortedMaterials.map((asset) => {
          const previewUrl = resolveMediaUrl(asset.fileUrl || asset.url || asset.thumbnailUrl);
          return (
            <article className="card asset-card" key={assetId(asset)}>
              <AssetPreview asset={asset} previewUrl={previewUrl} onOpen={() => selectAsset(asset)} />
              <div className="asset-body">
                <div className="asset-header">
                  <div>
                    <h3>{asset.title || asset.name || asset.originalName}</h3>
                    <p>{asset.type} · {asset.assetType || '-'} · {formatSize(asset.size)} · {asset.source || 'upload'}</p>
                    <p>analysis: {asset.analysisStatus || 'pending'} · provider: {asset.provider || '-'}</p>
                  </div>
                  <div className="button-row">
                    <button type="button" onClick={() => selectAsset(asset)} disabled={disabled}>Detail</button>
                    <AssetAnalyzeButton disabled={disabled} isAnalyzing={isAnalyzing} onAnalyze={() => analyzeSelectedAsset(asset)} />
                    <button type="button" onClick={() => deleteAsset(asset)} disabled={disabled}>Delete</button>
                  </div>
                </div>
                <p>{asset.analysis?.summary || asset.description || 'No analysis yet.'}</p>
                <div className="tag-row">{(asset.tags || asset.analysis?.tags || []).map((tag) => <span key={tag}>{tag}</span>)}</div>
              </div>
            </article>
          );
        })}
        {sortedMaterials.length === 0 ? <EmptyState>No assets yet. Upload an image or video to start the asset library.</EmptyState> : null}
      </div>

      {selectedAsset ? (
        <section className="card form">
          <h3>Asset detail</h3>
          <p><strong>ID:</strong> {assetId(selectedAsset)}</p>
          <p><strong>File:</strong> {selectedAsset.fileUrl || selectedAsset.url || '-'}</p>
          <div className="form-grid">
            <label>Title<input value={editForm.title} onChange={(event) => setEditForm((prev) => ({ ...prev, title: event.target.value }))} disabled={disabled || isSaving} /></label>
            <label>Description<input value={editForm.description} onChange={(event) => setEditForm((prev) => ({ ...prev, description: event.target.value }))} disabled={disabled || isSaving} /></label>
            <label>
              Type
              <select value={editForm.type} onChange={(event) => setEditForm((prev) => ({ ...prev, type: event.target.value }))} disabled={disabled || isSaving}>
                {canonicalTypes.filter(Boolean).map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label>
              Source
              <select value={editForm.source} onChange={(event) => setEditForm((prev) => ({ ...prev, source: event.target.value }))} disabled={disabled || isSaving}>
                {sourceTypes.filter(Boolean).map((source) => <option key={source} value={source}>{source}</option>)}
              </select>
            </label>
          </div>
          <label>Tags<input value={editForm.tags} onChange={(event) => setEditForm((prev) => ({ ...prev, tags: event.target.value }))} disabled={disabled || isSaving} /></label>
          <label>Metadata JSON<textarea rows={4} value={editForm.metadata} onChange={(event) => setEditForm((prev) => ({ ...prev, metadata: event.target.value }))} disabled={disabled || isSaving} /></label>
          <div className="button-row">
            <button type="button" onClick={saveSelectedAsset} disabled={disabled || isSaving}>{isSaving ? 'Saving...' : 'Save asset'}</button>
            <AssetAnalyzeButton disabled={disabled} isAnalyzing={isAnalyzing} onAnalyze={() => analyzeSelectedAsset(selectedAsset)} label="Mock analyze" />
            <button type="button" onClick={() => deleteAsset(selectedAsset)} disabled={disabled}>Delete</button>
          </div>
          <h4>Analysis</h4>
          <pre>{JSON.stringify(selectedAsset.analysis || {}, null, 2)}</pre>
          <h4>Slices ({slices.length})</h4>
          {slices.length ? slices.map((slice) => <p key={slice.id}>{slice.startTime}s-{slice.endTime}s · {slice.visualDescription}</p>) : <p>No slices yet.</p>}
        </section>
      ) : null}
    </PageShell>
  );
}
