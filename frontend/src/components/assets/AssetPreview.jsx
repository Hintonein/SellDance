function isVideo(asset) {
  return asset?.mediaType === 'video' || (asset?.mimeType || '').startsWith('video/') || String(asset?.type || '').includes('video');
}
function isImage(asset) {
  return asset?.mediaType === 'image' || (asset?.mimeType || '').startsWith('image/') || String(asset?.type || '').includes('image') || asset?.assetType === 'logo';
}
export default function AssetPreview({ asset, previewUrl, onOpen }) {
  const width = Number(asset?.metadata?.video?.width || asset?.metadata?.image?.width || 0);
  const height = Number(asset?.metadata?.video?.height || asset?.metadata?.image?.height || 0);
  const aspectRatio = width > 0 && height > 0 ? `${width} / ${height}` : undefined;
  return (
    <div className="asset-preview" style={aspectRatio ? { '--asset-aspect-ratio': aspectRatio } : undefined} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') onOpen?.(); }}>
      {isVideo(asset) && previewUrl ? <video controls src={previewUrl} /> : null}
      {isImage(asset) && previewUrl ? <img src={previewUrl} alt={asset.title || asset.name || asset.originalName} /> : null}
      {isVideo(asset) ? <span className="media-kind">video</span> : null}
      {!previewUrl || (!isVideo(asset) && !isImage(asset)) ? <div className="asset-file">No preview</div> : null}
    </div>
  );
}
