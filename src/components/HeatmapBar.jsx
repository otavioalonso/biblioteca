import { heatmapData, NUM_BINS } from '../utils/readingStats';

/**
 * A thin horizontal bar that shows a heatmap of time spent per position bin.
 * Adapts to the current theme (light / dark / sepia).
 */
export default function HeatmapBar({ stats, currentBin, theme }) {
  const data = heatmapData(stats, theme);

  return (
    <div className="heatmap-bar" title="Reading heatmap — lighter is faster, darker is slower">
      {data.map(({ bin, color }) => (
        <div
          key={bin}
          className={`heatmap-segment${bin === currentBin ? ' heatmap-current' : ''}`}
          style={{ background: color, width: `${100 / NUM_BINS}%` }}
        />
      ))}
    </div>
  );
}
