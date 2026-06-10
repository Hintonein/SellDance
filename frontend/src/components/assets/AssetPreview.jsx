import MediaVideo from '../MediaVideo';

function isVideo(asset) {
  return asset?.mediaType === 'video' || (asset?.mimeType || '').startsWith('video/') || String(asset?.type || '').includes('video');
}
function isImage(asset) {
  return asset?.mediaType === 'image' || (asset?.mimeType || '').startsWith('image/') || String(asset?.type || '').includes('image') || asset?.assetType === 'logo';
}
export default function AssetPreview({ asset, previewUrl, thumbnailUrl = '', playableUrl = '', preferPlayback = false, onOpen }) {
  const width = Number(asset?.metadata?.video?.width || asset?.metadata?.image?.width || 0);
  const height = Number(asset?.metadata?.video?.height || asset?.metadata?.image?.height || 0);
  const aspectRatio = width > 0 && height > 0 ? `${width} / ${height}` : undefined;
  const isVideoAsset = isVideo(asset);
  const isImageAsset = isImage(asset);
  const imageUrl = thumbnailUrl || (!isVideoAsset ? previewUrl : '');
  const videoUrl = playableUrl || (isVideoAsset ? previewUrl : '');
  const showVideoPlayer = isVideoAsset && videoUrl && (preferPlayback || !imageUrl);
  return (
    <div className="asset-preview" style={aspectRatio ? { '--asset-aspect-ratio': aspectRatio } : undefined} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') onOpen?.(); }}>
      {isVideoAsset && imageUrl && !showVideoPlayer ? <img src={imageUrl} alt={asset.title || asset.name || asset.originalName || 'Video thumbnail'} /> : null}
      {showVideoPlayer ? <MediaVideo className="asset-preview-video" src={videoUrl} label={asset.title || asset.name || asset.originalName || 'Asset video'} showActions={preferPlayback} /> : null}
      {isImageAsset && imageUrl ? <img src={imageUrl} alt={asset.title || asset.name || asset.originalName} /> : null}
      {isVideoAsset && imageUrl && !showVideoPlayer ? <span className="asset-preview-play">Play</span> : null}
      {isVideoAsset ? <span className="media-kind">video</span> : null}
      {isVideoAsset && !imageUrl && !videoUrl ? <div className="asset-file asset-preview-unavailable">Video preview unavailable</div> : null}
      {!isVideoAsset && (!imageUrl || !isImageAsset) ? <div className="asset-file">No preview</div> : null}
    </div>
  );
}
