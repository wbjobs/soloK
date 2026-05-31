import React, { useState, useEffect } from 'react'
import {
  FileText,
  Download,
  Map,
  PieChart,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { missionAPI, reportAPI } from '../services/api'
import {
  CLASS_COLORS,
  CLASS_NAMES_CN,
  formatTimestamp,
  downloadBlob,
} from '../utils/helpers'
import {
  PieChart as RePieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'

export default function Report() {
  const [missions, setMissions] = useState([])
  const [selectedMission, setSelectedMission] = useState(null)
  const [statistics, setStatistics] = useState(null)
  const [pieData, setPieData] = useState([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    loadMissions()
  }, [])

  const loadMissions = async () => {
    try {
      const res = await missionAPI.list({ limit: 50, status: 'processed' })
      setMissions(res || [])
    } catch (err) {
      console.error('Failed to load missions:', err)
    }
  }

  const handleMissionSelect = async (mission) => {
    setSelectedMission(mission)
    setLoading(true)

    try {
      const [statsRes, pieRes] = await Promise.all([
        missionAPI.getStatistics(mission.id),
        reportAPI.getPieChart(mission.id),
      ])

      setStatistics(statsRes)
      setPieData(
        Object.entries(statsRes?.class_counts || {}).map(([name, value]) => ({
          name: CLASS_NAMES_CN[name] || name,
          value,
          fill: CLASS_COLORS[name] || '#666',
        }))
      )
    } catch (err) {
      console.error('Failed to load report data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadPDF = async () => {
    if (!selectedMission) return

    setGenerating(true)
    try {
      const blob = await reportAPI.downloadPDF(selectedMission.id)
      downloadBlob(blob, `mission_${selectedMission.id}_report.pdf`)
    } catch (err) {
      console.error('Failed to download PDF:', err)
      alert('PDF 生成失败，请稍后重试')
    } finally {
      setGenerating(false)
    }
  }

  const handleDownloadTerrain = async (format) => {
    if (!selectedMission) return

    try {
      const blob = await reportAPI.getTerrainMap(selectedMission.id, format)
      const ext = format === 'geotiff' ? 'tif' : 'png'
      downloadBlob(blob, `terrain_${selectedMission.id}.${ext}`)
    } catch (err) {
      console.error('Failed to download terrain:', err)
    }
  }

  const barData = statistics
    ? Object.entries(statistics.class_counts || {}).map(([name, value]) => ({
        name: CLASS_NAMES_CN[name] || name,
        count: value,
        fill: CLASS_COLORS[name] || '#666',
      }))
    : []

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="section-title">选择任务</h3>
        {missions.length === 0 ? (
          <p className="text-gray-400 text-center py-8">暂无已处理的任务</p>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {missions.map((mission) => (
              <div
                key={mission.id}
                className={`p-4 rounded-lg cursor-pointer transition-all ${
                  selectedMission?.id === mission.id
                    ? 'bg-sonar-accent/20 border border-sonar-accent'
                    : 'bg-sonar-bg border border-sonar-border hover:border-sonar-accent/50'
                }`}
                onClick={() => handleMissionSelect(mission)}
              >
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-5 h-5 text-sonar-accent" />
                  <span className="font-medium text-white text-sm truncate">
                    {mission.name}
                  </span>
                </div>
                <p className="text-xs text-gray-400 truncate">{mission.file_name}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {formatTimestamp(mission.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedMission && (
        <div className="grid grid-cols-3 gap-6">
          <div className="card">
            <h3 className="section-title flex items-center gap-2">
              <PieChart className="w-5 h-5" />
              目标类型分布
            </h3>
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-8 h-8 text-sonar-accent animate-spin" />
              </div>
            ) : pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <RePieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </RePieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-48">
                <p className="text-gray-400">暂无数据</p>
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="section-title flex items-center gap-2">
              <BarChart className="w-5 h-5" />
              检测数量统计
            </h3>
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-8 h-8 text-sonar-accent animate-spin" />
              </div>
            ) : barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                  <XAxis dataKey="name" stroke="#888" fontSize={12} />
                  <YAxis stroke="#888" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#122240',
                      border: '1px solid #1e3a5f',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {barData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-48">
                <p className="text-gray-400">暂无数据</p>
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="section-title">任务统计</h3>
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-8 h-8 text-sonar-accent animate-spin" />
              </div>
            ) : statistics ? (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-sonar-bg border border-sonar-border">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">总检测数</span>
                    <span className="text-2xl font-bold text-white">
                      {statistics.total_detections}
                    </span>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-sonar-bg border border-sonar-border">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">跟踪目标</span>
                    <span className="text-2xl font-bold text-sonar-success">
                      {statistics.total_tracks}
                    </span>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-sonar-bg border border-sonar-border">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">测量数据</span>
                    <span className="text-2xl font-bold text-sonar-warning">
                      {statistics.total_measurements}
                    </span>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-sonar-bg border border-sonar-border">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">平均置信度</span>
                    <span className="text-2xl font-bold text-purple-400">
                      {(statistics.average_confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-48">
                <p className="text-gray-400">暂无数据</p>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedMission && !loading && (
        <div className="card">
          <h3 className="section-title">报告导出</h3>
          <div className="grid grid-cols-3 gap-4">
            <button
              className="flex flex-col items-center gap-3 p-6 rounded-lg bg-sonar-bg border border-sonar-border hover:border-sonar-accent/50 transition-colors"
              onClick={handleDownloadPDF}
              disabled={generating}
            >
              {generating ? (
                <Loader2 className="w-10 h-10 text-sonar-accent animate-spin" />
              ) : (
                <FileText className="w-10 h-10 text-sonar-accent" />
              )}
              <div className="text-center">
                <p className="font-medium text-white">PDF 调查报告</p>
                <p className="text-xs text-gray-400 mt-1">包含检测标注、统计和详情</p>
              </div>
              <span className="btn-secondary text-sm mt-2">
                <Download className="w-4 h-4 inline mr-1" />
                下载 PDF
              </span>
            </button>

            <button
              className="flex flex-col items-center gap-3 p-6 rounded-lg bg-sonar-bg border border-sonar-border hover:border-sonar-accent/50 transition-colors"
              onClick={() => handleDownloadTerrain('png')}
            >
              <Map className="w-10 h-10 text-green-400" />
              <div className="text-center">
                <p className="font-medium text-white">地形 PNG</p>
                <p className="text-xs text-gray-400 mt-1">彩色地形图（带检测标记）</p>
              </div>
              <span className="btn-secondary text-sm mt-2">
                <Download className="w-4 h-4 inline mr-1" />
                下载 PNG
              </span>
            </button>

            <button
              className="flex flex-col items-center gap-3 p-6 rounded-lg bg-sonar-bg border border-sonar-border hover:border-sonar-accent/50 transition-colors"
              onClick={() => handleDownloadTerrain('geotiff')}
            >
              <Map className="w-10 h-10 text-blue-400" />
              <div className="text-center">
                <p className="font-medium text-white">GeoTIFF 格式</p>
                <p className="text-xs text-gray-400 mt-1">地理参考地形数据</p>
              </div>
              <span className="btn-secondary text-sm mt-2">
                <Download className="w-4 h-4 inline mr-1" />
                下载 TIF
              </span>
            </button>
          </div>
        </div>
      )}

      {selectedMission && !loading && (
        <div className="card">
          <h3 className="section-title">目标分类统计</h3>
          {statistics && Object.keys(statistics.class_counts || {}).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-sonar-border">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                      目标类型
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                      检测数量
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                      占比
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">
                      颜色
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(statistics.class_counts || {}).map(([name, count]) => {
                    const total = statistics.total_detections || 1
                    const percentage = ((count / total) * 100).toFixed(1)
                    return (
                      <tr key={name} className="border-b border-sonar-border/50">
                        <td className="py-3 px-4 font-medium text-white">
                          {CLASS_NAMES_CN[name] || name}
                        </td>
                        <td className="py-3 px-4">{count}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-sonar-border rounded-full overflow-hidden max-w-xs">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${percentage}%`,
                                  backgroundColor: CLASS_COLORS[name] || '#666',
                                }}
                              />
                            </div>
                            <span className="text-sm text-gray-400">{percentage}%</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div
                            className="w-6 h-6 rounded"
                            style={{ backgroundColor: CLASS_COLORS[name] || '#666' }}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <AlertCircle className="w-6 h-6 text-gray-400 mr-2" />
              <p className="text-gray-400">暂无分类数据</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
