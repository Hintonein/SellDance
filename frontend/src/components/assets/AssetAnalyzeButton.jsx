export default function AssetAnalyzeButton({ disabled, isAnalyzing, onAnalyze, label = 'Analyze' }) {
  return <button type="button" onClick={onAnalyze} disabled={disabled || isAnalyzing}>{isAnalyzing ? 'Analyzing...' : label}</button>;
}
