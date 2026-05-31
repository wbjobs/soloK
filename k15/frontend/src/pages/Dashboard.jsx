import React, { useState, useEffect } from 'react'
import {
  Activity,
  FileText,
  Target,
  Map,
  BarChart3,
  TrendingUp,
} from 'lucide-react'
import { missionAPI } from '../services/api'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'

const CLASS_COLORS = {
  shipwreck: '#e74c3c',
  pipeline: '#27ae60',
  reef: '#f39c12',
  fish_school: '#3498db',
}

const CLASS_NAMES_CN = {
  shipwreck: '沉船',
  pipeline: '管线',
  reef: '礁石',
  fish_school: '鱼群',
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalMissions: 0,
    totalDetections: 0,
    totalTracks: 0,
    totalMeasurements: 0,
  })
  const [missions, setMissions] = useState([])
  const [pieData, setPieData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [missionsRes] = await Promise.all([
        missionAPI.list({ limit: 5 }),
      ])
      setMissions(missionsRes || [])

      let totalDet = 0
      let totalTrk = 0
      let totalMeas = 0
      const classCounts = {}

      for (const m of (missionsRes || [])) {
        try {
          const stats = await missionAPI.getStatistics(m.id)
          totalDet += stats.total_detections || 0
          totalTrk += stats.total_tracks || 0
          totalMeas += stats.total_measurements || 0

          for (const [cls, count] of Object.entries(stats.class_counts || {})) {
            classCounts[cls] = (classCounts[cls] || 0) + count
          }
        } catch {}
      }

      setStats({
        totalMissions: (missionsRes || []).length,
        totalDetections: totalDet,
        totalTracks: totalTrk,
        totalMeasurements: totalMeas,
      })

      setPieData(
        Object.entries(classCounts).map(([name, value]) => ({
          name: CLASS_NAMES_CN[name] || name,
          value,
          fill: CLASS_COLORS[name] || '#666',
        }))
      )
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    {
      label: '总任务数',
      value: stats.totalMissions,
      icon: FileText,
      color: 'text-blue-400',
      bg: 'bg-blue-500/20',
    },
    {
      label: '总检测数',
      value: stats.totalDetections,
      icon: Target,
      color: 'text-green-400',
      bg: 'bg-green-500/20',
    },
    {
      label: '跟踪目标数',
      value: stats.totalTracks,
      icon: TrendingUp,
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/20',
    },
    {
      label: '测量数据',
      value: stats.totalMeasurements,
      icon: BarChart3,
      color: 'text-purple-400',
      bg: 'bg-purple-500/20',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="card flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center`}>
              <card.icon className={`w-6 h-6 ${card.color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{card.value}</p>
              <p className="text-sm text-gray-400">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="card col-span-2">
          <h3 className="section-title">最近任务</h3>
          {loading ? (
            <p className="text-gray-400">加载中...</p>
          ) : missions.length === 0 ? (
            <p className="text-gray-400 text-center py-8">暂无任务数据</p>
          ) : (
            <div className="space-y-2">
              {missions.map((mission) => (
                <div
                  key={mission.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-sonar-bg border border-sonar-border hover:border-sonar-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-sonar-accent" />
                    <div>
                      <p className="font-medium text-white">{mission.name}</p>
                      <p className="text-xs text-gray-400">{mission.file_name}</p>
                    </div>
                  </div>
                  <span className="px-2 py-1 text-xs rounded bg-sonar-border/50 text-gray-300">
                    {mission.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="section-title">目标类型分布</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48">
              <p className="text-gray-400">暂无检测数据</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
