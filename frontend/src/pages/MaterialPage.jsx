import { useCallback, useEffect, useMemo, useState } from 'react';
import PageShell from '../components/PageShell';
import AssetPreview from '../components/assets/AssetPreview';
import AssetAnalyzeButton from '../components/assets/AssetAnalyzeButton';
import EmptyState from '../components/common/EmptyState';
import MetadataViewer from '../components/common/MetadataViewer';
import StatusBadge from '../components/common/StatusBadge';
import TagList from '../components/common/TagList';

const uploadTypes = ['', 'image', 'video', 'audio', 'reference', 'product_image', 'product_video', 'reference_image', 'reference_video', 'logo', 'other'];
const canonicalTypes = ['', 'image', 'video', 'audio', 'reference', 'ai_generated'];
const sourceTypes = ['', 'upload', 'url', 'ai', 'reference', 'mock'];
const videoAssetTypes = ['product_video', 'reference_video', 'other'];

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

function videoSummary(asset) {
  const video = asset?.metadata?.video;
  if (!video) return '';
  const duration = video.duration ? `${Number(video.duration).toFixed(1)}s` : '-';
  const resolution = video.width && video.height ? `${video.width}x${video.height}` : '-';
  return `${duration} · ${resolution} · ${video.codec || '-'}`;
}
function isVideoAsset(asset) {
  return asset?.mediaType === 'video' || String(asset?.mimeType || '').startsWith('video/') || String(asset?.type || '').includes('video');
}
function assetPreviewUrl(asset) {
  if (!asset) return '';
  if (isVideoAsset(asset)) {
    return asset.previewUrl || asset.browserPreviewUrl || asset.metadata?.video?.previewUrl || asset.fileUrl || asset.url || asset.thumbnailUrl || '';
  }
  return asset.thumbnailUrl || asset.fileUrl || asset.url || '';
}

function providerLabel(asset) {
  return asset?.analysis?.provider || asset?.provider || asset?.source || 'local';
}

function assetDisplayName(asset) {
  return asset?.title || asset?.name || asset?.originalName || assetId(asset) || 'Untitled asset';
}

function normalizeAssetsResponse(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.items)) return response.items.map((item) => item.asset || item);
  return [];
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read reference image.'));
    reader.readAsDataURL(file);
  });
}

export default function MaterialPage({
  disabled,
  materials,
  globalAssets = [],
  resolveMediaUrl,
  onUpload,
  onDelete,
  onUpdate,
  onLinkAsset,
  onSearch,
  onGetDetail,
  onGetGlobalDetail,
  onGetSlices,
  onGetGlobalSlices,
  onGenerateAsset,
  onDeleteGlobalAsset,
  onReanalyze,
  onRefresh,
  generationTask,
  analysisTasks = [],
  isGenerating,
  generationElapsedLabel,
  section = 'project',
  onNavigateSection,
  assetRouteId,
  onOpenAsset,
  onBackToAssets,
}) {
  const [uploadForm, setUploadForm] = useState({ title: '', type: '', tags: '', description: '', audioKind: 'background_music' });
  const [file, setFile] = useState(null);
  const [searchForm, setSearchForm] = useState({ keyword: '', type: '', tag: '', mediaType: '', analysisStatus: '' });
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [slices, setSlices] = useState([]);
  const [editForm, setEditForm] = useState({ title: '', description: '', type: 'image', source: 'upload', tags: '', metadata: '{}' });
  const [isUploading, setIsUploading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [analyzingAssetId, setAnalyzingAssetId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [generationForm, setGenerationForm] = useState({
    generator: 'seed_dance',
    mediaType: 'video',
    assetType: 'product_video',
    prompt: '干净棚拍风格，柔和光线，突出商品质感和高级感。',
    durationSec: 5,
    ratio: '9:16',
    referenceMode: 'none',
    referenceAssetId: '',
  });
  const [firstFrameFile, setFirstFrameFile] = useState(null);
  const [lastFrameFile, setLastFrameFile] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [isAssetDetailCollapsed, setIsAssetDetailCollapsed] = useState(false);
  const [generationPanelCollapsed, setGenerationPanelCollapsed] = useState(false);
  const [generationPanelClosed, setGenerationPanelClosed] = useState(false);
  const [globalCategory, setGlobalCategory] = useState('');
  const [error, setError] = useState('');
  const activeAssetAnalysisIds = useMemo(
    () => new Set((analysisTasks || []).filter((task) => ['queued', 'running'].includes(task.status)).map((task) => task.assetId)),
    [analysisTasks]
  );

  const sortedMaterials = useMemo(
    () => [...materials].sort((a, b) => String(b.createdAt || b.uploadedAt).localeCompare(String(a.createdAt || a.uploadedAt))),
    [materials]
  );
  const projectAssetIds = useMemo(() => new Set(sortedMaterials.map((asset) => assetId(asset))), [sortedMaterials]);
  const sortedGlobalAssets = useMemo(
    () => [...globalAssets].sort((a, b) => String(b.createdAt || b.uploadedAt).localeCompare(String(a.createdAt || a.uploadedAt))),
    [globalAssets]
  );
  const globalStats = useMemo(() => {
    const imageCount = sortedGlobalAssets.filter((asset) => asset.mediaType === 'image' || asset.type === 'image').length;
    const videoCount = sortedGlobalAssets.filter((asset) => asset.mediaType === 'video' || asset.type === 'video').length;
    const aiCount = sortedGlobalAssets.filter((asset) => asset.source === 'ai' || asset.source === 'ai_generated' || asset.provider).length;
    return { imageCount, videoCount, aiCount, linkedCount: projectAssetIds.size, total: sortedGlobalAssets.length };
  }, [projectAssetIds.size, sortedGlobalAssets]);
  const projectImageAssets = useMemo(
    () => sortedMaterials.filter((asset) => asset.mediaType === 'image' || asset.type === 'image' || String(asset.mimeType || '').startsWith('image/')),
    [sortedMaterials]
  );
  const filteredGlobalAssets = useMemo(() => {
    if (globalCategory === 'images') return sortedGlobalAssets.filter((asset) => asset.mediaType === 'image' || asset.type === 'image');
    if (globalCategory === 'videos') return sortedGlobalAssets.filter((asset) => asset.mediaType === 'video' || asset.type === 'video');
    if (globalCategory === 'ai') return sortedGlobalAssets.filter((asset) => asset.source === 'ai' || asset.source === 'ai_generated' || asset.provider);
    if (globalCategory === 'linked') return sortedGlobalAssets.filter((asset) => projectAssetIds.has(assetId(asset)));
    if (globalCategory === 'total') return sortedGlobalAssets;
    return [];
  }, [globalCategory, projectAssetIds, sortedGlobalAssets]);
  const globalCategoryLabel = {
    total: 'All global assets',
    images: 'Global images',
    videos: 'Global videos',
    ai: 'AI generated assets',
    linked: 'Assets in current project',
  }[globalCategory] || '';
  const generatedAsset = useMemo(
    () => sortedMaterials.find((asset) => assetId(asset) === generationTask?.resultAssetId),
    [generationTask?.resultAssetId, sortedMaterials]
  );
  const selectedAssetInProject = selectedAsset ? projectAssetIds.has(assetId(selectedAsset)) : false;
  const activeSection = assetRouteId ? 'detail' : (section || 'project');
  const uploadingAudio = file?.type?.startsWith('audio/') || uploadForm.type === 'audio';

  const selectAsset = useCallback(async (asset) => {
    setError('');
    try {
      const id = assetId(asset);
      const isLinkedToProject = projectAssetIds.has(id);
      const getDetail = isLinkedToProject ? onGetDetail : (onGetGlobalDetail || onGetDetail);
      const getSlices = isLinkedToProject ? onGetSlices : (onGetGlobalSlices || onGetSlices);
      const detail = getDetail ? await getDetail(id) : asset;
      setSelectedAsset(detail);
      setIsAssetDetailCollapsed(false);
      if (getSlices) {
        const result = await getSlices(id);
        setSlices(result.items || []);
      }
    } catch (detailError) {
      setError(detailError.message);
    }
  }, [onGetDetail, onGetGlobalDetail, onGetGlobalSlices, onGetSlices, projectAssetIds]);

  useEffect(() => {
    if (!assetRouteId) return;
    if (selectedAsset && assetId(selectedAsset) === assetRouteId) return;
    const target = [...sortedMaterials, ...sortedGlobalAssets].find((asset) => assetId(asset) === assetRouteId);
    if (target) selectAsset(target);
  }, [assetRouteId, selectAsset, selectedAsset, sortedGlobalAssets, sortedMaterials]);

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
    setGenerationPanelClosed(false);
    setGenerationPanelCollapsed(false);
  }, [generationTask?.id]);

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
        audioKind: uploadingAudio ? uploadForm.audioKind : undefined,
        backgroundMusicMixMode: uploadingAudio && uploadForm.audioKind === 'full_audio_voiceover' ? 'replace_source' : uploadingAudio ? 'mix_under_source' : undefined,
        backgroundMusicVolume: uploadingAudio && uploadForm.audioKind === 'full_audio_voiceover' ? 1 : uploadingAudio ? 0.16 : undefined,
      });
      setFile(null);
      setUploadForm({ title: '', type: '', tags: '', description: '', audioKind: 'background_music' });
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
      const result = await onSearch({ keyword: searchForm.keyword, type: searchForm.type, tag: searchForm.tag, mediaType: searchForm.mediaType, analysisStatus: searchForm.analysisStatus });
      setSearchResults(normalizeAssetsResponse(result));
    } catch (searchError) {
      setError(searchError.message);
    } finally {
      setIsSearching(false);
    }
  };

  const addSearchResultToProject = async (asset) => {
    if (!onLinkAsset) return;
    setError('');
    try {
      await onLinkAsset(assetId(asset));
      await onRefresh();
    } catch (linkError) {
      setError(linkError.message);
    }
  };

  const resetSearch = async () => {
    setSearchForm({ keyword: '', type: '', tag: '', mediaType: '', analysisStatus: '' });
    setSearchResults([]);
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
    const id = assetId(target);
    setError('');
    setAnalyzingAssetId(id);
    try {
      await onReanalyze(id);
      if (selectedAsset && assetId(selectedAsset) === id) {
        setSelectedAsset((prev) => prev ? { ...prev, analysisStatus: 'processing', analysisError: null } : prev);
      }
      await onRefresh();
    } catch (analyzeError) {
      setError(analyzeError.message);
    } finally {
      setAnalyzingAssetId('');
    }
  };

  const generateAsset = async () => {
    setError('');
    try {
      const referenceImages = [];
      if (['upload_first', 'upload_first_last'].includes(generationForm.referenceMode)) {
        if (!firstFrameFile) throw new Error('Please upload a first-frame reference image.');
        referenceImages.push({ role: 'first_frame', dataUrl: await fileToDataUrl(firstFrameFile), name: firstFrameFile.name, mimeType: firstFrameFile.type });
      }
      if (['upload_last', 'upload_first_last'].includes(generationForm.referenceMode)) {
        if (!lastFrameFile) throw new Error('Please upload a last-frame reference image.');
        referenceImages.push({ role: 'last_frame', dataUrl: await fileToDataUrl(lastFrameFile), name: lastFrameFile.name, mimeType: lastFrameFile.type });
      }
      if (generationForm.referenceMode === 'project_asset') {
        if (!generationForm.referenceAssetId) throw new Error('Please choose a project image asset as the reference media.');
        referenceImages.push({ role: 'first_frame', assetId: generationForm.referenceAssetId });
      }
      const task = await onGenerateAsset({
        generator: 'seed_dance',
        mediaType: 'video',
        assetType: generationForm.assetType,
        prompt: generationForm.prompt,
        ratio: generationForm.ratio,
        durationSec: Number(generationForm.durationSec || 5),
        referenceImages,
      });
      if (!task) throw new Error('Asset generation did not return a task. Please check the backend response.');
    } catch (generateError) {
      setError(generateError.message);
    }
  };

  const deleteAsset = async (asset) => {
    const id = assetId(asset);
    if (!window.confirm(`Remove "${assetDisplayName(asset)}" from this project?`)) return;
    const deleteGlobal = window.confirm('Also delete this asset from the global asset library and remove its local file? Choose Cancel to keep it in the shared library.');
    setError('');
    try {
      await onDelete(id, { deleteGlobal });
      if (selectedAsset && assetId(selectedAsset) === id) {
        setSelectedAsset(null);
        setSlices([]);
      }
      await onRefresh();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  const closeAssetDetail = () => {
    setSelectedAsset(null);
    setSlices([]);
    if (assetRouteId && onBackToAssets) onBackToAssets();
  };

  const deleteGlobalAsset = async (asset) => {
    if (!onDeleteGlobalAsset) return;
    if (!window.confirm(`Delete "${assetDisplayName(asset)}" from the global library? This removes links from all projects.`)) return;
    setError('');
    try {
      await onDeleteGlobalAsset(assetId(asset));
      if (selectedAsset && assetId(selectedAsset) === assetId(asset)) closeAssetDetail();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  const renderSelectedAssetDetailPanel = () => {
    if (!selectedAsset) return null;
    const selectedId = assetId(selectedAsset);
    const isCurrentAssetAnalyzing = analyzingAssetId === selectedId || activeAssetAnalysisIds.has(selectedId);
    return (
      <div className="asset-detail-panel inline-detail">
        <div className="section-heading">
          <div>
            <h3 title={assetDisplayName(selectedAsset)}>Asset detail</h3>
            <p>{assetDisplayName(selectedAsset)}</p>
          </div>
          <div className="button-row">
            <StatusBadge status={selectedAsset.analysisStatus || 'pending'} />
            {selectedAssetInProject ? null : <StatusBadge status="pending">Library only</StatusBadge>}
            <button type="button" onClick={() => setIsAssetDetailCollapsed((prev) => !prev)}>
              {isAssetDetailCollapsed ? 'Expand detail' : 'Collapse detail'}
            </button>
            <button type="button" onClick={closeAssetDetail}>Close</button>
          </div>
        </div>
        {!isAssetDetailCollapsed ? (
          <>
            <div className="asset-detail-hero">
              <AssetPreview asset={selectedAsset} previewUrl={resolveMediaUrl(assetPreviewUrl(selectedAsset))} />
              <div className="asset-detail-main">
                <dl className="detail-list">
                  <div><dt>ID</dt><dd>{selectedId}</dd></div>
                  <div><dt>File</dt><dd>{selectedAsset.fileUrl || selectedAsset.url || '-'}</dd></div>
                  <div><dt>Preview</dt><dd>{selectedAsset.previewUrl || selectedAsset.browserPreviewUrl || selectedAsset.metadata?.video?.previewUrl || '-'}</dd></div>
                  <div><dt>Provider</dt><dd>{providerLabel(selectedAsset)}</dd></div>
                  <div><dt>Video</dt><dd>{videoSummary(selectedAsset) || '-'}</dd></div>
                </dl>
                <TagList tags={selectedAsset.tags || selectedAsset.analysis?.tags || []} />
              </div>
            </div>
            <div className="form-grid">
              <label>Title<input value={editForm.title} onChange={(event) => setEditForm((prev) => ({ ...prev, title: event.target.value }))} disabled={disabled || isSaving || !selectedAssetInProject} /></label>
              <label>Description<input value={editForm.description} onChange={(event) => setEditForm((prev) => ({ ...prev, description: event.target.value }))} disabled={disabled || isSaving || !selectedAssetInProject} /></label>
              <label>
                Type
                <select value={editForm.type} onChange={(event) => setEditForm((prev) => ({ ...prev, type: event.target.value }))} disabled={disabled || isSaving || !selectedAssetInProject}>
                  {canonicalTypes.filter(Boolean).map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label>
                Source
                <select value={editForm.source} onChange={(event) => setEditForm((prev) => ({ ...prev, source: event.target.value }))} disabled={disabled || isSaving || !selectedAssetInProject}>
                  {sourceTypes.filter(Boolean).map((source) => <option key={source} value={source}>{source}</option>)}
                </select>
              </label>
            </div>
            <label>Tags<input value={editForm.tags} onChange={(event) => setEditForm((prev) => ({ ...prev, tags: event.target.value }))} disabled={disabled || isSaving || !selectedAssetInProject} /></label>
            <label>Metadata JSON<textarea rows={4} value={editForm.metadata} onChange={(event) => setEditForm((prev) => ({ ...prev, metadata: event.target.value }))} disabled={disabled || isSaving || !selectedAssetInProject} /></label>
            <div className="button-row">
              {selectedAssetInProject ? (
                <>
                  <button type="button" onClick={saveSelectedAsset} disabled={disabled || isSaving}>{isSaving ? 'Saving...' : 'Save asset'}</button>
                  <AssetAnalyzeButton disabled={disabled} isAnalyzing={isCurrentAssetAnalyzing} onAnalyze={() => analyzeSelectedAsset(selectedAsset)} label="Reanalyze" />
                  <button type="button" onClick={() => deleteAsset(selectedAsset)} disabled={disabled}>Delete</button>
                </>
              ) : (
                <button type="button" onClick={() => addSearchResultToProject(selectedAsset)} disabled={disabled || !onLinkAsset}>
                  Add to project
                </button>
              )}
            </div>
            <h4>Analysis</h4>
            {selectedAsset.analysisError ? (
              <div className="message error-message">
                {selectedAsset.analysisError.message || selectedAsset.analysisError}
              </div>
            ) : null}
            <MetadataViewer value={selectedAsset.analysis || {}} />
            <h4>Slices ({slices.length})</h4>
            {slices.length ? slices.map((slice) => (
              <div className="slice-row" key={slice.id}>
                {slice.thumbnailUrl ? <img src={resolveMediaUrl(slice.thumbnailUrl)} alt={slice.id} /> : null}
                <div className="slice-copy">
                  <p>{slice.startTime}s-{slice.endTime}s · {slice.duration}s · {slice.visualDescription}</p>
                  <TagList tags={slice.tags || []} limit={10} />
                </div>
              </div>
            )) : <p>No slices yet.</p>}
          </>
        ) : null}
      </div>
    );
  };

  return (
    <PageShell title="Assets" description="Upload, choose from the shared library, or generate AI video assets for the current project.">
      {error ? <div className="message error-message">{error}</div> : null}

      <div className="section-tabs">
        {[
          ['project', 'Project Assets'],
          ['upload', 'Upload Asset'],
          ['search', 'Search Assets'],
          ['generate', 'AI Generated Asset'],
          ['library', 'Global Asset Library'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={activeSection === key ? 'active' : ''}
            onClick={() => onNavigateSection?.(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeSection === 'detail' ? (
        <section className="card section-card">
          <div className="detail-page-header">
            <button type="button" className="back-button" onClick={onBackToAssets}>Back to Project Assets</button>
            <div>
              <h3>Asset detail</h3>
              <p>{selectedAsset ? assetDisplayName(selectedAsset) : assetRouteId}</p>
            </div>
          </div>
          {selectedAsset ? renderSelectedAssetDetailPanel() : <EmptyState>Loading asset detail...</EmptyState>}
        </section>
      ) : null}

      {activeSection === 'project' ? <section className="card section-card">
        <div className="section-heading">
          <div>
            <h3>Current project assets</h3>
            <p>Assets selected for this project. Upload, choose from the library, or generate AI video assets to continue.</p>
          </div>
          <StatusBadge status="ready">{sortedMaterials.length} selected</StatusBadge>
        </div>
        <div className="asset-library">
          {sortedMaterials.map((asset) => {
            const id = assetId(asset);
            const previewUrl = resolveMediaUrl(assetPreviewUrl(asset));
            const isCurrentAssetAnalyzing = analyzingAssetId === id || activeAssetAnalysisIds.has(id);
            return (
              <div className="asset-card-stack" key={id}>
                <article className="card asset-card">
                  <AssetPreview asset={asset} previewUrl={previewUrl} onOpen={() => selectAsset(asset)} />
                  <div className="asset-body">
                    <div className="asset-header">
                      <div className="asset-title-block">
                        <h3 title={assetDisplayName(asset)}>{assetDisplayName(asset)}</h3>
                        <div className="meta-line">
                          <span>{asset.type}</span>
                          <span>{asset.assetType || '-'}</span>
                          <span>{formatSize(asset.size)}</span>
                          <span>{asset.source || 'upload'}</span>
                        </div>
                        <div className="meta-line">
                          <StatusBadge status={asset.analysisStatus || 'pending'} />
                          <span>provider: {providerLabel(asset)}</span>
                        </div>
                        {asset.metadata?.video ? <p className="meta-line">video: {videoSummary(asset)}</p> : null}
                      </div>
                      <div className="button-row">
                        <button type="button" onClick={() => { onOpenAsset?.(id); selectAsset(asset); }} disabled={disabled}>Detail</button>
                        <AssetAnalyzeButton disabled={disabled} isAnalyzing={isCurrentAssetAnalyzing} onAnalyze={() => analyzeSelectedAsset(asset)} label="Reanalyze" />
                        <button type="button" onClick={() => deleteAsset(asset)} disabled={disabled}>Delete</button>
                      </div>
                    </div>
                    <p className="asset-summary">{asset.analysis?.summary || asset.description || 'No analysis yet.'}</p>
                    {asset.analysisError ? <p className="error-text">{asset.analysisError.message || asset.analysisError}</p> : null}
                    <TagList tags={asset.tags || asset.analysis?.tags || []} />
                  </div>
                </article>
                {selectedAsset && assetId(selectedAsset) === id ? renderSelectedAssetDetailPanel() : null}
              </div>
            );
          })}
          {sortedMaterials.length === 0 ? <EmptyState>No project assets yet. Upload, choose from the shared library, or generate AI material to start.</EmptyState> : null}
        </div>
        {selectedAsset && !selectedAssetInProject ? renderSelectedAssetDetailPanel() : null}
      </section> : null}

      {activeSection === 'upload' ? <form className="card form section-card" onSubmit={submit}>
        <div className="section-heading">
          <div>
            <h3>Upload asset</h3>
            <p>Import owned product images, videos, reference assets, and reusable clips.</p>
          </div>
        </div>
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
          <input type="file" accept="image/*,video/*,audio/*" onChange={(event) => setFile(event.target.files?.[0] || null)} disabled={disabled || isUploading} required />
        </label>
        {uploadingAudio ? (
          <label>
            Audio type
            <select value={uploadForm.audioKind} onChange={(event) => setUploadForm((prev) => ({ ...prev, audioKind: event.target.value }))} disabled={disabled || isUploading}>
              <option value="background_music">Background music only - mix quietly under generated dialogue</option>
              <option value="full_audio_voiceover">Full audio / voiceover track - replace generated dialogue</option>
            </select>
          </label>
        ) : null}
        <button type="submit" disabled={disabled || isUploading}>{isUploading ? 'Uploading...' : 'Upload asset'}</button>
      </form> : null}

      {activeSection === 'search' ? <section className="card form section-card">
        <div className="section-heading">
          <div>
            <h3>Search assets</h3>
            <p>Search the shared asset library. Assets outside the current project can be added directly.</p>
          </div>
        </div>
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
          <label>
            Media
            <select value={searchForm.mediaType} onChange={(event) => setSearchForm((prev) => ({ ...prev, mediaType: event.target.value }))} disabled={disabled || isSearching}>
              <option value="">All</option>
              <option value="image">image</option>
              <option value="video">video</option>
            </select>
          </label>
          <label>
            Analysis
            <select value={searchForm.analysisStatus} onChange={(event) => setSearchForm((prev) => ({ ...prev, analysisStatus: event.target.value }))} disabled={disabled || isSearching}>
              <option value="">All</option>
              <option value="pending">pending</option>
              <option value="processing">processing</option>
              <option value="completed">completed</option>
              <option value="failed">failed</option>
            </select>
          </label>
        </div>
        <div className="button-row">
          <button type="button" onClick={runSearch} disabled={disabled || isSearching}>{isSearching ? 'Searching...' : 'Search'}</button>
          <button type="button" onClick={resetSearch} disabled={disabled || isSearching}>Reset</button>
        </div>
        {searchResults.length ? (
          <div className="metadata-panel search-results-panel">
            <strong>Library search results ({searchResults.length})</strong>
            {searchResults.slice(0, 20).map((asset) => {
              const id = assetId(asset);
              const isLinked = projectAssetIds.has(id);
              return (
                <div className="search-result-row" key={id}>
                  <div className="search-result-main">
                    <strong title={assetDisplayName(asset)}>{assetDisplayName(asset)}</strong>
                    <small>
                      {asset.mediaType || asset.type || 'asset'} · {asset.assetType || '-'} · {asset.fileUrl || asset.url || '-'}
                    </small>
                  </div>
                  <div className="search-result-actions">
                    <StatusBadge status={isLinked ? 'ready' : 'pending'}>{isLinked ? 'In project' : 'Library only'}</StatusBadge>
                    <button type="button" onClick={() => { onOpenAsset?.(id); selectAsset(asset); }} disabled={disabled}>Detail</button>
                    {isLinked ? null : (
                      <button type="button" onClick={() => addSearchResultToProject(asset)} disabled={disabled || !onLinkAsset}>
                        Add to project
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </section> : null}

      {activeSection === 'generate' ? <section className="card form section-card">
        <div className="section-heading">
          <div>
            <h3>AI generated video asset</h3>
            <p>Create SeedDance video material, then analyze it into reusable structured assets.</p>
          </div>
        </div>
        <div className="form-grid">
          <label>Generation model<input value="Seedance 1.5 Pro video generation" disabled /></label>
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
          <label>
            Reference media
            <select value={generationForm.referenceMode} onChange={(event) => setGenerationForm((prev) => ({ ...prev, referenceMode: event.target.value }))} disabled={disabled || isGenerating}>
              <option value="none">None</option>
              <option value="upload_first">Upload image as first frame</option>
              <option value="upload_last">Upload image as last frame</option>
              <option value="upload_first_last">Upload first + last frame</option>
              <option value="project_asset">Use selected project asset</option>
            </select>
          </label>
          {['upload_first', 'upload_first_last'].includes(generationForm.referenceMode) ? (
            <label>
              First-frame image
              <input type="file" accept="image/*" onChange={(event) => setFirstFrameFile(event.target.files?.[0] || null)} disabled={disabled || isGenerating} />
            </label>
          ) : null}
          {['upload_last', 'upload_first_last'].includes(generationForm.referenceMode) ? (
            <label>
              Last-frame image
              <input type="file" accept="image/*" onChange={(event) => setLastFrameFile(event.target.files?.[0] || null)} disabled={disabled || isGenerating} />
            </label>
          ) : null}
          {generationForm.referenceMode === 'project_asset' ? (
            <label>
              Project image asset
              <select value={generationForm.referenceAssetId} onChange={(event) => setGenerationForm((prev) => ({ ...prev, referenceAssetId: event.target.value }))} disabled={disabled || isGenerating}>
                <option value="">Choose image asset</option>
                {projectImageAssets.map((asset) => (
                  <option key={assetId(asset)} value={assetId(asset)}>{asset.title || asset.name || asset.originalName || assetId(asset)}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <label>
          Prompt
          <textarea rows={4} value={generationForm.prompt} onChange={(event) => setGenerationForm((prev) => ({ ...prev, prompt: event.target.value }))} disabled={disabled || isGenerating} />
        </label>
        <button type="button" disabled={disabled || isGenerating || !generationForm.prompt.trim()} onClick={generateAsset}>{isGenerating ? 'Generating...' : 'Generate asset'}</button>
        {generationTask && !generationPanelClosed ? (
          <div className="task-summary">
            <strong className="truncate" title={generationTask.id}>{generationTask.id}</strong>
            <StatusBadge status={generationTask.status}>{generationTask.stageLabel || generationTask.status}</StatusBadge>
            <span>{generationTask.progress}%</span>
            {generationElapsedLabel ? <span>Elapsed {generationElapsedLabel}</span> : null}
            <button type="button" onClick={() => setGenerationPanelCollapsed((prev) => !prev)}>
              {generationPanelCollapsed ? 'Expand detail' : 'Collapse detail'}
            </button>
            <button type="button" onClick={() => setGenerationPanelClosed(true)}>Close</button>
            {!generationPanelCollapsed ? (
              <>
                <div className="inline-progress"><span style={{ width: `${generationTask.progress || 0}%` }} /></div>
                {generatedAsset ? (
                  <small>
                    Generated asset: {generatedAsset.title || generatedAsset.name || generatedAsset.originalName}
                    <button type="button" onClick={() => { onOpenAsset?.(assetId(generatedAsset)); selectAsset(generatedAsset); }}>Open detail</button>
                  </small>
                ) : null}
                {generationTask.error ? <small>{generationTask.error}</small> : null}
              </>
            ) : null}
          </div>
        ) : null}
      </section> : null}

      {activeSection === 'library' ? <section className="card section-card">
        <div className="section-heading">
          <div>
            <h3>Global asset library</h3>
            <p>Shared pool across projects. Add assets to the current project without copying files.</p>
          </div>
          <StatusBadge status="ready">{sortedGlobalAssets.length} total</StatusBadge>
        </div>
        <div className="metric-grid">
          <button type="button" className={globalCategory === 'total' ? 'metric-tile active' : 'metric-tile'} onClick={() => setGlobalCategory(globalCategory === 'total' ? '' : 'total')}><strong>{globalStats.total}</strong><span>Total assets</span></button>
          <button type="button" className={globalCategory === 'images' ? 'metric-tile active' : 'metric-tile'} onClick={() => setGlobalCategory(globalCategory === 'images' ? '' : 'images')}><strong>{globalStats.imageCount}</strong><span>Images</span></button>
          <button type="button" className={globalCategory === 'videos' ? 'metric-tile active' : 'metric-tile'} onClick={() => setGlobalCategory(globalCategory === 'videos' ? '' : 'videos')}><strong>{globalStats.videoCount}</strong><span>Videos</span></button>
          <button type="button" className={globalCategory === 'ai' ? 'metric-tile active' : 'metric-tile'} onClick={() => setGlobalCategory(globalCategory === 'ai' ? '' : 'ai')}><strong>{globalStats.aiCount}</strong><span>AI generated</span></button>
          <button type="button" className={globalCategory === 'linked' ? 'metric-tile active' : 'metric-tile'} onClick={() => setGlobalCategory(globalCategory === 'linked' ? '' : 'linked')}><strong>{globalStats.linkedCount}</strong><span>In current project</span></button>
        </div>
        {globalCategory ? (
          <div className="table-scroll">
            <h4>{globalCategoryLabel}</h4>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Storage path</th>
                  <th>Size</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredGlobalAssets.map((asset) => (
                  <tr key={assetId(asset)}>
                    <td>{asset.title || asset.name || asset.originalName || assetId(asset)}</td>
                    <td className="mono-cell">{asset.fileUrl || asset.url || asset.storagePath || '-'}</td>
                    <td>{formatSize(asset.size)}</td>
                    <td><button type="button" onClick={() => deleteGlobalAsset(asset)} disabled={disabled}>Delete</button></td>
                  </tr>
                ))}
                {!filteredGlobalAssets.length ? (
                  <tr><td colSpan="4">No assets in this category.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </section> : null}
    </PageShell>
  );
}
