'use client';

// Vertical bar chart primitive using visx. Generic over category + value.

import { Group } from '@visx/group';
import { Bar } from '@visx/shape';
import { scaleBand, scaleLinear } from '@visx/scale';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { ParentSize } from '@visx/responsive';
import { CHART_COLORS } from './colors';

export interface BarDatum {
  label: string;
  value: number;
}

export interface BarChartProps {
  data: BarDatum[];
  height?: number;
  color?: string;
  gridRows?: number;
  yFormat?: (n: number) => string;
}

function inner(
  data: BarDatum[],
  width: number,
  height: number,
  margin: { top: number; right: number; bottom: number; left: number },
  opts: Required<Omit<BarChartProps, 'data' | 'height'>>
) {
  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-text-secondary">
        No data
      </div>
    );
  }

  const xScale = scaleBand<string>({
    range: [margin.left, width - margin.right],
    domain: data.map((d) => d.label),
    padding: 0.25,
  });
  const yMax = Math.max(...data.map((d) => d.value), 1);
  const yScale = scaleLinear<number>({
    range: [height - margin.bottom, margin.top],
    domain: [0, yMax * 1.1],
    round: true,
  });

  return (
    <svg width={width} height={height}>
      <GridRows
        scale={yScale}
        width={width - margin.left - margin.right}
        left={margin.left}
        numTicks={opts.gridRows}
        stroke={CHART_COLORS.grid}
        strokeOpacity={0.5}
      />
      <Group>
        {data.map((d) => {
          const barWidth = xScale.bandwidth();
          const barHeight = height - margin.bottom - (yScale(d.value) ?? 0);
          const barX = xScale(d.label) ?? 0;
          const barY = height - margin.bottom - barHeight;
          return (
            <Bar
              key={d.label}
              x={barX}
              y={barY}
              width={barWidth}
              height={barHeight}
              fill={opts.color}
              rx={3}
            />
          );
        })}
      </Group>
      <AxisLeft
        scale={yScale}
        left={margin.left}
        numTicks={opts.gridRows}
        tickFormat={(v) => opts.yFormat(Number(v))}
        stroke={CHART_COLORS.axis}
        tickStroke={CHART_COLORS.axis}
        tickLabelProps={() => ({
          fill: CHART_COLORS.textMuted,
          fontSize: 10,
          textAnchor: 'end',
          dy: '0.33em',
          dx: -4,
        })}
      />
      <AxisBottom
        scale={xScale}
        top={height - margin.bottom}
        stroke={CHART_COLORS.axis}
        tickStroke={CHART_COLORS.axis}
        tickLabelProps={() => ({
          fill: CHART_COLORS.textMuted,
          fontSize: 10,
          textAnchor: 'middle',
        })}
      />
    </svg>
  );
}

export default function BarChart({
  data,
  height = 240,
  color = CHART_COLORS.primary,
  gridRows = 4,
  yFormat = (n) => String(Math.round(n)),
}: BarChartProps) {
  const margin = { top: 12, right: 12, bottom: 32, left: 40 };
  const opts = { color, gridRows, yFormat };
  return (
    <div style={{ width: '100%', height }}>
      <ParentSize>
        {({ width }) =>
          width > 0 ? inner(data, width, height, margin, opts) : null
        }
      </ParentSize>
    </div>
  );
}
