'use client';

// Donut chart primitive using visx. Includes a center label slot.

import { Group } from '@visx/group';
import { Pie } from '@visx/shape';
import { ParentSize } from '@visx/responsive';
import { CHART_COLORS } from './colors';

export interface DonutSlice {
  label: string;
  value: number;
}

export interface DonutChartProps {
  data: DonutSlice[];
  height?: number;
  // Color per slice, cycled from CHART_COLORS.series by default.
  colors?: string[];
  // Center label.
  centerLabel?: string;
  centerValue?: string;
}

function inner(
  data: DonutSlice[],
  width: number,
  height: number,
  colors: string[],
  centerLabel?: string,
  centerValue?: string
) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-text-secondary">
        No data
      </div>
    );
  }
  const radius = Math.min(width, height) / 2;
  const innerRadius = radius * 0.62;
  const cy = height / 2;
  const cx = width / 2;

  return (
    <svg width={width} height={height}>
      <Group top={cy} left={cx}>
        <Pie
          data={data}
          pieValue={(d) => d.value}
          outerRadius={radius - 4}
          innerRadius={innerRadius}
          padAngle={0.01}
        >
          {(pie) =>
            pie.arcs.map((arc, i) => {
              const path = pie.path(arc) ?? '';
              const fill = colors[i % colors.length];
              return <path key={`a-${i}`} d={path} fill={fill} />;
            })
          }
        </Pie>
        {(centerLabel || centerValue) && (
          <g textAnchor="middle">
            {centerValue && (
              <text
                y={centerLabel ? -4 : 0}
                fill={CHART_COLORS.text}
                fontSize={20}
                fontWeight={600}
                dominantBaseline="middle"
              >
                {centerValue}
              </text>
            )}
            {centerLabel && (
              <text
                y={centerValue ? 14 : 0}
                fill={CHART_COLORS.textMuted}
                fontSize={10}
                dominantBaseline="middle"
              >
                {centerLabel}
              </text>
            )}
          </g>
        )}
      </Group>
    </svg>
  );
}

export default function DonutChart({
  data,
  height = 220,
  colors = CHART_COLORS.series,
  centerLabel,
  centerValue,
}: DonutChartProps) {
  return (
    <div className="flex items-stretch gap-4">
      <div style={{ width: height, height }}>
        <ParentSize>
          {({ width }) =>
            width > 0 ? inner(data, width, height, colors, centerLabel, centerValue) : null
          }
        </ParentSize>
      </div>
      {/* Legend */}
      <ul className="flex-1 min-w-0 space-y-1.5 self-center">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2 text-xs">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: colors[i % colors.length] }}
            />
            <span className="text-text-primary truncate">{d.label}</span>
            <span className="ml-auto text-text-secondary tabular-nums">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
