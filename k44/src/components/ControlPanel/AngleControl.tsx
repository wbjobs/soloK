import { useQuantumStore } from '@/store/quantumStore';
import { useShallow } from 'zustand/react/shallow';

export function AngleControl() {
  const { theta, phi, setAngles } = useQuantumStore(
    useShallow((state) => ({
      theta: state.state.theta,
      phi: state.state.phi,
      setAngles: state.setAngles
    }))
  );

  const thetaDegrees = (theta * 180 / Math.PI).toFixed(1);
  const phiDegrees = (phi * 180 / Math.PI).toFixed(1);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider">
        角度控制
      </h3>

      <div className="space-y-3">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm text-gray-300 font-medium">
              θ (极角)
            </label>
            <span className="text-sm text-cyan-400 font-mono">
              {thetaDegrees}°
            </span>
          </div>
          <input
            type="range"
            min="0"
            max={Math.PI}
            step="0.01"
            value={theta}
            onChange={(e) => setAngles(parseFloat(e.target.value), phi)}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>0°</span>
            <span>180°</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm text-gray-300 font-medium">
              φ (方位角)
            </label>
            <span className="text-sm text-cyan-400 font-mono">
              {phiDegrees}°
            </span>
          </div>
          <input
            type="range"
            min="0"
            max={2 * Math.PI}
            step="0.01"
            value={phi}
            onChange={(e) => setAngles(theta, parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>0°</span>
            <span>360°</span>
          </div>
        </div>
      </div>
    </div>
  );
}
