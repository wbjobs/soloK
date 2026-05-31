import React, { useState, useEffect } from 'react'
import {
  Search,
  Trash2,
  Eye,
  RefreshCw,
  Download,
  FileText,
  Play,
  Pagination,
} from 'lucide-react'
import { missionAPI, detectAPI } from '../services/api'
import {
  CLASS_NAMES_CN,
  STATUS_COLORS,
  MISSION_STATUS,
  formatTimestamp,
} from '../utils/helpers'

export default function Missions() {
  const [missions, setMissions] = useState([])
  const [filteredMissions, setFilteredMissions] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedMission, setSelectedMission] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)

  useEffect(() => {
    loadMissions()
  }, [])

  useEffect(() => {
    filterMissions()
  }, [missions, searchQuery, statusFilter])

  const loadMissions = async () => {
    try {
      const res = await missionAPI.list({ limit: 100 })
      setMissions(res || [])
    } catch (err) {
      console.error('Failed to load missions:', err)
    } finally {
      setLoading(false)
    }
  }

  const filterMissions = () => {
    let filtered = missions

    if (searchQuery) {
      filtered = filtered.filter(
        (m) =>
          m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.file_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    if (statusFilter) {
      filtered = filtered.filter((m) => m.status === statusFilter)
    }

    setFilteredMissions(filtered)
  }

  const handleDelete = async (missionId) => {
    if (!confirm('确定删除此任务？')) return

    try {
      await missionAPI.delete(missionId)
      loadMissions()
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  const handleRunDetection = async (missionId) => {
    try {
      await detectAPI.detectMission(missionId)
      loadMissions()
    } catch (err) {
      console.error('Detection failed:', err)
    }
  }

  const handleViewDetails = (mission) => {
    setSelectedMission(mission)
  }

  const paginatedMissions = filteredMissions.slice(
    (page - 1) * pageSize,
    page * pageSize
  )

  const totalPages = Math.ceil(filteredMissions.length / pageSize)

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="section-title mb-0">任务列表</h3>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                className="input-field pl-10 w-64"
                placeholder="搜索任务..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              className="input-field w-32"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">全部状态</option>
              <option value="pending">待处理</option>
              <option value="uploaded">已上传</option>
              <option value="processed">已处理</option>
              <option value="error">错误</option>
            </select>
            <button className="btn-secondary" onClick={loadMissions}>
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-sonar-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : paginatedMissions.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 mx-auto text-gray-600 mb-4" />
            <p className="text-gray-400">暂无任务数据</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-sonar-border">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">ID</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">任务名称</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">文件名</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">格式</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">状态</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">创建时间</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedMissions.map((mission) => (
                    <tr
                      key={mission.id}
                      className="border-b border-sonar-border/50 hover:bg-sonar-border/20 transition-colors"
                    >
                      <td className="py-3 px-4 text-sm font-mono text-gray-400">{mission.id}</td>
                      <td className="py-3 px-4 text-sm font-medium text-white">{mission.name}</td>
                      <td className="py-3 px-4 text-sm text-gray-300 truncate max-w-xs">
                        {mission.file_name}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-1 text-xs rounded bg-sonar-border/50 text-gray-300 uppercase">
                          {mission.file_format}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-1 text-xs rounded-full ${STATUS_COLORS[mission.status] || 'bg-gray-500'}`}>
                          {MISSION_STATUS[mission.status] || mission.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-400">
                        {formatTimestamp(mission.created_at)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <button
                            className="p-1.5 rounded hover:bg-sonar-border transition-colors"
                            title="查看详情"
                            onClick={() => handleViewDetails(mission)}
                          >
                            <Eye className="w-4 h-4 text-gray-400" />
                          </button>
                          <button
                            className="p-1.5 rounded hover:bg-sonar-border transition-colors"
                            title="运行检测"
                            onClick={() => handleRunDetection(mission.id)}
                          >
                            <Play className="w-4 h-4 text-sonar-success" />
                          </button>
                          <button
                            className="p-1.5 rounded hover:bg-sonar-border transition-colors"
                            title="下载报告"
                          >
                            <Download className="w-4 h-4 text-sonar-accent" />
                          </button>
                          <button
                            className="p-1.5 rounded hover:bg-red-500/20 transition-colors"
                            title="删除"
                            onClick={() => handleDelete(mission.id)}
                          >
                            <Trash2 className="w-4 h-4 text-sonar-danger" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  className="btn-secondary text-sm"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                >
                  上一页
                </button>
                <span className="text-sm text-gray-400">
                  {page} / {totalPages}
                </span>
                <button
                  className="btn-secondary text-sm"
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {selectedMission && (
        <MissionDetailsModal
          mission={selectedMission}
          onClose={() => setSelectedMission(null)}
        />
      )}
    </div>
  )
}

function MissionDetailsModal({ mission, onClose }) {
  const [detections, setDetections] = useState([])
  const [tracks, setTracks] = useState([])
  const [measurements, setMeasurements] = useState([])
  const [statistics, setStatistics] = useState(null)

  useEffect(() => {
    loadDetails()
  }, [mission])

  const loadDetails = async () => {
    try {
      const [detRes, trkRes, measRes, statsRes] = await Promise.all([
        missionAPI.getDetections(mission.id),
        missionAPI.getTracks(mission.id),
        missionAPI.getMeasurements(mission.id),
        missionAPI.getStatistics(mission.id),
      ])
      setDetections(detRes || [])
      setTracks(trkRes || [])
      setMeasurements(measRes || [])
      setStatistics(statsRes)
    } catch (err) {
      console.error('Failed to load details:', err)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-sonar-panel rounded-xl border border-sonar-border w-4/5 max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-sonar-border">
          <h3 className="text-lg font-semibold text-white">任务详情 - {mission.name}</h3>
          <button
            className="p-2 rounded hover:bg-sonar-border transition-colors"
            onClick={onClose}
          >
            <span className="text-gray-400 text-xl">&times;</span>
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(90vh-80px)]">
          {statistics && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="p-4 rounded-lg bg-sonar-bg border border-sonar-border">
                <p className="text-2xl font-bold text-sonar-accent">{statistics.total_detections}</p>
                <p className="text-sm text-gray-400">总检测数</p>
              </div>
              <div className="p-4 rounded-lg bg-sonar-bg border border-sonar-border">
                <p className="text-2xl font-bold text-sonar-success">{statistics.total_tracks}</p>
                <p className="text-sm text-gray-400">跟踪目标</p>
              </div>
              <div className="p-4 rounded-lg bg-sonar-bg border border-sonar-border">
                <p className="text-2xl font-bold text-sonar-warning">{statistics.total_measurements}</p>
                <p className="text-sm text-gray-400">测量数据</p>
              </div>
              <div className="p-4 rounded-lg bg-sonar-bg border border-sonar-border">
                <p className="text-2xl font-bold text-purple-400">
                  {(statistics.average_confidence * 100).toFixed(1)}%
                </p>
                <p className="text-sm text-gray-400">平均置信度</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-6">
            <div className="card">
              <h4 className="text-sm font-semibold text-sonar-accent mb-3">检测结果</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {detections.map((det, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span>{CLASS_NAMES_CN[det.class_name] || det.class_name}</span>
                    <span className="text-gray-400">{(det.confidence * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h4 className="text-sm font-semibold text-sonar-accent mb-3">跟踪目标</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {tracks.map((track, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span>ID: {track.track_id}</span>
                    <span className="text-gray-400">{CLASS_NAMES_CN[track.class_name] || track.class_name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h4 className="text-sm font-semibold text-sonar-accent mb-3">测量数据</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {measurements.map((meas, idx) => (
                  <div key={idx} className="text-sm">
                    <span className="text-gray-400">#{meas.detection_id}: </span>
                    <span>{meas.actual_length?.toFixed(2) || '-'}m</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 card">
            <h4 className="text-sm font-semibold text-sonar-accent mb-3">任务信息</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">文件名: </span>
                <span>{mission.file_name}</span>
              </div>
              <div>
                <span className="text-gray-400">格式: </span>
                <span>{mission.file_format}</span>
              </div>
              <div>
                <span className="text-gray-400">状态: </span>
                <span>{MISSION_STATUS[mission.status] || mission.status}</span>
              </div>
              <div>
                <span className="text-gray-400">创建时间: </span>
                <span>{formatTimestamp(mission.created_at)}</span>
              </div>
              {mission.description && (
                <div className="col-span-2">
                  <span className="text-gray-400">描述: </span>
                  <span>{mission.description}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
