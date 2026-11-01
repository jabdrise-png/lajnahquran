
import React from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

// Consistent colors for attendance statuses across all charts
// We'll dynamically generate colors if the status is not in this map, or use a default map
export const getStatusColor = (status: string) => {
    const lower = status?.toLowerCase();
    if (lower === 'hadir') return '#10b981'; // Emerald
    if (lower === 'sakit') return '#f59e0b'; // Amber
    if (lower === 'izin') return '#3b82f6';  // Blue
    if (lower === 'alpa') return '#ef4444';  // Red
    if (lower === 'terlambat') return '#f97316'; // Orange
    
    // Hash string to generate consistent colors for custom statuses
    let hash = 0;
    for (let i = 0; i < status.length; i++) {
        hash = status.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
};

const OTHER_COLORS = ['#6B7280', '#9CA3AF'];

// Palette for Bar Charts (Different months/categories)
const BAR_COLORS = [
    '#2563EB', // Blue 600
    '#10B981', // Emerald 500
    '#F59E0B', // Amber 500
    '#EF4444', // Red 500
    '#8B5CF6', // Violet 500
    '#EC4899', // Pink 500
    '#06B6D4', // Cyan 500
    '#F97316', // Orange 500
    '#6366F1', // Indigo 500
    '#84CC16', // Lime 500
];


interface BarChartProps {
  data: any[];
  barKey: string;
  xAxisKey: string;
}

export const SimpleBarChart: React.FC<BarChartProps> = ({ data, barKey, xAxisKey }) => (
  <ResponsiveContainer width="100%" height={300}>
    <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey={xAxisKey} axisLine={false} tickLine={false} />
      <YAxis axisLine={false} tickLine={false} />
      <Tooltip 
        cursor={{fill: '#f1f5f9'}}
        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
      />
      <Legend />
      <Bar dataKey={barKey} name="Nilai Rata-Rata" radius={[4, 4, 0, 0]}>
        {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
        ))}
      </Bar>
    </BarChart>
  </ResponsiveContainer>
);

interface GroupedBarChartProps {
    data: any[];
    keys: string[]; // Array of keys (e.g., months) to create bars for
    xAxisKey: string;
}

export const GroupedBarChart: React.FC<GroupedBarChartProps> = ({ data, keys, xAxisKey }) => (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis 
            dataKey={xAxisKey} 
            axisLine={false} 
            tickLine={false}
            interval={0}
        />
        <YAxis axisLine={false} tickLine={false} />
        <Tooltip 
          cursor={{fill: '#f1f5f9'}}
          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
        />
        <Legend />
        {keys.map((key, index) => (
             <Bar 
                key={key} 
                dataKey={key} 
                name={key} // Used for Legend label
                fill={BAR_COLORS[index % BAR_COLORS.length]} 
                radius={[4, 4, 0, 0]} 
             />
        ))}
      </BarChart>
    </ResponsiveContainer>
);

interface PieChartProps {
    data: { name: string; value: number }[];
    height?: number;
    showLabel?: boolean;
}

export const SimplePieChart: React.FC<PieChartProps> = ({ data, height = 300, showLabel = true }) => (
    <ResponsiveContainer width="100%" height={height}>
        <PieChart>
            <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={height < 200 ? 50 : 80}
                fill="#8884d8"
                dataKey="value"
                nameKey="name"
                label={showLabel ? ({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%` : false}
            >
                {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getStatusColor(entry.name) || OTHER_COLORS[index % OTHER_COLORS.length]} />
                ))}
            </Pie>
            <Tooltip />
            <Legend />
        </PieChart>
    </ResponsiveContainer>
);

interface StackedBarChartProps {
  data: any[];
  height?: number;
  bottomMargin?: number;
  rotateLabels?: boolean;
  barSize?: number;
  keys?: string[];
  unit?: string;
}

// KHUSUS UNTUK LAPORAN WAKTU / UMUM (Lebih Ramping)
export const StackedBarChart: React.FC<StackedBarChartProps> = ({ 
    data, 
    height = 350, 
    bottomMargin = 30, 
    rotateLabels = false,
    barSize = 40,
    keys = ['Hadir', 'Izin', 'Sakit', 'Alpa', 'Terlambat'],
    unit
}) => (
  <ResponsiveContainer width="100%" height={height}>
    <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: bottomMargin }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
      <XAxis 
        dataKey="name" 
        interval={0} 
        angle={rotateLabels ? -45 : 0}  
        textAnchor={rotateLabels ? "end" : "middle"}
        height={bottomMargin}
        tick={{fontSize: 12, fill: '#475569', fontWeight: 600, textAnchor: rotateLabels ? "end" : "middle"}}
        axisLine={false}
        tickLine={false}
        dx={rotateLabels ? -5 : 0} 
        dy={10}
      />
      <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} tickFormatter={unit ? (value) => `${value}${unit}` : undefined} />
      <Tooltip 
        cursor={{fill: '#f1f5f9'}} 
        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
        formatter={unit ? (value: any) => [`${value}${unit}`] : undefined}
      />
      <Legend verticalAlign="top" wrapperStyle={{paddingBottom: '20px'}} iconType="circle"/>
      {keys.map((k, i) => (
         <Bar key={k} barSize={barSize} dataKey={k} stackId="a" fill={getStatusColor(k)} name={k} radius={i === 0 ? [0,0,4,4] : i === keys.length - 1 ? [4,4,0,0] : [0,0,0,0]} />
      ))}
    </BarChart>
  </ResponsiveContainer>
);

// KHUSUS UNTUK LAPORAN REKAP SANTRI (Banyak Data, Margin Bawah Besar, Bar Tebal)
export const StudentStackedBarChart: React.FC<StackedBarChartProps> = ({ 
    data, 
    height = 500,
    keys = ['Hadir', 'Izin', 'Sakit', 'Alpa', 'Terlambat']
}) => (
  <ResponsiveContainer width="100%" height={height}>
    <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 120 }}>
      {/* Grid Horizontal Saja (Putus-putus) */}
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
      
      {/* Sumbu X (Nama Santri) */}
      <XAxis 
        dataKey="name" 
        interval={0} 
        angle={-45}
        height={120} 
        tick={{fontSize: 11, fill: '#475569', fontWeight: 600, textAnchor: "end"}}
        axisLine={false}
        tickLine={false}
        // REMOVED manual dx/dy as requested, let textAnchor handle it
      />
      
      {/* Sumbu Y (Angka) */}
      <YAxis 
        axisLine={false} 
        tickLine={false} 
        tick={{fontSize: 11, fill: '#64748b'}} 
      />
      
      <Tooltip 
        cursor={{fill: '#f1f5f9'}} 
        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
      />
      <Legend verticalAlign="top" wrapperStyle={{paddingBottom: '20px'}} iconType="circle"/>
      
      {/* Stacked Bars - Urutan: Hadir paling bawah */}
      {keys.map((k, i) => (
         <Bar key={k} barSize={35} dataKey={k} stackId="a" fill={getStatusColor(k)} name={k} radius={i === 0 ? [0,0,0,0] : i === keys.length - 1 ? [4,4,0,0] : [0,0,0,0]} />
      ))}
    </BarChart>
  </ResponsiveContainer>
);

export const AttendanceColumnChart: React.FC<StackedBarChartProps> = ({ 
    data,
    keys = ['Hadir', 'Izin', 'Sakit', 'Alpa', 'Terlambat']
}) => (
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={data} margin={{ top: 15, right: 10, left: -25, bottom: 5 }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} dy={5} />
      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
      <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
      <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
      {keys.map((k) => (
         <Bar key={k} dataKey={k} fill={getStatusColor(k)} name={k} radius={[3, 3, 0, 0]} maxBarSize={28} />
      ))}
    </BarChart>
  </ResponsiveContainer>
);

export const MultiLineChart: React.FC<{ data: any[], isPercentage?: boolean, keys?: string[] }> = ({ 
    data, 
    isPercentage = false,
    keys = ['Hadir', 'Izin', 'Sakit', 'Alpa', 'Terlambat']
}) => (
    <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 15, right: 10, left: -15, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} minTickGap={25} dy={5} />
            <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: '#64748b' }}
                tickFormatter={(val) => isPercentage ? `${val}%` : val}
                domain={isPercentage ? [0, 100] : ['auto', 'auto']}
            />
            <Tooltip 
                formatter={(value: number) => [isPercentage ? `${value}%` : value]}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
            {keys.map(k => (
                <Line key={k} type="monotone" dataKey={k} stroke={getStatusColor(k)} strokeWidth={2} dot={false} name={k} />
            ))}
        </LineChart>
    </ResponsiveContainer>
);
