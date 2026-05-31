export interface NeuralNetworkConfig {
  inputSize: number;
  hiddenLayers: number[];
  outputSize: number;
  learningRate: number;
}

export class NeuralNetwork {
  private weights: number[][][] = [];
  private biases: number[][] = [];
  private learningRate: number;

  constructor(config: NeuralNetworkConfig) {
    this.learningRate = config.learningRate;
    this.initializeWeights(config.inputSize, config.hiddenLayers, config.outputSize);
  }

  private initializeWeights(inputSize: number, hiddenLayers: number[], outputSize: number): void {
    const layerSizes = [inputSize, ...hiddenLayers, outputSize];
    
    for (let i = 0; i < layerSizes.length - 1; i++) {
      const inputDim = layerSizes[i];
      const outputDim = layerSizes[i + 1];
      
      const layerWeights: number[][] = [];
      for (let j = 0; j < outputDim; j++) {
        const row: number[] = [];
        for (let k = 0; k < inputDim; k++) {
          row.push(this.glorotInit(inputDim, outputDim));
        }
        layerWeights.push(row);
      }
      this.weights.push(layerWeights);
      this.biases.push(new Array(outputDim).fill(0));
    }
  }

  private glorotInit(fanIn: number, fanOut: number): number {
    const limit = Math.sqrt(6 / (fanIn + fanOut));
    return (Math.random() * 2 - 1) * limit;
  }

  public forward(input: number[]): number[] {
    let current = input;
    
    for (let i = 0; i < this.weights.length; i++) {
      const layerWeights = this.weights[i];
      const layerBiases = this.biases[i];
      const next: number[] = [];
      
      for (let j = 0; j < layerWeights.length; j++) {
        let sum = layerBiases[j];
        for (let k = 0; k < current.length; k++) {
          sum += current[k] * layerWeights[j][k];
        }
        next.push(i < this.weights.length - 1 ? this.relu(sum) : sum);
      }
      current = next;
    }
    
    return current;
  }

  private relu(x: number): number {
    return Math.max(0, x);
  }

  public getWeights(): number[][][] {
    return this.weights;
  }

  public setWeights(weights: number[][][]): void {
    this.weights = weights;
  }

  public getBiases(): number[][] {
    return this.biases;
  }

  public setBiases(biases: number[][]): void {
    this.biases = biases;
  }

  public clone(): NeuralNetwork {
    const clone = new NeuralNetwork({
      inputSize: 0,
      hiddenLayers: [],
      outputSize: 0,
      learningRate: this.learningRate,
    });
    clone.weights = this.weights.map(layer => layer.map(row => [...row]));
    clone.biases = this.biases.map(row => [...row]);
    return clone;
  }
}

export class GaussianDistribution {
  public static sample(mean: number[], std: number): number[] {
    return mean.map(m => m + this.boxMuller() * std);
  }

  private static boxMuller(): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  public static logProb(sample: number[], mean: number[], std: number): number {
    const n = sample.length;
    const log2pi = n * Math.log(2 * Math.PI);
    let sumSquaredDiff = 0;
    
    for (let i = 0; i < n; i++) {
      sumSquaredDiff += Math.pow(sample[i] - mean[i], 2);
    }
    
    return -0.5 * (log2pi + n * Math.log(std * std) + sumSquaredDiff / (std * std));
  }
}

export interface PPOMemoryEntry {
  state: number[];
  action: number[];
  logProb: number;
  value: number;
  reward: number;
  nextState: number[];
  done: boolean;
}

export interface PPOConfig {
  gamma: number;
  gaeLambda: number;
  clipEpsilon: number;
  c1: number;
  c2: number;
  batchSize: number;
  epochs: number;
  learningRate: number;
  entropyCoef: number;
}

export class PPO {
  private actor: NeuralNetwork;
  private critic: NeuralNetwork;
  private oldActor: NeuralNetwork;
  private config: PPOConfig;
  private memory: PPOMemoryEntry[] = [];

  constructor(
    stateSize: number,
    actionSize: number,
    config: PPOConfig
  ) {
    this.config = config;
    
    this.actor = new NeuralNetwork({
      inputSize: stateSize,
      hiddenLayers: [256, 128, 64],
      outputSize: actionSize,
      learningRate: config.learningRate,
    });
    
    this.critic = new NeuralNetwork({
      inputSize: stateSize,
      hiddenLayers: [256, 128, 64],
      outputSize: 1,
      learningRate: config.learningRate,
    });
    
    this.oldActor = this.actor.clone();
  }

  public selectAction(state: number[]): { action: number[]; logProb: number; value: number } {
    const actionMean = this.actor.forward(state);
    const value = this.critic.forward(state)[0];
    const std = 0.5;
    
    const action = GaussianDistribution.sample(actionMean, std);
    const logProb = GaussianDistribution.logProb(action, actionMean, std);
    
    return { action, logProb, value };
  }

  public storeTransition(entry: PPOMemoryEntry): void {
    this.memory.push(entry);
  }

  public computeGAE(rewards: number[], values: number[], dones: boolean[]): {
    advantages: number[];
    returns: number[];
  } {
    const { gamma, gaeLambda } = this.config;
    const advantages: number[] = new Array(rewards.length).fill(0);
    let gae = 0;

    for (let t = rewards.length - 2; t >= 0; t--) {
      const delta = rewards[t] + gamma * values[t + 1] * (1 - (dones[t] ? 1 : 0)) - values[t];
      gae = delta + gamma * gaeLambda * (1 - (dones[t] ? 1 : 0)) * gae;
      advantages[t] = gae;
    }

    const returns = advantages.map((adv, i) => adv + values[i]);
    
    return { advantages, returns };
  }

  public update(): { policyLoss: number; valueLoss: number; entropy: number } {
    if (this.memory.length < this.config.batchSize) {
      return { policyLoss: 0, valueLoss: 0, entropy: 0 };
    }

    const states = this.memory.map(e => e.state);
    const actions = this.memory.map(e => e.action);
    const oldLogProbs = this.memory.map(e => e.logProb);
    const rewards = this.memory.map(e => e.reward);
    const values = this.memory.map(e => e.value);
    const dones = this.memory.map(e => e.done);

    const { advantages, returns } = this.computeGAE(rewards, values, dones);
    
    const normalizedAdvantages = this.normalize(advantages);

    let totalPolicyLoss = 0;
    let totalValueLoss = 0;
    let totalEntropy = 0;

    for (let epoch = 0; epoch < this.config.epochs; epoch++) {
      const indices = this.shuffleIndices(states.length);
      
      for (let i = 0; i < indices.length; i += this.config.batchSize) {
        const batchIndices = indices.slice(i, i + this.config.batchSize);
        const batchStates = batchIndices.map(idx => states[idx]);
        const batchActions = batchIndices.map(idx => actions[idx]);
        const batchOldLogProbs = batchIndices.map(idx => oldLogProbs[idx]);
        const batchAdvantages = batchIndices.map(idx => normalizedAdvantages[idx]);
        const batchReturns = batchIndices.map(idx => returns[idx]);

        const result = this.updateBatch(
          batchStates,
          batchActions,
          batchOldLogProbs,
          batchAdvantages,
          batchReturns
        );

        totalPolicyLoss += result.policyLoss;
        totalValueLoss += result.valueLoss;
        totalEntropy += result.entropy;
      }
    }

    this.memory = [];
    this.oldActor = this.actor.clone();

    const numBatches = Math.ceil(states.length / this.config.batchSize);
    return {
      policyLoss: totalPolicyLoss / (numBatches * this.config.epochs),
      valueLoss: totalValueLoss / (numBatches * this.config.epochs),
      entropy: totalEntropy / (numBatches * this.config.epochs),
    };
  }

  private updateBatch(
    states: number[][],
    actions: number[][],
    oldLogProbs: number[],
    advantages: number[],
    returns: number[]
  ): { policyLoss: number; valueLoss: number; entropy: number } {
    const { clipEpsilon, c1, c2 } = this.config;
    
    const newLogProbs: number[] = [];
    const values: number[] = [];
    const entropies: number[] = [];

    for (let i = 0; i < states.length; i++) {
      const actionMean = this.actor.forward(states[i]);
      const std = 0.5;
      const logProb = GaussianDistribution.logProb(actions[i], actionMean, std);
      const value = this.critic.forward(states[i])[0];
      
      newLogProbs.push(logProb);
      values.push(value);
      entropies.push(-logProb);
    }

    const ratios = newLogProbs.map((logProb, i) => 
      Math.exp(logProb - oldLogProbs[i])
    );

    const surr1 = ratios.map((r, i) => r * advantages[i]);
    const surr2 = ratios.map((r, i) => 
      Math.max(1 - clipEpsilon, Math.min(1 + clipEpsilon, r)) * advantages[i]
    );

    const policyLoss = -Math.min(...surr1.map((s, i) => Math.min(s, surr2[i]))) / states.length;

    const valueLoss = values.reduce((sum, v, i) => 
      sum + Math.pow(v - returns[i], 2), 0) / states.length;

    const entropy = entropies.reduce((sum, e) => sum + e, 0) / states.length;

    return {
      policyLoss,
      valueLoss,
      entropy: -entropy * c2,
    };
  }

  private normalize(arr: number[]): number[] {
    const mean = arr.reduce((sum, x) => sum + x, 0) / arr.length;
    const std = Math.sqrt(arr.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / arr.length);
    return arr.map(x => std > 0 ? (x - mean) / std : 0);
  }

  private shuffleIndices(length: number): number[] {
    const indices = Array.from({ length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices;
  }

  public save(): { actorWeights: number[][][]; criticWeights: number[][][] } {
    return {
      actorWeights: this.actor.getWeights(),
      criticWeights: this.critic.getWeights(),
    };
  }

  public load(weights: { actorWeights: number[][][]; criticWeights: number[][][] }): void {
    this.actor.setWeights(weights.actorWeights);
    this.critic.setWeights(weights.criticWeights);
  }

  public reset(): void {
    this.memory = [];
  }
}
