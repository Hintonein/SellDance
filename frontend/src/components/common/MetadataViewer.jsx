export default function MetadataViewer({ value, empty = '{}' }) {
  const text = value === undefined || value === null
    ? empty
    : typeof value === 'string'
      ? value
      : JSON.stringify(value, null, 2);

  return (
    <div className="metadata-viewer">
      <pre>{text}</pre>
    </div>
  );
}
