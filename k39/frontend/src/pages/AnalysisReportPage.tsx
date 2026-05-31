import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store';
import { fetchMatch, fetchAnalysisStatus } from '../store/matchSlice';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line, Doughnut, Bar, Radar } from 'react-chartjs-2';
import type { PlayerStats, Player } from '../types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

const AnalysisReportPage = () => {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [activeTab, setActiveTab] = useState<'overview' | 'players' | 'events' | 'heatmap'>('overview');
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  const { currentMatch, analysisStatus, loading } = useAppSelector((state) => state.match);

  useEffect(() => {
    if (matchId) {
      dispatch(fetchMatch(matchId));
      dispatch(fetchAnalysisStatus(matchId));
    }
  }, [dispatch, matchId]);

  const mockPlayers: Player[] = [
    { id: '1', matchId: matchId || '', teamId: 'home', jerseyNumber: 1, name: '门将', position: 'GK', isStarting: true, minutesPlayed: 90 },
    { id: '2', matchId: matchId || '', teamId: 'home', jerseyNumber: 4, name: '张三', position: 'CB', isStarting: true, minutesPlayed: 90 },
    { id: '3', matchId: matchId || '', teamId: 'home', jerseyNumber: 5, name: '李四', position: 'CB', isStarting: true, minutesPlayed: 90 },
    { id: '4', matchId: matchId || '', teamId: 'home', jerseyNumber: 8, name: '王五', position: 'CM', isStarting: true, minutesPlayed: 85 },
    { id: '5', matchId: matchId || '', teamId: 'home', jerseyNumber: 10, name: '赵六', position: 'ST', isStarting: true, minutesPlayed: 90 },
  ];

  const mockPlayerStats: PlayerStats[] = mockPlayers.map((player) => ({
    playerId: player.id,
    matchId: matchId || '',
    totalDistance: 8000 + Math.random() * 4000,
    highIntensityDistance: 500 + Math.random() * 500,
    sprintCount: 10 + Math.floor(Math.random() * 20),
    maxSpeed: 28 + Math.random() * 8,
    averageSpeed: 5 + Math.random() * 3,
    passes: 20 + Math.floor(Math.random() * 60),
    successfulPasses: 15 + Math.floor(Math.random() * 50),
    shots: Math.floor(Math.random() * 5),
    shotsOnTarget: Math.floor(Math.random() * 3),
    tackles: Math.floor(Math.random() * 10),
    interceptions: Math.floor(Math.random() * 8),
    heatmap: [],
  }));

  const possessionData = {
    labels: [currentMatch?.homeTeam || '主队', currentMatch?.awayTeam || '客队'],
    datasets: [
      {
        data: analysisStatus ? [analysisStatus.possession.home, analysisStatus.possession.away] : [55, 45],
        backgroundColor: ['#3B82F6', '#EF4444'],
        borderWidth: 0,
      },
    ],
  };

  const shotsData = {
    labels: [currentMatch?.homeTeam || '主队', currentMatch?.awayTeam || '客队'],
    datasets: [
      {
        label: '射门',
        data: analysisStatus ? [analysisStatus.shots.home, analysisStatus.shots.away] : [12, 8],
        backgroundColor: '#3B82F6',
      },
      {
        label: '射正',
        data: [6, 3],
        backgroundColor: '#22C55E',
      },
    ],
  };

  const passesData = {
    labels: [currentMatch?.homeTeam || '主队', currentMatch?.awayTeam || '客队'],
    datasets: [
      {
        label: '传球数',
        data: analysisStatus ? [analysisStatus.passes.home, analysisStatus.passes.away] : [450, 380],
        backgroundColor: ['#3B82F6', '#EF4444'],
      },
    ],
  };

  const timelineData = {
    labels: ['0\'', '15\'', '30\'', '45\'', '60\'', '75\'', '90\''],
    datasets: [
      {
        label: '主队控球率',
        data: [58, 56, 54, 55, 57, 56, 55],
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: '客队控球率',
        data: [42, 44, 46, 45, 43, 44, 45],
        borderColor: '#EF4444',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const radarData = {
    labels: ['控球率', '射门', '传球', '抢断', '拦截', '跑动距离'],
    datasets: [
      {
        label: currentMatch?.homeTeam || '主队',
        data: [55, 12, 450, 18, 12, 105],
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        borderColor: '#3B82F6',
        borderWidth: 2,
      },
      {
        label: currentMatch?.awayTeam || '客队',
        data: [45, 8, 380, 15, 10, 98],
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        borderColor: '#EF4444',
        borderWidth: 2,
      },
    ],
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
            onClick={() => navigate(`/matches/${matchId}`)}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">分析报告</h1>
            <p className="text-sm text-gray-500 mt-1">
              {currentMatch?.homeTeam} vs {currentMatch?.awayTeam}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => navigate(`/tactical/${matchId}`)}
            className="bg-purple-100 text-purple-700 px-4 py-2 rounded-lg font-medium hover:bg-purple-200 transition-colors flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <span>战术板</span>
          </button>
          <button
            onClick={() => navigate(`/3d/${matchId}`)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
            </svg>
            <span>3D动画</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-center space-x-16">
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">{currentMatch?.homeTeam}</div>
            <div className="text-5xl font-bold text-gray-800 mt-2">{currentMatch?.homeScore}</div>
          </div>
          <div className="text-4xl font-bold text-gray-300">VS</div>
          <div className="text-center">
            <div className="text-3xl font-bold text-red-600">{currentMatch?.awayTeam}</div>
            <div className="text-5xl font-bold text-gray-800 mt-2">{currentMatch?.awayScore}</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'overview', label: '总览' },
              { id: 'players', label: '球员数据' },
              { id: 'events', label: '事件时间线' },
              { id: 'heatmap', label: '热力图' },
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
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-blue-600">{analysisStatus?.possession.home || 55}%</p>
                  <p className="text-sm text-blue-600 mt-1">主队控球率</p>
                </div>
                <div className="bg-red-50 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-red-600">{analysisStatus?.possession.away || 45}%</p>
                  <p className="text-sm text-red-600 mt-1">客队控球率</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-blue-600">{analysisStatus?.shots.home || 12}</p>
                  <p className="text-sm text-blue-600 mt-1">主队射门</p>
                </div>
                <div className="bg-red-50 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-red-600">{analysisStatus?.shots.away || 8}</p>
                  <p className="text-sm text-red-600 mt-1">客队射门</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">控球率对比</h3>
                  <div className="w-64 h-64 mx-auto">
                    <Doughnut data={possessionData} options={{ plugins: { legend: { position: 'bottom' } } }} />
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">射门对比</h3>
                  <div className="h-64">
                    <Bar data={shotsData} options={{ plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }} />
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">控球率趋势</h3>
                  <div className="h-64">
                    <Line data={timelineData} options={{ plugins: { legend: { position: 'bottom' } }, scales: { y: { min: 30, max: 70 } } }} />
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">综合能力雷达图</h3>
                  <div className="h-64">
                    <Radar data={radarData} options={{ plugins: { legend: { position: 'bottom' } } }} />
                  </div>
                </div>

                <div className="lg:col-span-2 bg-gray-50 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">传球数对比</h3>
                  <div className="h-64">
                    <Bar data={passesData} options={{ plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'players' && (
            <div className="space-y-6">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-600">球员</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-600">位置</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-600">出场时间</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-600">总跑动距离(km)</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-600">高强度跑动(m)</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-600">冲刺次数</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-600">最高速度(km/h)</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-600">传球成功率</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-600">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockPlayers.map((player, index) => {
                      const stats = mockPlayerStats[index];
                      return (
                        <tr
                          key={player.id}
                          className="border-b border-gray-100 hover:bg-gray-50"
                        >
                          <td className="py-4 px-4">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                                {player.jerseyNumber}
                              </div>
                              <span className="font-medium text-gray-800">{player.name}</span>
                            </div>
                          </td>
                          <td className="text-center py-4 px-4 text-gray-600">{player.position}</td>
                          <td className="text-center py-4 px-4 text-gray-600">{player.minutesPlayed}'</td>
                          <td className="text-center py-4 px-4 font-medium text-gray-800">
                            {(stats.totalDistance / 1000).toFixed(2)}
                          </td>
                          <td className="text-center py-4 px-4 text-gray-600">
                            {Math.round(stats.highIntensityDistance)}
                          </td>
                          <td className="text-center py-4 px-4 text-gray-600">{stats.sprintCount}</td>
                          <td className="text-center py-4 px-4 text-gray-600">
                            {stats.maxSpeed.toFixed(1)}
                          </td>
                          <td className="text-center py-4 px-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              stats.successfulPasses / stats.passes > 0.8
                                ? 'bg-green-100 text-green-700'
                                : stats.successfulPasses / stats.passes > 0.6
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {Math.round((stats.successfulPasses / stats.passes) * 100)}%
                            </span>
                          </td>
                          <td className="text-center py-4 px-4">
                            <button
                              onClick={() => setSelectedPlayer(selectedPlayer === player.id ? null : player.id)}
                              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                            >
                              {selectedPlayer === player.id ? '收起' : '详情'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {selectedPlayer && (
                <div className="bg-blue-50 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">
                    {mockPlayers.find(p => p.id === selectedPlayer)?.name} - 详细数据
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {(() => {
                      const playerIndex = mockPlayers.findIndex(p => p.id === selectedPlayer);
                      const stats = mockPlayerStats[playerIndex];
                      return (
                        <>
                          <div className="bg-white rounded-lg p-4 text-center">
                            <p className="text-2xl font-bold text-gray-800">{stats.shots}</p>
                            <p className="text-sm text-gray-500 mt-1">射门</p>
                          </div>
                          <div className="bg-white rounded-lg p-4 text-center">
                            <p className="text-2xl font-bold text-gray-800">{stats.shotsOnTarget}</p>
                            <p className="text-sm text-gray-500 mt-1">射正</p>
                          </div>
                          <div className="bg-white rounded-lg p-4 text-center">
                            <p className="text-2xl font-bold text-gray-800">{stats.tackles}</p>
                            <p className="text-sm text-gray-500 mt-1">抢断</p>
                          </div>
                          <div className="bg-white rounded-lg p-4 text-center">
                            <p className="text-2xl font-bold text-gray-800">{stats.interceptions}</p>
                            <p className="text-sm text-gray-500 mt-1">拦截</p>
                          </div>
                          <div className="bg-white rounded-lg p-4 text-center">
                            <p className="text-2xl font-bold text-gray-800">{stats.passes}</p>
                            <p className="text-sm text-gray-500 mt-1">总传球</p>
                          </div>
                          <div className="bg-white rounded-lg p-4 text-center">
                            <p className="text-2xl font-bold text-gray-800">{stats.successfulPasses}</p>
                            <p className="text-sm text-gray-500 mt-1">成功传球</p>
                          </div>
                          <div className="bg-white rounded-lg p-4 text-center">
                            <p className="text-2xl font-bold text-gray-800">{stats.averageSpeed.toFixed(1)}</p>
                            <p className="text-sm text-gray-500 mt-1">平均速度(km/h)</p>
                          </div>
                          <div className="bg-white rounded-lg p-4 text-center">
                            <p className="text-2xl font-bold text-gray-800">{stats.maxSpeed.toFixed(1)}</p>
                            <p className="text-sm text-gray-500 mt-1">最高速度(km/h)</p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'events' && (
            <div className="relative">
              <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-200"></div>
              <div className="space-y-6">
                {[
                  { minute: "5'", type: 'goal', team: 'home', player: '赵六', description: '进球！精彩的远射破门' },
                  { minute: "12'", type: 'yellow', team: 'away', player: '对方球员1', description: '黄牌警告' },
                  { minute: "23'", type: 'chance', team: 'home', player: '王五', description: '绝佳机会，射门擦柱而出' },
                  { minute: "35'", type: 'substitution', team: 'home', player: '换人', description: '战术调整' },
                  { minute: "45'", type: 'half', team: 'none', player: '', description: '半场结束' },
                  { minute: "58'", type: 'chance', team: 'away', player: '对方球员2', description: '威胁进攻，门将精彩扑救' },
                  { minute: "72'", type: 'goal', team: 'away', player: '对方球员3', description: '进球！角球头球破门' },
                  { minute: "85'", type: 'red', team: 'away', player: '对方球员4', description: '红牌罚下' },
                  { minute: "90'", type: 'full', team: 'none', player: '', description: '全场结束' },
                ].map((event, index) => (
                  <div key={index} className="relative pl-20">
                    <div className={`absolute left-6 w-4 h-4 rounded-full border-4 ${
                      event.team === 'home' ? 'bg-blue-600 border-blue-200' :
                      event.team === 'away' ? 'bg-red-600 border-red-200' :
                      'bg-gray-600 border-gray-200'
                    }`}></div>
                    <div className="flex items-center space-x-4">
                      <span className="text-lg font-bold text-gray-400 w-12">{event.minute}</span>
                      <div className={`flex-1 p-4 rounded-lg ${
                        event.team === 'home' ? 'bg-blue-50' :
                        event.team === 'away' ? 'bg-red-50' :
                        'bg-gray-100'
                      }`}>
                        <div className="flex items-center space-x-2">
                          {event.type === 'goal' && <span className="text-2xl">⚽</span>}
                          {event.type === 'yellow' && <span className="text-2xl">🟨</span>}
                          {event.type === 'red' && <span className="text-2xl">🟥</span>}
                          {event.type === 'chance' && <span className="text-2xl">🎯</span>}
                          {event.type === 'substitution' && <span className="text-2xl">🔄</span>}
                          {event.type === 'half' && <span className="text-2xl">⏸️</span>}
                          {event.type === 'full' && <span className="text-2xl">⏹️</span>}
                          {event.player && <span className="font-medium text-gray-800">{event.player}</span>}
                        </div>
                        <p className="text-gray-600 mt-1">{event.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'heatmap' && (
            <div className="space-y-6">
              <div className="text-center py-12">
                <div className="relative inline-block">
                  <div className="w-[600px] h-[400px] bg-green-700 rounded-lg overflow-hidden">
                    <div className="absolute inset-0 opacity-30">
                      <svg viewBox="0 0 600 400" className="w-full h-full">
                        <defs>
                          <radialGradient id="heat1" cx="30%" cy="70%" r="40%">
                            <stop offset="0%" stopColor="red" stopOpacity="0.8" />
                            <stop offset="100%" stopColor="red" stopOpacity="0" />
                          </radialGradient>
                          <radialGradient id="heat2" cx="70%" cy="30%" r="35%">
                            <stop offset="0%" stopColor="orange" stopOpacity="0.8" />
                            <stop offset="100%" stopColor="orange" stopOpacity="0" />
                          </radialGradient>
                          <radialGradient id="heat3" cx="50%" cy="50%" r="30%">
                            <stop offset="0%" stopColor="yellow" stopOpacity="0.6" />
                            <stop offset="100%" stopColor="yellow" stopOpacity="0" />
                          </radialGradient>
                        </defs>
                        <rect width="600" height="400" fill="url(#heat1)" />
                        <rect width="600" height="400" fill="url(#heat2)" />
                        <rect width="600" height="400" fill="url(#heat3)" />
                      </svg>
                    </div>
                    <svg viewBox="0 0 600 400" className="absolute inset-0 w-full h-full">
                      <rect x="10" y="10" width="580" height="380" fill="none" stroke="white" strokeWidth="2" />
                      <line x1="300" y1="10" x2="300" y2="390" stroke="white" strokeWidth="2" />
                      <circle cx="300" cy="200" r="50" fill="none" stroke="white" strokeWidth="2" />
                      <circle cx="300" cy="200" r="5" fill="white" />
                      <rect x="220" y="10" width="160" height="80" fill="none" stroke="white" strokeWidth="2" />
                      <rect x="260" y="10" width="80" height="40" fill="none" stroke="white" strokeWidth="2" />
                      <rect x="220" y="310" width="160" height="80" fill="none" stroke="white" strokeWidth="2" />
                      <rect x="260" y="350" width="80" height="40" fill="none" stroke="white" strokeWidth="2" />
                    </svg>
                  </div>
                </div>
                <p className="text-gray-500 mt-4">10号球员 赵六 活动热力图</p>
              </div>

              <div className="flex justify-center space-x-4">
                {mockPlayers.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => setSelectedPlayer(player.id)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      selectedPlayer === player.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {player.jerseyNumber} - {player.name}
                  </button>
                ))}
              </div>

              <div className="flex justify-center space-x-4 mt-4">
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded-full bg-red-500"></div>
                  <span className="text-sm text-gray-600">高频活动区</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded-full bg-orange-500"></div>
                  <span className="text-sm text-gray-600">中频活动区</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded-full bg-yellow-500"></div>
                  <span className="text-sm text-gray-600">低频活动区</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnalysisReportPage;
