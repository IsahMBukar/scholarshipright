'use client';

// Line chart primitive using visx. Pure presentational; consumer computes scale.

import { Group } from '@visx/group';
import { scaleLinear, scaleTime } from '@visx/scale';
import { LinePath, AreaClosed, Circle } from '@visx/shape';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { ParentSize } from '@visx/responsive';
import { CHART_COLORS } from './colors';

export interface LinePoint {
  // x is a Date or numeric; y is numeric.
  x: Date | number;
  y: number;
}

export interface LineChartProps {
  data: LinePoint[];
  height?: number;
  // Show an area fill underneath the line.
  area?: boolean;
  // Stroke color (defaults to brand primary).
  color?: string;
  // Show a y-axis grid.
  gridRows?: number;
  // Format y ticks.
  yFormat?: (n: number) => string;
  // Format x ticks (when x is a Date).
  xFormat?: (d: Date) => string;
  // Treat x as dates automatically if first point is a Date.
}

function inner(
  data: LinePoint[],
  width: number,
  height: number,
  margin: { top: number; right: number; bottom: number; left: number },
  opts: Required<Omit<LineChartProps, 'data' | 'height'>>
) {
  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-text-secondary">
        No data
      </div>
    );
  }

  const xIsDate = data[0].x instanceof Date;
  const xAccessor = (d: LinePoint) => (d.x instanceof Date ? d.x.getTime() : (d.x as number));
  const yAccessor = (d: LinePoint) => d.y;

  const xScale = (xIsDate ? scaleTime : scaleLinear)<number>({
    range: [margin.left, width - margin.right],
    domain: [
      Math.min(...data.map(xAccessor)),
      Math.max(...data.map(xAccessor)),
    ] as [number, number],
  });

  const yMin = Math.min(...data.map(yAccessor), 0);
  const yMax = Math.max(...data.map(yAccessor), 1);
  const yScale = scaleLinear<number>({
    range: [height - margin.bottom, margin.top],
    domain: [yMin, yMax * 1.1],
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
      {opts.area && (
        <AreaClosed
          data={data}
          x={(d) => xScale(xAccessor(d))}
          y={(d) => yScale(yAccessor(d))}
          yScale={yScale}
          fill={opts.color}
          fillOpacity={0.12}
        />
      )}
      <LinePath
        data={data}
        x={(d) => xScale(xAccessor(d))}
        y={(d) => yScale(yAccessor(d))}
        stroke={opts.color}
        strokeWidth={2}
      />
      {data.map((d, i) => (
        <Circle
          key={i}
          cx={xScale(xAccessor(d))}
          cy={yScale(yAccessor(d))}
          r={2.5}
          fill="white"
          stroke={opts.color}
          strokeWidth={1.5}
        />
      ))}
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
        tickFormat={(v) =>
          xIsDate ? opts.xFormat(new Date(Number(v))) : String(v)
        }
        stroke={CHART_COLORS.axis}
        tickStroke={CHART_COLORS.axis}
        tickLabelProps={() => ({
          fill: CHART_COLORS.textMuted,
          fontSize: 10,
          textAnchor: 'middle',
        })}
        numTicks={Math.min(7, data.length)}
      />
    </svg>
  );
}

export default function LineChart({
  data,
  height = 240,
  area = true,
  color = CHART_COLORS.primary,
  gridRows = 4,
  yFormat = (n) => String(Math.round(n)),
  xFormat = (d) => `${d.getMonth() + 1}/${d.getDate()}`,
}: LineChartProps) {
  const margin = { top: 12, right: 12, bottom: 24, left: 40 };
  const opts = { area, color, gridRows, yFormat, xFormat };
  return (
    <div style={{ width: '100%', height }}>
      <ParentSize>
        {({ width }) =>
          width > 0
            ? inner(data, width, height, margin, opts)
            : null
        }
      </ParentSize>
    </div>
  );
}
