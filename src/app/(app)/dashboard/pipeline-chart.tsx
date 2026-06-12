/** Lightweight SVG grouped-bar chart: applications vs interviews per week. */
export function PipelineChart({
  weeks,
}: {
  weeks: { label: string; applications: number; interviews: number }[];
}) {
  const W = 560;
  const H = 220;
  const PAD = { top: 12, right: 8, bottom: 28, left: 28 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = Math.max(1, ...weeks.flatMap((w) => [w.applications, w.interviews]));
  const groupW = innerW / weeks.length;
  const barW = Math.min(18, groupW / 2 - 4);

  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  return (
    <div className="mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* gridlines */}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(max * f)}
              y2={y(max * f)}
              stroke="#e5e5e5"
              strokeDasharray="3 3"
            />
            <text x={PAD.left - 6} y={y(max * f) + 4} fontSize="10" fill="#a3a3a3" textAnchor="end">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const cx = PAD.left + i * groupW + groupW / 2;
          return (
            <g key={i}>
              <rect
                x={cx - barW - 2}
                y={y(w.applications)}
                width={barW}
                height={PAD.top + innerH - y(w.applications)}
                rx="2"
                fill="#4f46e5"
              >
                <title>{`Week of ${w.label}: ${w.applications} applications`}</title>
              </rect>
              <rect
                x={cx + 2}
                y={y(w.interviews)}
                width={barW}
                height={PAD.top + innerH - y(w.interviews)}
                rx="2"
                fill="#fbbf24"
              >
                <title>{`Week of ${w.label}: ${w.interviews} interviews`}</title>
              </rect>
              <text x={cx} y={H - 10} fontSize="10" fill="#a3a3a3" textAnchor="middle">
                {w.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex gap-4 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-accent-600" /> Applications submitted
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Interviews
        </span>
      </div>
    </div>
  );
}
