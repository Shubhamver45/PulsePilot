"use client";

import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";

export interface ChartDataPoint {
  date: string;
  control: number;
  treatment: number;
  controlSamples?: number;
  treatmentSamples?: number;
}

export interface ConversionChartProps {
  title?: string;
  subtitle?: string;
  data: ChartDataPoint[];
  metricLabel?: string;
  className?: string;
}

export function ConversionChart({
  title = "Cumulative Conversion Rate Over Time",
  subtitle = "Dynamic telemetry stream comparison",
  data,
  metricLabel = "Conversion Rate (%)",
  className,
}: ConversionChartProps) {
  return (
    <div className={cn("p-5 rounded-lg border border-border bg-surface shadow-xs", className)}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-semibold text-text">{title}</h4>
          {subtitle && <p className="text-xs text-text-secondary mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#777D8D]" />
            <span className="text-text-secondary">Control</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#7565F5]" />
            <span className="text-text font-semibold">Treatment (Variant)</span>
          </div>
        </div>
      </div>

      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8EAF0" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="#777D8D"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "#E8EAF0" }}
            />
            <YAxis
              stroke="#777D8D"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "#E8EAF0" }}
              tickFormatter={(val) => `${val}%`}
              domain={["dataMin - 1", "dataMax + 1"]}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="p-3 bg-surface border border-border rounded-lg shadow-md text-xs">
                      <p className="font-semibold text-text mb-1.5">{label}</p>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-4 text-[#777D8D]">
                          <span>Control:</span>
                          <span className="font-mono font-medium">{payload[0]?.value}%</span>
                        </div>
                        <div className="flex items-center justify-between gap-4 text-[#7565F5]">
                          <span className="font-semibold">Treatment:</span>
                          <span className="font-mono font-bold">{payload[1]?.value}%</span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Line
              type="monotone"
              dataKey="control"
              name="Control"
              stroke="#777D8D"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 4, stroke: "#777D8D", fill: "#FFFFFF", strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="treatment"
              name="Treatment"
              stroke="#7565F5"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, stroke: "#7565F5", fill: "#FFFFFF", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

