import { Scene, AGV, Task } from '../types';
import { createDefaultScene } from '../mock/defaultScene';
import { SimulationEngine } from './SimulationEngine';
import { RLScheduler } from './rl/RLScheduler';

export interface BenchmarkConfig {
  numRuns: number;
  runDuration: number;
  metrics: string[];
  algorithms: string[];
}

export interface BenchmarkResult {
  algorithm: string;
  totalTEU: number;
  teuPerHour: number;
  avgWaitTime: number;
  maxWaitTime: number;
  agvUtilization: number;
  craneUtilization: number;
  deadlockCount: number;
  faultCount: number;
  taskCompletionRate: number;
  energyConsumption: number;
}

export interface ComparisonReport {
  timestamp: number;
  results: BenchmarkResult[];
  summary: {
    bestAlgorithm: string;
    improvement: number;
    metrics: Record<string, { best: string; value: number }>;
  };
}

export class AlgorithmBenchmark {
  private config: BenchmarkConfig;
  private results: BenchmarkResult[] = [];
  private isRunning: boolean = false;

  constructor(config?: Partial<BenchmarkConfig>) {
    this.config = {
      numRuns: 5,
      runDuration: 3600,
      metrics: ['totalTEU', 'avgWaitTime', 'agvUtilization', 'taskCompletionRate'],
      algorithms: ['greedy', 'hungarian', 'ppo'],
      ...config,
    };
  }

  public async runBenchmark(
    baseScene: Scene,
    onProgress?: (progress: number, currentAlgorithm: string) => void
  ): Promise<ComparisonReport> {
    this.isRunning = true;
    this.results = [];

    for (const algorithm of this.config.algorithms) {
      for (let run = 0; run < this.config.numRuns; run++) {
        if (!this.isRunning) break;

        const progress = ((this.config.algorithms.indexOf(algorithm) * this.config.numRuns + run) / 
          (this.config.algorithms.length * this.config.numRuns)) * 100;
        
        if (onProgress) {
          onProgress(progress, `${algorithm} (${run + 1}/${this.config.numRuns})`);
        }

        const scene = this.cloneScene(baseScene);
        const result = await this.runAlgorithm(scene, algorithm);
        this.results.push(result);
      }
    }

    this.isRunning = false;

    const report = this.generateReport();
    return report;
  }

  private async runAlgorithm(scene: Scene, algorithm: string): Promise<BenchmarkResult> {
    return new Promise((resolve) => {
      const engine = new SimulationEngine(scene);
      engine.setOnUpdate((updatedScene) => {
        const time = updatedScene.simulationState.currentTime;
        if (time >= this.config.runDuration || this.isComplete(updatedScene)) {
          engine.pause();
          
          const result: BenchmarkResult = {
            algorithm,
            totalTEU: updatedScene.simulationState.totalTEU,
            teuPerHour: updatedScene.simulationState.teuPerHour,
            avgWaitTime: updatedScene.simulationState.averageWaitTime,
            maxWaitTime: updatedScene.simulationState.maxWaitTime,
            agvUtilization: updatedScene.simulationState.agvUtilization,
            craneUtilization: updatedScene.simulationState.craneUtilization,
            deadlockCount: updatedScene.simulationState.deadlockCount,
            faultCount: updatedScene.simulationState.faultCount,
            taskCompletionRate: updatedScene.simulationState.taskCompletionRate,
            energyConsumption: this.calculateEnergyConsumption(updatedScene),
          };
          
          resolve(result);
        }
      });

      engine.start();
    });
  }

  private isComplete(scene: Scene): boolean {
    const pendingTasks = scene.tasks.filter(t => t.status === 'pending').length;
    const activeTasks = scene.tasks.filter(t => 
      t.status === 'assigned' || t.status === 'in_progress'
    ).length;
    
    const activeAGVs = scene.agvs.filter(a => 
      a.status === 'moving' || a.status === 'loading' || a.status === 'unloading'
    ).length;

    return pendingTasks === 0 && activeTasks === 0 && activeAGVs === 0;
  }

  private calculateEnergyConsumption(scene: Scene): number {
    return scene.agvs.reduce((total, agv) => {
      return total + (agv.batteryCapacity - agv.battery) * 0.001;
    }, 0);
  }

  private cloneScene(scene: Scene): Scene {
    return JSON.parse(JSON.stringify(scene));
  }

  private generateReport(): ComparisonReport {
    const aggregatedResults = this.aggregateResults();
    
    const summary = this.calculateSummary(aggregatedResults);

    return {
      timestamp: Date.now(),
      results: aggregatedResults,
      summary,
    };
  }

  private aggregateResults(): BenchmarkResult[] {
    const groupedResults: Record<string, BenchmarkResult[]> = {};
    
    for (const result of this.results) {
      if (!groupedResults[result.algorithm]) {
        groupedResults[result.algorithm] = [];
      }
      groupedResults[result.algorithm].push(result);
    }

    const aggregated: BenchmarkResult[] = [];

    for (const [algorithm, runs] of Object.entries(groupedResults)) {
      const avgResult: BenchmarkResult = {
        algorithm,
        totalTEU: this.average(runs.map(r => r.totalTEU)),
        teuPerHour: this.average(runs.map(r => r.teuPerHour)),
        avgWaitTime: this.average(runs.map(r => r.avgWaitTime)),
        maxWaitTime: this.max(runs.map(r => r.maxWaitTime)),
        agvUtilization: this.average(runs.map(r => r.agvUtilization)),
        craneUtilization: this.average(runs.map(r => r.craneUtilization)),
        deadlockCount: this.average(runs.map(r => r.deadlockCount)),
        faultCount: this.average(runs.map(r => r.faultCount)),
        taskCompletionRate: this.average(runs.map(r => r.taskCompletionRate)),
        energyConsumption: this.average(runs.map(r => r.energyConsumption)),
      };
      aggregated.push(avgResult);
    }

    return aggregated;
  }

  private calculateSummary(results: BenchmarkResult[]): ComparisonReport['summary'] {
    const metrics: Record<string, { best: string; value: number }> = {};

    const bestTEU = results.reduce((best, current) => 
      current.totalTEU > best.totalTEU ? current : best
    );
    metrics['totalTEU'] = { best: bestTEU.algorithm, value: bestTEU.totalTEU };

    const bestWaitTime = results.reduce((best, current) => 
      current.avgWaitTime < best.avgWaitTime ? current : best
    );
    metrics['avgWaitTime'] = { best: bestWaitTime.algorithm, value: bestWaitTime.avgWaitTime };

    const bestUtilization = results.reduce((best, current) => 
      current.agvUtilization > best.agvUtilization ? current : best
    );
    metrics['agvUtilization'] = { best: bestUtilization.algorithm, value: bestUtilization.agvUtilization };

    const bestCompletionRate = results.reduce((best, current) => 
      current.taskCompletionRate > best.taskCompletionRate ? current : best
    );
    metrics['taskCompletionRate'] = { best: bestCompletionRate.algorithm, value: bestCompletionRate.taskCompletionRate };

    const bestAlgorithm = this.getOverallBestAlgorithm(results);
    
    const baseline = results.find(r => r.algorithm === 'greedy')?.totalTEU || 0;
    const bestValue = results.find(r => r.algorithm === bestAlgorithm)?.totalTEU || 0;
    const improvement = baseline > 0 ? ((bestValue - baseline) / baseline) * 100 : 0;

    return {
      bestAlgorithm,
      improvement,
      metrics,
    };
  }

  private getOverallBestAlgorithm(results: BenchmarkResult[]): string {
    const scores: Record<string, number> = {};

    for (const result of results) {
      scores[result.algorithm] = 
        result.totalTEU * 0.3 +
        (1000 - result.avgWaitTime) * 0.2 +
        result.agvUtilization * 0.3 +
        result.taskCompletionRate * 0.2;
    }

    return Object.entries(scores).reduce((best, [alg, score]) => 
      score > (scores[best] || 0) ? alg : best
    , results[0]?.algorithm || 'greedy');
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private max(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.max(...values);
  }

  public stop(): void {
    this.isRunning = false;
  }

  public getResults(): BenchmarkResult[] {
    return this.results;
  }

  public isBenchmarkRunning(): boolean {
    return this.isRunning;
  }

  public getConfig(): BenchmarkConfig {
    return { ...this.config };
  }

  public updateConfig(config: Partial<BenchmarkConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
