import { AGV, Task, Scene } from '../../types';
import { PPO, PPOConfig, PPOMemoryEntry } from './PPO';
import { SchedulingEnvironment, SchedulingReward } from './SchedulingEnvironment';

export interface RLSchedulerConfig {
  stateSize: number;
  actionSize: number;
  ppoConfig: PPOConfig;
  updateInterval: number;
  explorationRate: number;
  explorationDecay: number;
  minExplorationRate: number;
}

export interface TrainingStats {
  episode: number;
  totalReward: number;
  averageReward: number;
  policyLoss: number;
  valueLoss: number;
  entropy: number;
  throughput: number;
  avgWaitTime: number;
  agvUtilization: number;
}

export class RLScheduler {
  private ppo: PPO;
  private environment: SchedulingEnvironment;
  private config: RLSchedulerConfig;
  private episode: number = 0;
  private episodeReward: number = 0;
  private trainingHistory: TrainingStats[] = [];
  private isTraining: boolean = false;
  private lastState: number[] = [];
  private lastAction: number[] = [];
  private lastLogProb: number = 0;
  private lastValue: number = 0;
  private stepCount: number = 0;

  constructor(scene: Scene, config?: Partial<RLSchedulerConfig>) {
    const defaultConfig: RLSchedulerConfig = {
      stateSize: 1500,
      actionSize: 110,
      ppoConfig: {
        gamma: 0.99,
        gaeLambda: 0.95,
        clipEpsilon: 0.2,
        c1: 0.5,
        c2: 0.01,
        batchSize: 64,
        epochs: 10,
        learningRate: 3e-4,
        entropyCoef: 0.01,
      },
      updateInterval: 100,
      explorationRate: 1.0,
      explorationDecay: 0.995,
      minExplorationRate: 0.1,
    };

    this.config = { ...defaultConfig, ...config };
    this.environment = new SchedulingEnvironment(scene);
    this.ppo = new PPO(
      this.config.stateSize,
      this.config.actionSize,
      this.config.ppoConfig
    );
  }

  public selectActions(scene: Scene): { assignments: Map<string, string>; pathReplans: string[] } {
    this.environment.setScene(scene);
    const state = this.environment.getState();

    let action: number[];
    let logProb: number;
    let value: number;

    if (this.isTraining && Math.random() < this.config.explorationRate) {
      action = this.explore();
      const result = this.ppo.selectAction(state);
      logProb = result.logProb;
      value = result.value;
    } else {
      const result = this.ppo.selectAction(state);
      action = result.action;
      logProb = result.logProb;
      value = result.value;
    }

    this.lastState = state;
    this.lastAction = action;
    this.lastLogProb = logProb;
    this.lastValue = value;

    const decodedAction = this.decodeAction(action, scene);
    return decodedAction;
  }

  private explore(): number[] {
    const action: number[] = [];
    for (let i = 0; i < this.config.actionSize; i++) {
      action.push(Math.random() * 2 - 1);
    }
    return action;
  }

  private decodeAction(action: number[], scene: Scene): { assignments: Map<string, string>; pathReplans: string[] } {
    const assignments = new Map<string, string>();
    const pathReplans: string[] = [];
    
    const idleAGVs = scene.agvs.filter(a => a.status === 'idle');
    const pendingTasks = scene.tasks.filter(t => t.status === 'pending');

    const numAssignments = Math.min(idleAGVs.length, pendingTasks.length, action.length / 2);
    
    for (let i = 0; i < numAssignments * 2 && i < numAssignments * 2; i += 2) {
      const agvIndex = Math.floor(Math.abs(action[i]) * idleAGVs.length) % idleAGVs.length;
      const taskIndex = Math.floor(Math.abs(action[i + 1]) * pendingTasks.length) % pendingTasks.length;

      if (agvIndex < idleAGVs.length && taskIndex < pendingTasks.length) {
        const agv = idleAGVs[agvIndex];
        const task = pendingTasks[taskIndex];
        if (!assignments.has(agv.id) && !Array.from(assignments.values()).includes(task.id)) {
          assignments.set(agv.id, task.id);
        }
      }
    }

    const replanStart = numAssignments * 2;
    const numReplans = Math.min(10, action.length - replanStart);
    
    for (let i = 0; i < numReplans; i++) {
      if (Math.abs(action[replanStart + i]) > 0.7) {
        const agvIndex = Math.floor(Math.abs(action[replanStart + i]) * scene.agvs.length) % scene.agvs.length;
        if (scene.agvs[agvIndex] && scene.agvs[agvIndex].status === 'moving') {
          pathReplans.push(scene.agvs[agvIndex].id);
        }
      }
    }

    return { assignments, pathReplans };
  }

  public observe(scene: Scene, reward: number, done: boolean): void {
    if (!this.isTraining) return;

    this.environment.setScene(scene);
    const nextState = this.environment.getState();

    const entry: PPOMemoryEntry = {
      state: this.lastState,
      action: this.lastAction,
      logProb: this.lastLogProb,
      value: this.lastValue,
      reward,
      nextState,
      done,
    };

    this.ppo.storeTransition(entry);

    this.episodeReward += reward;
    this.stepCount++;

    if (this.stepCount % this.config.updateInterval === 0) {
      this.ppo.update();
    }

    if (this.config.explorationRate > this.config.minExplorationRate) {
      this.config.explorationRate *= this.config.explorationDecay;
    }

    if (done) {
      this.episode++;
      this.recordStats();
      this.episodeReward = 0;
    }
  }

  private recordStats(): void {
    const scene = this.environment.getScene();
    const stats: TrainingStats = {
      episode: this.episode,
      totalReward: this.episodeReward,
      averageReward: this.episodeReward / Math.max(1, this.stepCount),
      policyLoss: 0,
      valueLoss: 0,
      entropy: 0,
      throughput: scene.simulationState.totalTEU,
      avgWaitTime: scene.simulationState.averageWaitTime,
      agvUtilization: scene.simulationState.agvUtilization,
    };

    this.trainingHistory.push(stats);

    if (this.trainingHistory.length > 1000) {
      this.trainingHistory.shift();
    }
  }

  public startTraining(): void {
    this.isTraining = true;
    this.episode = 0;
    this.episodeReward = 0;
    this.stepCount = 0;
    this.trainingHistory = [];
    this.config.explorationRate = 1.0;
    this.ppo.reset();
  }

  public stopTraining(): void {
    this.isTraining = false;
    this.ppo.update();
  }

  public pauseTraining(): void {
    this.isTraining = false;
  }

  public resumeTraining(): void {
    this.isTraining = true;
  }

  public isTrainingMode(): boolean {
    return this.isTraining;
  }

  public getTrainingProgress(): {
    episode: number;
    explorationRate: number;
    episodeReward: number;
    isTraining: boolean;
  } {
    return {
      episode: this.episode,
      explorationRate: this.config.explorationRate,
      episodeReward: this.episodeReward,
      isTraining: this.isTraining,
    };
  }

  public getTrainingHistory(): TrainingStats[] {
    return this.trainingHistory;
  }

  public saveModel(path?: string): { actorWeights: number[][][]; criticWeights: number[][][] } {
    return this.ppo.save();
  }

  public loadModel(weights: { actorWeights: number[][][]; criticWeights: number[][][] }): void {
    this.ppo.load(weights);
  }

  public evaluate(scene: Scene, episodes: number = 10): TrainingStats[] {
    const originalIsTraining = this.isTraining;
    const originalExplorationRate = this.config.explorationRate;
    
    this.isTraining = false;
    this.config.explorationRate = 0;
    
    const results: TrainingStats[] = [];
    
    for (let i = 0; i < episodes; i++) {
      const result: TrainingStats = {
        episode: i,
        totalReward: 0,
        averageReward: 0,
        policyLoss: 0,
        valueLoss: 0,
        entropy: 0,
        throughput: scene.simulationState.totalTEU,
        avgWaitTime: scene.simulationState.averageWaitTime,
        agvUtilization: scene.simulationState.agvUtilization,
      };
      results.push(result);
    }

    this.isTraining = originalIsTraining;
    this.config.explorationRate = originalExplorationRate;

    return results;
  }

  public getConfig(): RLSchedulerConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<RLSchedulerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public setScene(scene: Scene): void {
    this.environment.setScene(scene);
  }
}
