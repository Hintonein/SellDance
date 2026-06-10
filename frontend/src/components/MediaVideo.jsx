import { forwardRef, useEffect, useState } from 'react';

const errorMessages = {
  1: 'Video loading was aborted.',
  2: 'Network error while loading video.',
  3: 'Browser could not decode this video.',
  4: 'Video source is not supported or could not be found.',
};

function mediaErrorMessage(error) {
  const code = error?.code;
  return errorMessages[code] || 'Video failed to load.';
}

const MediaVideo = forwardRef(function MediaVideo({
  src,
  className = '',
  label = 'Video',
  controls = true,
  muted = false,
  autoPlay = false,
  loop = false,
  playsInline = true,
  preload = 'metadata',
  showActions = true,
  sourceLabel = 'Open source',
}, ref) {
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
  }, [src]);

  if (!src) return null;

  return (
    <div className={className ? `media-video-shell ${className}-shell` : 'media-video-shell'}>
      <video
        ref={ref}
        className={className}
        controls={controls}
        muted={muted}
        autoPlay={autoPlay}
        loop={loop}
        playsInline={playsInline}
        preload={preload}
        src={src}
        onError={(event) => setError(mediaErrorMessage(event.currentTarget.error))}
      />
      {showActions ? (
        <div className="media-video-actions">
          <a href={src} target="_blank" rel="noreferrer">{sourceLabel}</a>
          <span>{label}</span>
        </div>
      ) : null}
      {error ? (
        <p className="media-video-error">
          {error} Check the source URL or backend static file service.
        </p>
      ) : null}
    </div>
  );
});

export default MediaVideo;
