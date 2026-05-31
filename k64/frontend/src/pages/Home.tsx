import { useSimulation } from '../hooks/useSimulation';
import ParticleScene from '../components/ParticleScene';
import InfoPanel from '../components/InfoPanel';
import ElectricFieldPanel from '../components/ElectricFieldPanel';
import RecordingPanel from '../components/RecordingPanel';

export default function Home() {
  useSimulation();

  return (
    <div className="relative w-full h-full overflow-hidden">
      <ParticleScene />
      <ElectricFieldPanel />
      <InfoPanel />
      <RecordingPanel />

      <div className="absolute top-4 left-1/2 z-10 -translate-x-1/2">
        <div className="glass-panel rounded-lg px-6 py-3">
          <h1 className="font-display text-xl font-bold text-cyber-cyan text-glow tracking-widest">
            LENNARD-JONES 粒子模拟器
          </h1>
        </div>
      </div>

      <div className="absolute bottom-4 right-4 z-10">
        <div className="glass-panel rounded-lg px-4 py-3">
          <p className="text-xs text-gray-400">
            <span className="text-cyber-cyan">鼠标左键</span> 旋转 · 
            <span className="text-cyber-cyan"> 滚轮</span> 缩放 · 
            <span className="text-cyber-cyan"> 右键</span> 平移
          </p>
        </div>
      </div>
    </div>
  );
}
