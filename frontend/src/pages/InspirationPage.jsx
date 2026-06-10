import { useEffect, useMemo, useState } from 'react';
import PageShell from '../components/PageShell';

const sourceNotice = 'Only public metadata, source links, source declarations, and structured analysis are saved. Public videos are not retained, copied, remixed, or reused as assets.';
const reuseNotice = 'Generated scripts may only reuse abstract strategy and creative factors, never source-video wording, shots, music, or unique expressions.';

const initialSearch = {
  platform: 'dy',
  category: 'personal_care',
  keywords: 'Liushen Florida Water',
  semanticFilter: 'summer household repellent, itch relief, family scene, domestic personal care',
  limit: 10,
};

function StatusPill({ value }) {
  return <span className={`status-badge status-${value || 'pending'}`}>{value || 'pending'}</span>;
}

export default function InspirationPage({
  disabled,
  videos = [],
  templates = [],
  crawlerTask,
  embedded = false,
  mode = 'all',
  onSearch,
  onRefresh,
  onCancelSearch,
  onAnalyze,
  onAnalyzeAndTemplate,
  onDeleteTemplate,
}) {
  const [search, setSearch] = useState(initialSearch);
  const [selectedVideoIds, setSelectedVideoIds] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [activeVideoId, setActiveVideoId] = useState('');

  useEffect(() => {
    if (!selectedTemplateId && templates[0]) setSelectedTemplateId(templates[0].id);
  }, [selectedTemplateId, templates]);

  const selectedVideo = useMemo(
    () => videos.find((video) => video.id === activeVideoId) || videos.find((video) => video.analysisReport) || videos[0],
    [activeVideoId, videos]
  );
  const selectedReport = selectedVideo?.analysisReport;
  const rankedVideos = videos.slice(0, 10);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) || templates[0] || null;
  const showReferences = mode !== 'methodology';
  const showMethodology = mode !== 'references';

  const submitSearch = async () => {
    await onSearch({ ...search, limit: Number(search.limit) || 10 });
  };

  const submitDeepAnalyzeAndTemplate = async () => {
    await onAnalyzeAndTemplate({
      videoIds: selectedVideoIds,
      deep: true,
      name: search.category ? `${search.category} deep inspiration methodology` : 'Deep inspiration methodology',
      category: search.category,
    });
  };

  const submitAnalyzeAndTemplate = async () => {
    await onAnalyzeAndTemplate({
      videoIds: selectedVideoIds,
      deep: false,
      name: search.category ? `${search.category} inspiration methodology` : 'Inspiration methodology',
      category: search.category,
    });
  };

  const content = (
    <>
      <section className="compliance-band">
        <strong>Source and compliance</strong>
        <span>{sourceNotice}</span>
        <span>{reuseNotice}</span>
      </section>

      {showReferences ? <section className="card form section-card">
        <div className="section-heading">
          <div>
            <h3>Reference Video Library</h3>
            <p>Search public videos by platform, category, keyword, and semantic intent. Completed tasks import only public metadata and source links.</p>
          </div>
          <button type="button" onClick={onRefresh} disabled={disabled || !videos.length}>Clear library</button>
        </div>
        <div className="form-grid">
          <label>Platform
            <select value={search.platform} onChange={(event) => setSearch((prev) => ({ ...prev, platform: event.target.value }))} disabled={disabled}>
              <option value="dy">Douyin</option>
              <option value="xhs">Xiaohongshu</option>
              <option value="ks">Kuaishou</option>
              <option value="bili">Bilibili</option>
            </select>
          </label>
          <label>Category
            <input value={search.category} onChange={(event) => setSearch((prev) => ({ ...prev, category: event.target.value }))} disabled={disabled} />
          </label>
          <label>Keywords
            <input value={search.keywords} onChange={(event) => setSearch((prev) => ({ ...prev, keywords: event.target.value }))} disabled={disabled} />
          </label>
          <label>Semantic filter
            <input
              value={search.semanticFilter}
              onChange={(event) => setSearch((prev) => ({ ...prev, semanticFilter: event.target.value }))}
              placeholder="Relevant scene, audience, style, or product intent"
              disabled={disabled}
            />
          </label>
          <label>Count
            <input type="number" min="1" max="100" value={search.limit} onChange={(event) => setSearch((prev) => ({ ...prev, limit: event.target.value }))} disabled={disabled} />
          </label>
        </div>
        <div className="button-row">
          <button type="button" onClick={submitSearch} disabled={disabled || !search.keywords.trim()}>Search public videos</button>
          {['queued', 'running'].includes(crawlerTask?.status) ? (
            <button type="button" onClick={onCancelSearch} disabled={disabled}>Stop search</button>
          ) : null}
          <button type="button" onClick={submitAnalyzeAndTemplate} disabled={disabled || !selectedVideoIds.length}>
            Analyze selected and generate template
          </button>
          <button type="button" onClick={submitDeepAnalyzeAndTemplate} disabled={disabled || !selectedVideoIds.length}>
            Deep analyze selected and generate template
          </button>
          {crawlerTask ? <StatusPill value={crawlerTask.status} /> : null}
          {crawlerTask ? <span className="muted-line">{crawlerTask.resultCount || 0} imported</span> : null}
        </div>
        {crawlerTask?.logs?.length ? (
          <pre className="log-panel">{crawlerTask.logs.slice(-8).map((log) => `[${log.level}] ${log.message}`).join('\n')}</pre>
        ) : null}
      </section> : null}

      {showReferences ? <section className="video-grid">
        {rankedVideos.map((video) => (
          <article key={video.id} className="card video-card">
            <div className="video-card-top">
              <input
                type="checkbox"
                checked={selectedVideoIds.includes(video.id)}
                onChange={(event) => setSelectedVideoIds((prev) => event.target.checked ? [...prev, video.id] : prev.filter((id) => id !== video.id))}
                disabled={disabled}
                title="Select video for analysis and template mining"
              />
              <StatusPill value={video.analysisStatus} />
            </div>
            {video.coverUrl ? <img src={video.coverUrl} alt="" className="cover-thumb" /> : null}
            <h3>{video.title}</h3>
            <p>{video.description}</p>
            <div className="meta-line">
              <span>{video.platform}</span>
              <span>{video.category}</span>
              <span>{video.author?.nickname || 'unknown author'}</span>
              <span>{video.metrics?.likedCount || 0} likes</span>
              <span>relevance {video.relevanceScore ?? '-'}</span>
              <span>score {video.combinedScore ?? 0}</span>
            </div>
            {video.relevanceReason ? <small className="muted-line">{video.relevanceReason}</small> : null}
            {video.analysisError ? <small className="error-text">{video.analysisError.message}</small> : null}
            <small className="muted-line">{video.sourceDeclaration}</small>
            <div className="button-row">
              {video.sourceUrl ? <a className="button-link secondary" href={video.sourceUrl} target="_blank" rel="noreferrer">Source</a> : null}
              <button type="button" onClick={() => onAnalyze(video.id)} disabled={disabled}>Analyze</button>
              <button type="button" onClick={() => setActiveVideoId(video.id)} disabled={disabled}>Details</button>
            </div>
          </article>
        ))}
        {!rankedVideos.length ? <div className="card empty-state">No inspiration videos yet.</div> : null}
      </section> : null}

      {showReferences ? <section className="card section-card">
        <div className="section-heading">
          <div>
            <h3>Breakdown Report</h3>
            <p>{selectedVideo?.title || 'Select or analyze a public video.'}</p>
          </div>
        </div>
        {selectedReport ? (
          <div className="report-grid">
            <div><strong>Hook</strong><p>{selectedReport.hook}</p></div>
            <div><strong>Selling Points</strong><p>{(selectedReport.sellingPoints || []).join(' / ')}</p></div>
            <div><strong>Narrative Structure</strong><p>{(selectedReport.narrativeStructure || []).join(' -> ')}</p></div>
            <div><strong>Visual Style</strong><p>{(selectedReport.visualStyle || []).join(' / ')}</p></div>
            <div><strong>BGM / Voiceover / Subtitle</strong><p>{[selectedReport.bgmStyle, selectedReport.voiceoverStyle, selectedReport.subtitleStyle].filter(Boolean).join(' / ')}</p></div>
            <div><strong>Camera Movement</strong><p>{(selectedReport.cameraMovement || []).join(' / ')}</p></div>
            <div><strong>Reusable Takeaways</strong><p>{(selectedReport.reusableTakeaways || []).join(' / ')}</p></div>
            <div><strong>Compliance Risks</strong><p>{(selectedReport.complianceRisks || []).join(' / ')}</p></div>
          </div>
        ) : <p className="muted-line">No analysis report selected.</p>}
      </section> : null}

      {showMethodology ? <section className="card form section-card">
        <div className="section-heading">
          <div>
            <h3>Methodology Template</h3>
            <p>One selected methodology template is shown for script generation. Delete it and rerun analysis to regenerate.</p>
          </div>
          <div className="button-row">
            <button type="button" onClick={() => selectedTemplate && onDeleteTemplate(selectedTemplate.id)} disabled={disabled || !selectedTemplate}>Delete current</button>
          </div>
        </div>
        {selectedTemplate ? (
          <article className="methodology-panel">
            <div className="section-heading">
              <div>
                <h3>{selectedTemplate.name}</h3>
                <p>{selectedTemplate.strategy?.name || 'strategy'} · {(selectedTemplate.sourceVideoIds || []).length} source videos</p>
              </div>
              {templates.length > 1 ? (
                <select value={selectedTemplate.id} onChange={(event) => setSelectedTemplateId(event.target.value)} disabled={disabled}>
                  {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
              ) : null}
            </div>
            <p>{selectedTemplate.strategy?.description || 'No strategy description.'}</p>
            <div className="factor-grid">
              {Object.entries(selectedTemplate.factors || {}).map(([key, value]) => (
                <div key={key}>
                  <strong>{key}</strong>
                  <p>{Array.isArray(value) ? value.join(' / ') : String(value || '')}</p>
                </div>
              ))}
            </div>
            <small className="muted-line">{selectedTemplate.sourceDeclaration}</small>
            <small className="muted-line">{selectedTemplate.reuseDeclaration}</small>
          </article>
        ) : <div className="empty-state">No methodology template yet.</div>}
      </section> : null}

    </>
  );

  if (embedded) return <div className="embedded-inspiration">{content}</div>;
  return (
    <PageShell title="Inspiration studio" description="Public video search, structured analysis, methodology templates, and original script generation.">
      {content}
    </PageShell>
  );
}
