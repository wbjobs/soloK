import { useState } from 'react'
import { Settings, Users, Clock, Type, Palette, Square, ArrowRight } from 'lucide-react'
import MemberList from './MemberList'
import { useEditorStore, useSelectedNodeIds, useSelectedEdgeIds } from '../../store/editorStore'
import { useRoomOperations } from '../../store/roomStore'
import type { GraphNode, GraphEdge, NodeType, EdgeStyle } from '../../types/graph'
import dayjs from 'dayjs'

type TabType = 'properties' | 'members' | 'history'

const NODE_TYPES: { value: NodeType; label: string; color: string }[] = [
  { value: 'concept', label: '概念', color: '#3b82f6' },
  { value: 'topic', label: '主题', color: '#10b981' },
  { value: 'note', label: '笔记', color: '#f59e0b' },
  { value: 'resource', label: '资源', color: '#8b5cf6' },
]

const EDGE_STYLES: { value: EdgeStyle; label: string }[] = [
  { value: 'solid', label: '实线' },
  { value: 'dashed', label: '虚线' },
  { value: 'dotted', label: '点线' },
]

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
  '#06b6d4', '#ef4444', '#84cc16', '#a855f7', '#f97316'
]

export default function PropertyPanel() {
  const [activeTab, setActiveTab] = useState<TabType>('properties')
  
  const selectedNodeIds = useSelectedNodeIds()
  const selectedEdgeIds = useSelectedEdgeIds()
  const operations = useRoomOperations()
  
  const graphData = useEditorStore((state) => state.graphData)
  const updateNode = useEditorStore((state) => state.updateNode)
  const updateEdge = useEditorStore((state) => state.updateEdge)

  const selectedNodes = selectedNodeIds
    .map(id => graphData.nodes[id])
    .filter(Boolean) as GraphNode[]
  
  const selectedEdges = selectedEdgeIds
    .map(id => graphData.edges[id])
    .filter(Boolean) as GraphEdge[]

  const hasSelection = selectedNodes.length > 0 || selectedEdges.length > 0
  const isSingleNode = selectedNodes.length === 1
  const isSingleEdge = selectedEdges.length === 1

  const tabs: { key: TabType; label: string; icon: typeof Settings }[] = [
    { key: 'properties', label: '属性', icon: Settings },
    { key: 'members', label: '成员', icon: Users },
    { key: 'history', label: '历史', icon: Clock },
  ]

  const handleNodeUpdate = (nodeId: string, updates: Partial<GraphNode>) => {
    updateNode(nodeId, updates)
  }

  const handleEdgeUpdate = (edgeId: string, updates: Partial<GraphEdge>) => {
    updateEdge(edgeId, updates)
  }

  const getOperationLabel = (op: any) => {
    const typeMap: Record<string, string> = {
      'node:add': '添加节点',
      'node:update': '更新节点',
      'node:remove': '删除节点',
      'edge:add': '添加连线',
      'edge:update': '更新连线',
      'edge:remove': '删除连线',
    }
    return typeMap[op.operationType] || op.operationType
  }

  return (
    <div className="absolute right-4 top-4 bottom-4 w-80 glass-card p-0 flex flex-col animate-slide-in overflow-hidden">
      <div className="flex border-b border-white/10">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`
              flex-1 flex items-center justify-center gap-2 py-3 px-4
              text-sm font-medium transition-all duration-200
              border-b-2 -mb-px
              ${activeTab === key 
                ? 'tab-active border-neon-blue' 
                : 'text-gray-400 hover:text-white border-transparent hover:bg-white/5'}
            `}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        {activeTab === 'properties' && (
          <div className="animate-fade-in">
            {!hasSelection ? (
              <div className="text-center py-12 text-gray-500">
                <Square size={48} className="mx-auto mb-3 opacity-30" />
                <p>选择节点或连线以编辑属性</p>
              </div>
            ) : (
              <div className="space-y-6">
                {isSingleNode && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                      <div 
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ 
                          backgroundColor: selectedNodes[0].color + '33',
                          border: `2px solid ${selectedNodes[0].color}`
                        }}
                      >
                        <Square size={20} style={{ color: selectedNodes[0].color }} />
                      </div>
                      <div>
                        <h4 className="font-medium text-white">节点属性</h4>
                        <p className="text-xs text-gray-400">ID: {selectedNodes[0].id.slice(0, 8)}...</p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        <Type size={14} className="inline mr-1" />
                        标签
                      </label>
                      <input
                        type="text"
                        value={selectedNodes[0].label}
                        onChange={(e) => handleNodeUpdate(selectedNodes[0].id, { label: e.target.value })}
                        className="input-field"
                        placeholder="输入节点标签"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        <Square size={14} className="inline mr-1" />
                        类型
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {NODE_TYPES.map((type) => (
                          <button
                            key={type.value}
                            onClick={() => handleNodeUpdate(selectedNodes[0].id, { 
                              type: type.value,
                              color: type.color 
                            })}
                            className={`
                              p-2 rounded-lg text-sm transition-all duration-200
                              ${selectedNodes[0].type === type.value
                                ? 'neon-border bg-white/5'
                                : 'glass glass-hover'}
                            `}
                            style={{ 
                              borderColor: selectedNodes[0].type === type.value ? type.color : undefined 
                            }}
                          >
                            <span 
                              className="inline-block w-3 h-3 rounded-full mr-2"
                              style={{ backgroundColor: type.color }}
                            />
                            {type.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        <Palette size={14} className="inline mr-1" />
                        颜色
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {COLORS.map((color) => (
                          <button
                            key={color}
                            onClick={() => handleNodeUpdate(selectedNodes[0].id, { color })}
                            className={`
                              w-8 h-8 rounded-lg transition-all duration-200
                              ${selectedNodes[0].color === color 
                                ? 'ring-2 ring-white ring-offset-2 ring-offset-dark-800 scale-110' 
                                : 'hover:scale-110'}
                            `}
                            style={{ 
                              backgroundColor: color,
                              boxShadow: `0 0 10px ${color}66`
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">X 位置</label>
                        <input
                          type="number"
                          value={Math.round(selectedNodes[0].x)}
                          onChange={(e) => handleNodeUpdate(selectedNodes[0].id, { 
                            x: Number(e.target.value) 
                          })}
                          className="input-field text-sm py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Y 位置</label>
                        <input
                          type="number"
                          value={Math.round(selectedNodes[0].y)}
                          onChange={(e) => handleNodeUpdate(selectedNodes[0].id, { 
                            y: Number(e.target.value) 
                          })}
                          className="input-field text-sm py-2"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">宽度</label>
                        <input
                          type="number"
                          value={selectedNodes[0].width}
                          onChange={(e) => handleNodeUpdate(selectedNodes[0].id, { 
                            width: Math.max(50, Number(e.target.value))
                          })}
                          className="input-field text-sm py-2"
                          min="50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">高度</label>
                        <input
                          type="number"
                          value={selectedNodes[0].height}
                          onChange={(e) => handleNodeUpdate(selectedNodes[0].id, { 
                            height: Math.max(30, Number(e.target.value))
                          })}
                          className="input-field text-sm py-2"
                          min="30"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {isSingleEdge && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                      <div 
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ 
                          backgroundColor: (selectedEdges[0].color || '#3b82f6') + '33',
                          border: `2px solid ${selectedEdges[0].color || '#3b82f6'}`
                        }}
                      >
                        <ArrowRight size={20} style={{ color: selectedEdges[0].color || '#3b82f6' }} />
                      </div>
                      <div>
                        <h4 className="font-medium text-white">连线属性</h4>
                        <p className="text-xs text-gray-400">ID: {selectedEdges[0].id.slice(0, 8)}...</p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        <Type size={14} className="inline mr-1" />
                        标签
                      </label>
                      <input
                        type="text"
                        value={selectedEdges[0].label || ''}
                        onChange={(e) => handleEdgeUpdate(selectedEdges[0].id, { label: e.target.value })}
                        className="input-field"
                        placeholder="输入连线标签（可选）"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        样式
                      </label>
                      <div className="flex gap-2">
                        {EDGE_STYLES.map((style) => (
                          <button
                            key={style.value}
                            onClick={() => handleEdgeUpdate(selectedEdges[0].id, { style: style.value })}
                            className={`
                              flex-1 p-2 rounded-lg text-sm transition-all duration-200
                              ${selectedEdges[0].style === style.value
                                ? 'neon-border bg-white/5'
                                : 'glass glass-hover'}
                            `}
                          >
                            {style.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        <Palette size={14} className="inline mr-1" />
                        颜色
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {COLORS.map((color) => (
                          <button
                            key={color}
                            onClick={() => handleEdgeUpdate(selectedEdges[0].id, { color })}
                            className={`
                              w-8 h-8 rounded-lg transition-all duration-200
                              ${selectedEdges[0].color === color 
                                ? 'ring-2 ring-white ring-offset-2 ring-offset-dark-800 scale-110' 
                                : 'hover:scale-110'}
                            `}
                            style={{ 
                              backgroundColor: color,
                              boxShadow: `0 0 10px ${color}66`
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-white/5 text-sm text-gray-400">
                      <div className="flex justify-between mb-1">
                        <span>起点:</span>
                        <span className="font-mono text-xs">{selectedEdges[0].source.slice(0, 8)}...</span>
                      </div>
                      <div className="flex justify-between">
                        <span>终点:</span>
                        <span className="font-mono text-xs">{selectedEdges[0].target.slice(0, 8)}...</span>
                      </div>
                    </div>
                  </div>
                )}

                {selectedNodes.length > 1 && (
                  <div className="text-center py-8 text-gray-400">
                    <p>已选择 {selectedNodes.length} 个节点</p>
                    <p className="text-sm mt-1">批量编辑功能开发中...</p>
                  </div>
                )}

                {selectedEdges.length > 1 && (
                  <div className="text-center py-8 text-gray-400">
                    <p>已选择 {selectedEdges.length} 条连线</p>
                    <p className="text-sm mt-1">批量编辑功能开发中...</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="animate-fade-in">
            <MemberList />
          </div>
        )}

        {activeTab === 'history' && (
          <div className="animate-fade-in">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={18} className="text-neon-purple" />
              <h3 className="font-medium text-white">操作历史</h3>
              <span className="ml-auto text-sm text-gray-400">
                {operations.length} 条
              </span>
            </div>

            <div className="space-y-2">
              {operations.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Clock size={48} className="mx-auto mb-3 opacity-30" />
                  <p>暂无操作记录</p>
                </div>
              ) : (
                operations.slice(0, 50).map((op, index) => (
                  <div
                    key={op.id || index}
                    className="p-3 rounded-lg glass glass-hover transition-all duration-200"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-white">
                        {getOperationLabel(op)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {dayjs(op.createdAt).format('HH:mm:ss')}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">
                      版本 {op.version} · {op.memberId.slice(0, 8)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
