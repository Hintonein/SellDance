export default function EditingPlanPreview({ plan }) {
  if (!plan) return null;
  return <ol>{(plan.steps || []).map((step) => <li key={step.index}>{step.duration}s · {step.visualDescription || step.reason}</li>)}</ol>;
}
