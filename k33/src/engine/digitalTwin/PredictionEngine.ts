import { Scene, AGV, RoadNode } from '../../types';
import { distance } from '../../utils/math';
import { DigitalTwin, TOSData, PredictionResult, CongestionZone } from './DigitalTwin';

export interface PredictionConfig {
  lookAheadMinutes: number;
  updateInterval: number;
  congestionThreshold: number;
  minConfidence: number;
  historicalDataPoints: number;
}

export interface TrafficPattern {
  timestamp: number;
  nodeId: string;
  congestion: number;
  agvCount: number;
}

export class PredictionEngine {
  private scene: Scene;
  private config: PredictionConfig;
  private historicalData: TrafficPattern[] = [];
  private agvMovementPatterns: Map<string, MovementPattern> = new Map();
  private congestionPredictions: Map<string, number> = new Map();
  private predictions: PredictionResult[] = [];
  private isEnabled: boolean = false;
  private updateTimer: number = 0;

  constructor(scene: Scene, config?: Partial<PredictionConfig>) {
    this.scene = scene;
    this.config = {
      lookAheadMinutes: 15,
      updateInterval: 30,
      congestionThreshold: 0.6,
      minConfidence: 0.7,
      historicalDataPoints: 1000,
      ...config,
    };
  }

  public update(currentTime: number, dt: number): PredictionResult[] {
    if (!this.isEnabled) return [];

    this.updateTimer += dt;
    
    if (this.updateTimer >= this.config.updateInterval) {
      this.updateTimer = 0;
      this.recordTrafficPattern(currentTime);
      this.learnMovementPatterns();
      
      const prediction = this.predictCongestion(currentTime);
      this.predictions.push(prediction);
      
      if (this.predictions.length > 100) {
        this.predictions.shift();
      }

      return [prediction];
    }

    return [];
  }

  private recordTrafficPattern(currentTime: number): void {
    for (const node of this.scene.roadNetwork) {
      const pattern: TrafficPattern = {
        timestamp: currentTime,
        nodeId: node.id,
        congestion: node.congestion,
        agvCount: this.countAGVsNearNode(node),
      };
      this.historicalData.push(pattern);
    }

    if (this.historicalData.length > this.config.historicalDataPoints * 100) {
      this.historicalData = this.historicalData.slice(-this.config.historicalDataPoints);
    }
  }

  private countAGVsNearNode(node: RoadNode): number {
    let count = 0;
    const threshold = 10;

    for (const agv of this.scene.agvs) {
      if (agv.status === 'moving') {
        const dist = distance(agv.position, node.position);
        if (dist < threshold) {
          count++;
        }
      }
    }

    return count;
  }

  private learnMovementPatterns(): void {
    const movementCounts: Map<string, Map<string, number>> = new Map();

    for (const agv of this.scene.agvs) {
      if (agv.path.length > 1 && agv.pathIndex < agv.path.length - 1) {
        const currentNodeId = this.findNearestNodeId(agv.position);
        const nextNodeId = this.getNextNodeId(agv);

        if (currentNodeId && nextNodeId) {
          if (!movementCounts.has(currentNodeId)) {
            movementCounts.set(currentNodeId, new Map());
          }
          const counts = movementCounts.get(currentNodeId)!;
          counts.set(nextNodeId, (counts.get(nextNodeId) || 0) + 1);
        }
      }
    }

    movementCounts.forEach((nextNodes, currentNodeId) => {
      const pattern: MovementPattern = {
        nodeId: currentNodeId,
        transitions: new Map(),
        totalTransitions: 0,
      };

      nextNodes.forEach((count, nextNodeId) => {
        pattern.transitions.set(nextNodeId, count);
        pattern.totalTransitions += count;
      });

      this.agvMovementPatterns.set(currentNodeId, pattern);
    });
  }

  private findNearestNodeId(position: { x: number; y: number }): string | null {
    let nearestId: string | null = null;
    let minDist = Infinity;

    for (const node of this.scene.roadNetwork) {
      const dist = distance(position, node.position);
      if (dist < minDist) {
        minDist = dist;
        nearestId = node.id;
      }
    }

    return nearestId;
  }

  private getNextNodeId(agv: AGV): string | null {
    if (agv.path.length === 0 || agv.pathIndex >= agv.path.length) {
      return null;
    }

    const lookAhead = Math.min(agv.pathIndex + 3, agv.path.length - 1);
    const targetPosition = agv.path[lookAhead];
    return this.findNearestNodeId(targetPosition);
  }

  private predictCongestion(currentTime: number): PredictionResult {
    const congestionZones: CongestionZone[] = [];
    const lookAheadSeconds = this.config.lookAheadMinutes * 60;

    for (const node of this.scene.roadNetwork) {
      const predictedCongestion = this.predictNodeCongestion(node.id, currentTime, lookAheadSeconds);
      
      if (predictedCongestion > this.config.congestionThreshold) {
        const zone: CongestionZone = {
          position: { x: node.position.x, y: node.position.y },
          severity: this.getCongestionSeverity(predictedCongestion),
          predictedTime: currentTime + lookAheadSeconds,
          duration: this.predictCongestionDuration(node.id, predictedCongestion),
        };
        congestionZones.push(zone);
        this.congestionPredictions.set(node.id, predictedCongestion);
      }
    }

    const predictedThroughput = this.predictThroughput(currentTime, lookAheadSeconds);
    const predictedAGVUtilization = this.predictAGVUtilization();
    const bottlenecks = this.identifyBottlenecks(congestionZones);

    return {
      timestamp: currentTime,
      predictions: {
        congestionZones: congestionZones.sort((a, b) => 
          this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity)
        ),
        throughputForecast: predictedThroughput,
        agvUtilizationForecast: predictedAGVUtilization,
        bottlenecks,
      },
      confidence: this.calculateConfidence(),
    };
  }

  private predictNodeCongestion(nodeId: string, currentTime: number, lookAhead: number): number {
    const node = this.scene.roadNetwork.find(n => n.id === nodeId);
    if (!node) return 0;

    const pattern = this.agvMovementPatterns.get(nodeId);
    if (!pattern || pattern.totalTransitions === 0) {
      return node.congestion * 0.8;
    }

    const incomingAGVs = this.predictIncomingAGVs(nodeId, lookAhead);
    const capacity = this.estimateNodeCapacity(node);
    
    const predictedCongestion = Math.min(1, incomingAGVs / Math.max(1, capacity));
    
    const historicalFactor = this.getHistoricalCongestionFactor(nodeId, currentTime);
    const currentFactor = node.congestion;
    
    return predictedCongestion * 0.4 + historicalFactor * 0.3 + currentFactor * 0.3;
  }

  private predictIncomingAGVs(nodeId: string, lookAhead: number): number {
    let predictedAGVs = 0;
    const pattern = this.agvMovementPatterns.get(nodeId);
    
    if (pattern) {
      for (const [otherNodeId, count] of pattern.transitions) {
        const otherPattern = this.agvMovementPatterns.get(otherNodeId);
        if (otherPattern) {
          const probability = count / pattern.totalTransitions;
          const baseRate = otherPattern.totalTransitions / Math.max(1, this.historicalData.length);
          predictedAGVs += baseRate * probability * (lookAhead / this.config.updateInterval);
        }
      }
    }

    return predictedAGVs;
  }

  private estimateNodeCapacity(node: RoadNode): number {
    return Math.max(3, node.connections.length * 2);
  }

  private getHistoricalCongestionFactor(nodeId: string, currentTime: number): number {
    const relevantData = this.historicalData.filter(
      d => d.nodeId === nodeId && 
      currentTime - d.timestamp < 3600
    );

    if (relevantData.length === 0) return 0.5;

    const sum = relevantData.reduce((acc, d) => acc + d.congestion, 0);
    return sum / relevantData.length;
  }

  private predictCongestionDuration(nodeId: string, congestionLevel: number): number {
    const baseDuration = congestionLevel * 300;
    const pattern = this.agvMovementPatterns.get(nodeId);
    
    if (pattern && pattern.totalTransitions > 10) {
      const averageTransitionTime = 60;
      return baseDuration + averageTransitionTime;
    }
    
    return baseDuration;
  }

  private getCongestionSeverity(congestion: number): 'low' | 'medium' | 'high' | 'critical' {
    if (congestion >= 0.9) return 'critical';
    if (congestion >= 0.7) return 'high';
    if (congestion >= 0.5) return 'medium';
    return 'low';
  }

  private getSeverityWeight(severity: string): number {
    switch (severity) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  }

  private predictThroughput(currentTime: number, lookAhead: number): number {
    const currentTEU = this.scene.simulationState.totalTEU;
    const currentTimeHours = currentTime / 3600;
    
    if (currentTimeHours < 0.1) return 0;

    const averageRate = currentTEU / currentTimeHours;
    const efficiencyFactor = 1 - (this.getAveragePredictedCongestion() * 0.3);
    
    return averageRate * efficiencyFactor * (lookAhead / 3600);
  }

  private predictAGVUtilization(): number {
    const activeAGVs = this.scene.agvs.filter(a => 
      a.status === 'moving' || a.status === 'loading' || a.status === 'unloading'
    ).length;
    
    const baseUtilization = (activeAGVs / this.scene.agvs.length) * 100;
    const congestionPenalty = this.getAveragePredictedCongestion() * 10;
    
    return Math.max(0, Math.min(100, baseUtilization - congestionPenalty));
  }

  private getAveragePredictedCongestion(): number {
    if (this.congestionPredictions.size === 0) return 0;
    
    let sum = 0;
    this.congestionPredictions.forEach(value => sum += value);
    return sum / this.congestionPredictions.size;
  }

  private identifyBottlenecks(zones: CongestionZone[]): string[] {
    const bottlenecks: string[] = [];
    const criticalZones = zones.filter(z => z.severity === 'critical');
    
    if (criticalZones.length > 0) {
      bottlenecks.push(`检测到 ${criticalZones.length} 个严重拥堵区域`);
    }
    
    const highZones = zones.filter(z => z.severity === 'high');
    if (highZones.length > 5) {
      bottlenecks.push('大面积高拥堵风险');
    }

    const lowBatteryAGVs = this.scene.agvs.filter(a => a.battery < 20).length;
    if (lowBatteryAGVs > this.scene.agvs.length * 0.2) {
      bottlenecks.push('大量AGV电量不足，可能影响作业效率');
    }

    const pendingTasks = this.scene.tasks.filter(t => t.status === 'pending').length;
    if (pendingTasks > this.scene.agvs.length * 3) {
      bottlenecks.push('任务积压严重，建议增加AGV或调整调度策略');
    }

    return bottlenecks;
  }

  private calculateConfidence(): number {
    const dataPoints = this.historicalData.length;
    const patterns = this.agvMovementPatterns.size;
    
    const dataConfidence = Math.min(1, dataPoints / (this.config.historicalDataPoints * 50));
    const patternConfidence = Math.min(1, patterns / 20);
    
    return (dataConfidence * 0.6 + patternConfidence * 0.4);
  }

  public getAlerts(currentTime: number): string[] {
    const alerts: string[] = [];
    const recentPredictions = this.predictions.slice(-5);

    for (const prediction of recentPredictions) {
      for (const zone of prediction.predictions.congestionZones) {
        if (zone.severity === 'critical' || zone.severity === 'high') {
          const timeToCongestion = zone.predictedTime - currentTime;
          if (timeToCongestion > 0 && timeToCongestion < this.config.lookAheadMinutes * 60) {
            alerts.push(
              `⚠️ 预测在位置 (${zone.position.x.toFixed(0)}, ${zone.position.y.toFixed(0)}) ` +
              `将在 ${Math.ceil(timeToCongestion / 60)} 分钟内发生${zone.severity === 'critical' ? '严重' : '高'}级拥堵`
            );
          }
        }
      }

      for (const bottleneck of prediction.predictions.bottlenecks) {
        if (!alerts.includes(bottleneck)) {
          alerts.push(`🔍 ${bottleneck}`);
        }
      }
    }

    return alerts;
  }

  public start(): void {
    this.isEnabled = true;
  }

  public stop(): void {
    this.isEnabled = false;
  }

  public isRunning(): boolean {
    return this.isEnabled;
  }

  public getConfig(): PredictionConfig {
    return { ...this.config };
  }

  public updateConfig(config: Partial<PredictionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  public getPredictions(): PredictionResult[] {
    return this.predictions;
  }

  public getLatestPrediction(): PredictionResult | null {
    if (this.predictions.length === 0) return null;
    return this.predictions[this.predictions.length - 1];
  }

  public reset(): void {
    this.historicalData = [];
    this.agvMovementPatterns.clear();
    this.congestionPredictions.clear();
    this.predictions = [];
    this.updateTimer = 0;
  }
}

interface MovementPattern {
  nodeId: string;
  transitions: Map<string, number>;
  totalTransitions: number;
}
