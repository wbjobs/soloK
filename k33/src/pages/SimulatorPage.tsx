import React, { useEffect, useState } from 'react';
import { TerminalScene } from '../three/Scene';
import { ControlPanel } from '../components/ControlPanel/ControlPanel';
import { StatsPanel } from '../components/StatsPanel/StatsPanel';
import { AGVList } from '../components/AGVList/AGVList';
import { RLPanel } from '../components/RLPanel/RLPanel';
import { DigitalTwinPanel } from '../components/DigitalTwinPanel/DigitalTwinPanel';
import { BenchmarkPanel } from '../components/BenchmarkPanel/BenchmarkPanel';
import { useSimulationStore } from '../store/useSimulationStore';

const SimulatorPage: React.FC = () => {
  const { scene, selectedAGVId, cameraMode, rlScheduler, digitalTwin, predictionEngine, tosSimulator, algorithmBenchmark } = useSimulationStore();
  
  const [activeTab, setActiveTab] = useState<'stats' | 'rl' | 'twin' | 'benchmark'>('stats');
  
  const {
    initRLScheduler,
    startRLTraining,
    stopRLTraining,
    saveRLModel,
    loadRLModel,
    initDigitalTwin,
    startTwinSync,
    stopTwinSync,
    manualSync,
    initPredictionEngine,
    startPrediction,
    stopPrediction,
    initBenchmark,
    runBenchmark,
    stopBenchmark,
  } = useSimulationStore();

  useEffect(() => {
    if (!rlScheduler) {
      initRLScheduler();
    }
    if (!digitalTwin) {
      initDigitalTwin();
    }
    if (!predictionEngine) {
      initPredictionEngine();
      startPrediction();
    }
    if (!algorithmBenchmark) {
      initBenchmark();
    }
  }, []);

  return (
    <div className="w-full h-screen bg-gray-950 relative overflow-hidden">
      <TerminalScene scene={scene} />

      <ControlPanel />
      
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <button
          onClick={() => setActiveTab('stats')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'stats' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          实时统计
        </button>
        <button
          onClick={() => setActiveTab('rl')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'rl' 
              ? 'bg-purple-600 text-white' 
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          强化学习
        </button>
        <button
          onClick={() => setActiveTab('twin')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'twin' 
              ? 'bg-cyan-600 text-white' 
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          数字孪生
        </button>
        <button
          onClick={() => setActiveTab('benchmark')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'benchmark' 
              ? 'bg-amber-600 text-white' 
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          算法对比
        </button>
      </div>

      {activeTab === 'stats' && <StatsPanel />}
      
      {activeTab === 'rl' && (
        <div className="absolute top-20 right-4 w-96 z-10">
          <RLPanel
            rlScheduler={rlScheduler}
            onStartTraining={startRLTraining}
            onStopTraining={stopRLTraining}
            onSaveModel={saveRLModel}
            onLoadModel={loadRLModel}
          />
        </div>
      )}

      {activeTab === 'twin' && (
        <div className="absolute top-20 right-4 w-96 z-10">
          <DigitalTwinPanel
            digitalTwin={digitalTwin}
            predictionEngine={predictionEngine}
            tosSimulator={tosSimulator}
            onStartSync={startTwinSync}
            onStopSync={stopTwinSync}
            onManualSync={manualSync}
          />
        </div>
      )}

      {activeTab === 'benchmark' && (
        <div className="absolute top-20 right-4 w-96 z-10">
          <BenchmarkPanel
            benchmark={algorithmBenchmark}
            onRunBenchmark={runBenchmark}
            onStopBenchmark={stopBenchmark}
          />
        </div>
      )}

      <AGVList />

      {scene.simulationState.isRunning && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-green-600/90 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 z-10">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
          仿真运行中
        </div>
      )}

      {selectedAGVId && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-blue-600/90 text-white px-4 py-2 rounded-lg text-sm z-10">
          已选中: {scene.agvs.find(a => a.id === selectedAGVId)?.name}
          {cameraMode === 'follow' && ' (视角跟随中)'}
        </div>
      )}
    </div>
  );
};

export default SimulatorPage;
