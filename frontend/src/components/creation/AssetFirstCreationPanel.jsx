export default function AssetFirstCreationPanel({ selectedAssetIds = [], onPlan, disabled }) {
  return <button type="button" disabled={disabled} onClick={() => onPlan?.({ mode: 'asset_first', assetIds: selectedAssetIds })}>Create asset-first mock plan</button>;
}
