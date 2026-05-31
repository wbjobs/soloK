import { useState } from 'react'
import { Link } from 'react-router-dom'
import { GitBranch, Users, Zap, Shield, Plus, LogIn, ArrowRight, Sparkles } from 'lucide-react'
import CreateRoomModal from '../components/room/CreateRoomModal'
import JoinRoomModal from '../components/room/JoinRoomModal'

const FEATURES = [
  {
    icon: GitBranch,
    title: '实时协作',
    description: '多人同时编辑知识图谱，所见即所得',
    color: 'from-neon-blue to-neon-cyan'
  },
  {
    icon: Zap,
    title: 'CRDT 技术',
    description: '基于 Yjs 的无冲突数据同步技术',
    color: 'from-neon-purple to-neon-pink'
  },
  {
    icon: Shield,
    title: '数据安全',
    description: '操作历史可追溯，快照备份随时恢复',
    color: 'from-neon-green to-neon-blue'
  },
  {
    icon: Users,
    title: '多人协同',
    description: '实时查看他人光标，协作效率翻倍',
    color: 'from-neon-yellow to-neon-green'
  }
]

export default function HomePage() {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-50" />
      
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-neon-blue/20 rounded-full blur-3xl animate-pulse-slow" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-neon-purple/20 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }} />
      
      <div className="relative z-10">
        <header className="py-6 px-8">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-blue to-neon-purple flex items-center justify-center">
                <GitBranch className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold gradient-text">GraphFlow</span>
            </div>
            
            <div className="flex items-center gap-4">
              <Link
                to="/rooms"
                className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
              >
                浏览房间
              </Link>
              <button
                onClick={() => setShowJoinModal(true)}
                className="btn-secondary px-4 py-2 text-sm"
              >
                加入房间
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn-primary px-4 py-2 text-sm flex items-center gap-2"
              >
                <Plus size={16} />
                创建房间
              </button>
            </div>
          </div>
        </header>

        <main>
          <section className="py-20 px-8">
            <div className="max-w-5xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8 animate-fade-in">
                <Sparkles className="w-4 h-4 text-neon-yellow" />
                <span className="text-sm text-gray-300">下一代知识图谱协作平台</span>
              </div>
              
              <h1 className="text-6xl font-bold mb-6 animate-slide-up">
                <span className="text-white">构建你的</span>
                <br />
                <span className="gradient-text">知识网络</span>
              </h1>
              
              <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto animate-slide-up" style={{ animationDelay: '0.1s' }}>
                实时协作的知识图谱编辑器，基于 CRDT 技术实现无冲突同步，
                支持多人同时编辑、操作历史回放、数据快照管理。
              </p>
              
              <div className="flex items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="btn-primary px-8 py-4 text-lg flex items-center gap-2"
                >
                  <Plus size={20} />
                  开始创建
                  <ArrowRight size={20} />
                </button>
                <button
                  onClick={() => setShowJoinModal(true)}
                  className="btn-secondary px-8 py-4 text-lg flex items-center gap-2"
                >
                  <LogIn size={20} />
                  加入房间
                </button>
              </div>
            </div>
          </section>

          <section className="py-20 px-8">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-3xl font-bold text-center text-white mb-4">
                核心<span className="gradient-text">特性</span>
              </h2>
              <p className="text-gray-400 text-center mb-12 max-w-2xl mx-auto">
                采用先进技术构建，提供流畅的协作编辑体验
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {FEATURES.map((feature, index) => (
                  <div
                    key={feature.title}
                    className="glass-card p-6 hover:scale-105 transition-all duration-300 group animate-slide-up"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.color} 
                      flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                      <feature.icon className="w-7 h-7 text-white" />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-gray-400 text-sm">
                      {feature.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="py-20 px-8">
            <div className="max-w-4xl mx-auto">
              <div className="glass-card p-12 text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-neon-blue/10 via-transparent to-neon-purple/10" />
                
                <div className="relative z-10">
                  <h2 className="text-3xl font-bold text-white mb-4">
                    准备好开始了吗？
                  </h2>
                  <p className="text-gray-400 mb-8 max-w-xl mx-auto">
                    创建你的第一个知识图谱房间，邀请团队成员一起协作，
                    让知识可视化变得简单高效。
                  </p>
                  
                  <div className="flex items-center justify-center gap-4">
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="btn-primary px-8 py-4 flex items-center gap-2"
                    >
                      <Plus size={20} />
                      创建房间
                    </button>
                    <Link
                      to="/rooms"
                      className="btn-secondary px-8 py-4 flex items-center gap-2"
                    >
                      浏览房间
                      <ArrowRight size={20} />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="py-8 px-8 border-t border-white/10">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-neon-blue to-neon-purple flex items-center justify-center">
                <GitBranch className="w-5 h-5 text-white" />
              </div>
              <span className="text-gray-400 text-sm">
                © 2024 GraphFlow. 构建知识的未来。
              </span>
            </div>
            
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <a href="#" className="hover:text-neon-blue transition-colors">文档</a>
              <a href="#" className="hover:text-neon-blue transition-colors">API</a>
              <a href="#" className="hover:text-neon-blue transition-colors">GitHub</a>
            </div>
          </div>
        </footer>
      </div>

      <CreateRoomModal 
        isOpen={showCreateModal} 
        onClose={() => setShowCreateModal(false)} 
      />
      <JoinRoomModal 
        isOpen={showJoinModal} 
        onClose={() => setShowJoinModal(false)} 
      />
    </div>
  )
}
