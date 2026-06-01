export default function CreationModeSelector({ value, onChange, disabled }) {
  return (
    <select value={value} onChange={(event) => onChange?.(event.target.value)} disabled={disabled}>
      <option value="asset_first">asset_first</option>
      <option value="storyboard_driven">storyboard_driven</option>
    </select>
  );
}
