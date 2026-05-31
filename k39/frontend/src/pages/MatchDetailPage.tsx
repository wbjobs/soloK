import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store';
import { fetchMatch, fetchAnalysisStatus } from '../store/matchSlice';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend } from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import type { Match, Event } from '../types';
import { EventType } from '../types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend);

const MatchDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeTab, setActiveTab] = useState<'video' | 'events' | 'tactical' | 'analysis'>('video');

  const { currentMatch, analysisStatus, loading } = useAppSelector((state) => state.match);

  useEffect(() => {
    if (id) {
      dispatch(fetchMatch(id));
      dispatch(fetchAnalysisStatus(id));
    }
  }, [dispatch, id]);

  useEffect(() => {
    if (id && currentMatch?.status === 'processing') {
      const interval = setInterval(() => {
        dispatch(fetchAnalysisStatus(id));
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [dispatch, id, currentMatch?.status]);

  const getStatusBadge = (status: Match['status']) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      processing: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      error: 'bg-red-100 text-red-800',
    };
    const labels = {
      pending: '等待处理',
      processing: '分析中',
      completed: '已完成',
      error: '分析失败',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const mockEvents: Event[] = [
    { id: '1', matchId: id || '', type: EventType.PASS, timestamp: 120, half: 1, minute: 2, second: 0, teamId: 'home', playerName: '张三', x: 50, y: 30, endX: 70, endY: 40, outcome: 'success', createdAt: new Date(), updatedAt: new Date() },
    { id: '2', matchId: id || '', type: EventType.SHOT, timestamp: 300, half: 1, minute: 5, second: 0, teamId: 'home', playerName: '李四', x: 85, y: 50, outcome: 'success', createdAt: new Date(), updatedAt: new Date() },
    { id: '3', matchId: id || '', type: EventType.TACKLE, timestamp: 600, half: 1, minute: 10, second: 0, teamId: 'away', playerName: '王五', x: 30, y: 60, outcome: 'success', createdAt: new Date(), updatedAt: new Date() },
    { id: '4', matchId: id || '', type: EventType.FOUL, timestamp: 900, half: 1, minute: 15, second: 0, teamId: 'away', playerName: '赵六', x: 60, y: 45, outcome: 'failed', createdAt: new Date(), updatedAt: new Date() },
  ];

  const possessionData = {
    labels: [currentMatch?.homeTeam || '主队', currentMatch?.awayTeam || '客队'],
    datasets: [
      {
        data: analysisStatus ? [analysisStatus.possession.home, analysisStatus.possession.away] : [50, 50],
        backgroundColor: ['#3B82F6', '#EF4444'],
        borderWidth: 0,
      },
    ],
  };

  const timelineData = {
    labels: ['0\'', '15\'', '30\'', '45\'', '60\'', '75\'', '90\''],
    datasets: [
      {
        label: '传球次数',
        data: [12, 19, 25, 30, 42, 55, 68],
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
      },
      {
        label: '射门次数',
        data: [1, 2, 3, 5, 6, 8, 10],
        borderColor: '#EF4444',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        tension: 0.4,
      },
    ],
  };

  const getEventIcon = (type: Event['type']) => {
    switch (type) {
      case 'pass':
        return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>;
      case 'shot':
        return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>;
      case 'tackle':
        return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>;
      default:
        return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
    }
  };

  if (loading && !currentMatch) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/matches')}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{currentMatch?.title}</h1>
            <div className="flex items-center space-x-2 mt-1">
              {getStatusBadge(currentMatch?.status || 'pending')}
              <span className="text-sm text-gray-500">
                {new Date(currentMatch?.date || new Date()).toLocaleDateString('zh-CN')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {currentMatch?.status === 'completed' && (
            <>
              <button
                onClick={() => navigate(`/tactical/${id}`)}
                className="bg-purple-100 text-purple-700 px-4 py-2 rounded-lg font-medium hover:bg-purple-200 transition-colors flex items-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <span>战术板</span>
              </button>
              <button
                onClick={() => navigate(`/analysis/${id}`)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span>分析报告</span>
              </button>
              <button
                onClick={() => navigate(`/3d/${id}`)}
                className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                </svg>
                <span>3D动画</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-center space-x-8">
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">{currentMatch?.homeTeam}</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-gray-800">
              {currentMatch?.homeScore} - {currentMatch?.awayScore}
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-red-600">{currentMatch?.awayTeam}</div>
          </div>
        </div>
      </div>

      {currentMatch?.status === 'processing' && analysisStatus && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
              <div>
                <p className="font-medium text-blue-800">正在分析比赛视频...</p>
                <p className="text-sm text-blue-600">
                  已处理 {analysisStatus.processedFrames} / {analysisStatus.totalFrames} 帧
                </p>
              </div>
            </div>
            <span className="text-2xl font-bold text-blue-600">{analysisStatus.progress}%</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${analysisStatus.progress}%` }}
            ></div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'video', label: '视频播放' },
              { id: 'events', label: '事件列表' },
              { id: 'tactical', label: '战术板' },
              { id: 'analysis', label: '数据分析' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'video' && (
            <div className="space-y-4">
              <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                {currentMatch?.videoUrl ? (
                  <video
                    ref={videoRef}
                    src={currentMatch.videoUrl}
                    controls
                    className="w-full h-full"
                    poster={currentMatch.thumbnailUrl}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-900">
                    <div className="text-center">
                      <svg className="w-16 h-16 text-gray-600 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <p className="text-gray-400 mt-4">暂无视频</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'events' && (
            <div className="space-y-3">
              {mockEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    event.teamId === 'home' ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'
                  }`}>
                    {getEventIcon(event.type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-800">{event.playerName}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        event.outcome === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {event.outcome === 'success' ? '成功' : '失败'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      {event.type === 'pass' ? '传球' : event.type === 'shot' ? '射门' : event.type === 'tackle' ? '抢断' : '犯规'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-800">{event.minute}'</p>
                    <p className="text-xs text-gray-500">上半场</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'tactical' && (
            <div className="text-center py-12">
              <svg className="w-16 h-16 text-gray-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <p className="text-gray-500 mt-4">在战术板中查看详细战术分析</p>
              <button
                onClick={() => navigate(`/tactical/${id}`)}
                className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                打开战术板
              </button>
            </div>
          )}

          {activeTab === 'analysis' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">控球率</h3>
                <div className="w-64 h-64 mx-auto">
                  <Doughnut data={possessionData} options={{ plugins: { legend: { position: 'bottom' } } }} />
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">比赛趋势</h3>
                <div className="h-64">
                  <Line data={timelineData} options={{ plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }} />
                </div>
              </div>

              <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-blue-600">{analysisStatus?.passes.home || 0}</p>
                  <p className="text-sm text-blue-600 mt-1">主队传球</p>
                </div>
                <div className="bg-red-50 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-red-600">{analysisStatus?.passes.away || 0}</p>
                  <p className="text-sm text-red-600 mt-1">客队传球</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-blue-600">{analysisStatus?.shots.home || 0}</p>
                  <p className="text-sm text-blue-600 mt-1">主队射门</p>
                </div>
                <div className="bg-red-50 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-red-600">{analysisStatus?.shots.away || 0}</p>
                  <p className="text-sm text-red-600 mt-1">客队射门</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MatchDetailPage;
