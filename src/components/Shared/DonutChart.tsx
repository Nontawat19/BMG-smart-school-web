import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export interface DonutChartEntry {
  name: string;
  value: number;
  color: string;
  actualColor: string;
  percent: number;
}

const PieTooltipContent = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as DonutChartEntry;
  return (
    <div className="relative bg-white/95 dark:bg-[#1a1b1e]/95 backdrop-blur-md p-3.5 border border-gray-200/80 dark:border-gray-800 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1)] rounded-xl text-xs z-50 min-w-[170px] pointer-events-none">
      <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-gray-100 dark:border-white/5">
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.actualColor, boxShadow: `0 0 8px ${d.actualColor}` }} />
        <p className="font-extrabold text-gray-800 dark:text-gray-200 text-[13px] tracking-tight">{d.name}</p>
      </div>
      <div className="space-y-1.5 font-medium">
        <div className="flex justify-between items-center">
          <span className="text-gray-400 dark:text-gray-500 font-semibold">จำนวน:</span>
          <span className="font-extrabold text-gray-900 dark:text-white">{d.value} คน</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-400 dark:text-gray-500 font-semibold">คิดเป็น:</span>
          <span className="font-extrabold text-indigo-600 dark:text-indigo-400">{d.percent}%</span>
        </div>
      </div>
      <div className="mt-2.5 h-1 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${d.percent}%`, backgroundColor: d.actualColor }} />
      </div>
    </div>
  );
};

interface DonutChartProps {
  data: DonutChartEntry[];
}

const DonutChart: React.FC<DonutChartProps> = ({ data }) => (
  <ResponsiveContainer width="100%" height="100%" minHeight={80}>
    <PieChart>
      <Pie
        data={data}
        cx="50%"
        cy="50%"
        innerRadius="65%"
        outerRadius="85%"
        paddingAngle={2}
        dataKey="value"
        stroke="none"
        startAngle={90}
        endAngle={450}
      >
        {data.map((entry, index) => (
          <Cell key={`cell-${index}`} fill={entry.color} />
        ))}
      </Pie>
      <Tooltip content={<PieTooltipContent />} wrapperStyle={{ zIndex: 50 }} />
    </PieChart>
  </ResponsiveContainer>
);

export default DonutChart;
