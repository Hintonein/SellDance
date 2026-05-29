function isVideo(asset) {
  return asset?.mediaType === 'video' || (asset?.mimeType || '').startsWith('video/') || String(asset?.type || '').includes('video');
}
function isImage(asset) {
  return asset?.mediaType === 'image' || (asset?.mimeType || '').startsWith('image/') || String(asset?.type || '').includes('image') || asset?.assetType === 'logo';
}
export default function AssetPreview({ asset, previewUrl, onOpen }) {
  return (
    <div className="asset-preview" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') onOpen?.(); }}>
      {isVideo(asset) && previewUrl ? <video controls src={previewUrl} /> : null}
      {isImage(asset) && previewUrl ? <img src={previewUrl} alt={asset.title || asset.name || asset.originalName} /> : null}
      {!isVideo(asset) && !isImage(asset) ? <div className="asset-file">File</div> : null}
    </div>
  );
}
