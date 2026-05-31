import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useAppStore } from '../store/useAppStore';
import { IndexedDBService } from '../services/IndexedDBService';
import { getDetectionTypeName, getDetectionTypeColor } from '../services/BehaviorAnalyzer';

const dbService = new IndexedDBService();

export const Dashboard = () => {
  const { alerts, statistics, updateStatistics } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        await dbService.initialize();
        const stats = await dbService.getTodayStats();
        updateStatistics({
          totalAlerts: stats.total,
          byType: stats.byType as any,
          byHour: stats.byHour
        });
      } catch (error) {
        console.error('Failed to load statistics:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStats();
  }, [updateStatistics]);

  useEffect(() => {
    if (alerts.length > 0) {
      const latestAlert = alerts[0];
      const hour = new Date(latestAlert.timestamp).getHours();
      
      updateStatistics({
        totalAlerts: statistics.totalAlerts + 1,
        byType: {
          ...statistics.byType,
          [latestAlert.type]: (statistics.byType[latestAlert.type] || 0) + 1
        },
        byHour: {
          ...statistics.byHour,
          [hour]: (statistics.byHour[hour] || 0) + 1
        }
      });
    }
  }, [alerts.length]);

  const pieData = Object.entries(statistics.byType).map(([type, count]) => ({
    name: getDetectionTypeName(type as any),
    value: count,
    color: getDetectionTypeColor(type as any)
  })).filter(item => item.value > 0);

  const heatmapData = Object.entries(statistics.byHour)
    .map(([hour, count]) => ({
      hour: `${hour.toString().padStart(2, '0')}:00`,
      hourNum: parseInt(hour),
      count
    }))
    .sort((a, b) => a.hourNum - b.hourNum);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-white mb-6">统计看板</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="今日异常总数"
          value={statistics.totalAlerts}
          icon="⚠️"
          color="from-red-500 to-orange-500"
        />
        <StatCard
          title="摔倒事件"
          value={statistics.byType.fall}
          icon="🩹"
          color="from-red-600 to-red-400"
        />
        <StatCard
          title="逆行事件"
          value={statistics.byType.retrograde}
          icon="↩️"
          color="from-yellow-600 to-yellow-400"
        />
        <StatCard
          title="危险行为"
          value={statistics.byType.luggage + statistics.byType.jump}
          icon="🚨"
          color="from-blue-600 to-purple-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-secondary rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">异常类型分布</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              暂无数据
            </div>
          )}
        </div>

        <div className="bg-secondary rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">高峰时段热力图</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={heatmapData}>
              <XAxis 
                dataKey="hour" 
                tick={{ fill: '#9CA3AF', fontSize: 10 }}
                interval={2}
              />
              <YAxis tick={{ fill: '#9CA3AF' }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1E293B', 
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff'
                }}
              />
              <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]}>
                {heatmapData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.count > 5 ? '#EF4444' : entry.count > 2 ? '#F59E0B' : '#3B82F6'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-secondary rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">最近警报</h3>
        {alerts.length > 0 ? (
          <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
            {alerts.slice(0, 10).map((alert) => (
              <div 
                key={alert.id}
                className="flex items-center justify-between p-3 bg-primary/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: getDetectionTypeColor(alert.type) }}
                  />
                  <span className="text-white font-medium">
                    {getDetectionTypeName(alert.type)}
                  </span>
                  <span className="text-gray-400 text-sm">
                    置信度: {(alert.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <span className="text-gray-400 text-sm font-mono">
                  {new Date(alert.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-500 py-8">
            暂无警报记录
          </div>
        )}
      </div>
    </div>
  );
};

const StatCard = ({ 
  title, 
  value, 
  icon, 
  color 
}: { 
  title: string; 
  value: number; 
  icon: string; 
  color: string;
}) => (
  <div className={`bg-gradient-to-br ${color} rounded-xl p-6 relative overflow-hidden`}>
    <div className="absolute top-2 right-2 text-4xl opacity-20">{icon}</div>
    <div className="relative z-10">
      <p className="text-white/80 text-sm mb-1">{title}</p>
      <p className="text-white text-3xl font-bold font-mono">{value}</p>
    </div>
  </div>
);
