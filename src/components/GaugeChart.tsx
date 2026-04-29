interface GaugeChartProps {
  value: number;       // 0-100
  max?: number;        // default 100
  size?: number;       // default 200
  label?: string;
  sublabel?: string;
}

export default function GaugeChart({ value, max = 100, size = 200, label, sublabel }: GaugeChartProps) {
  const clampedValue = Math.min(Math.max(value, 0), max);
  const pct = clampedValue / max;

  // Gauge arc: 240 degrees (from -120° to +120°)
  const startAngle = -120;
  const endAngle = 120;
  const totalAngle = endAngle - startAngle; // 240
  const valueAngle = startAngle + pct * totalAngle;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 20;
  const strokeWidth = 14;

  // Convert degrees to radians
  const deg2rad = (d: number) => (d * Math.PI) / 180;

  // Arc path helper
  const describeArc = (startDeg: number, endDeg: number) => {
    const r = radius;
    const start = deg2rad(startDeg - 90); // -90 to start from top
    const end = deg2rad(endDeg - 90);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  // Color based on value
  const getColor = () => {
    if (pct >= 0.75) return '#22c55e'; // green
    if (pct >= 0.60) return '#eab308'; // yellow
    if (pct >= 0.40) return '#f97316'; // orange
    return '#ef4444'; // red
  };

  // Decision text
  const getDecision = () => {
    if (value >= 85) return 'Strong Buy';
    if (value >= 75) return 'Consider Buy';
    if (value >= 60) return 'Wait';
    return 'No Trade';
  };

  const color = getColor();

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.7} viewBox={`0 0 ${size} ${size * 0.75}`}>
        {/* Background arc */}
        <path
          d={describeArc(startAngle, endAngle)}
          fill="none"
          stroke="#1f2937"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Value arc */}
        {clampedValue > 0 && (
          <path
            d={describeArc(startAngle, valueAngle)}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease',
            }}
          />
        )}

        {/* Center value */}
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontSize={size * 0.16}
          fontWeight="bold"
        >
          {Math.round(clampedValue)}
        </text>

        {/* Decision label */}
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={color}
          fontSize={size * 0.07}
          fontWeight="600"
        >
          {getDecision()}
        </text>

        {/* Sublabel */}
        {sublabel && (
          <text
            x={cx}
            y={cy + 28}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#6b7280"
            fontSize={size * 0.05}
          >
            {sublabel}
          </text>
        )}
      </svg>
      {label && (
        <p className="text-xs text-gray-500 uppercase tracking-wider mt-1">{label}</p>
      )}
    </div>
  );
}