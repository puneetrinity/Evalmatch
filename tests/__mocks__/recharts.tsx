/**
 * Mock for recharts
 */

import React from 'react';

export const Radar = ({ dataKey, stroke, fill, fillOpacity }: any) => (
  <g data-testid="radar" data-datakey={dataKey} data-stroke={stroke} data-fill={fill} data-fillopacity={fillOpacity}>
    <path d="M0,0 L100,100" />
  </g>
);

export const RadarChart = ({ children, cx, cy, outerRadius, data }: any) => (
  <svg data-testid="radar-chart" data-cx={cx} data-cy={cy} data-outerradius={outerRadius} data-length={data?.length}>
    {children}
  </svg>
);

export const PolarGrid = () => <g data-testid="polar-grid" />;

export const PolarAngleAxis = ({ dataKey, tick }: any) => (
  <g data-testid="polar-angle-axis" data-datakey={dataKey}>
    {tick && <text data-testid="axis-tick">Sample Tick</text>}
  </g>
);

export const PolarRadiusAxis = ({ angle, domain }: any) => (
  <g data-testid="polar-radius-axis" data-angle={angle} data-domain={domain?.join(',')}>
    <text>0</text>
    <text>100</text>
  </g>
);

export const ResponsiveContainer = ({ children, width, height }: any) => (
  <div data-testid="responsive-container" data-width={width} data-height={height}>
    {children}
  </div>
);