export type GATargetType = 'oscillator' | 'stable' | 'glider' | 'chaos' | 'max_lifetime' | 'custom_period';

export interface GASearchConfig {
    targetType: GATargetType;
    targetPeriod: number;
    targetLiveCells: number;
    searchRegionSize: number;
    populationSize: number;
    mutationRate: number;
    crossoverRate: number;
    tournamentSize: number;
    maxGenerations: number;
    evaluationSteps: number;
    elitismCount: number;
}

export interface GAIndividual {
    genome: Uint8Array;
    fitness: number;
    evaluated: boolean;
    resultMode: string;
    resultPeriod: number | null;
    resultLifetime: number;
    resultCells: number;
}

export interface GASearchProgress {
    generation: number;
    bestFitness: number;
    avgFitness: number;
    bestIndividual: GAIndividual | null;
    targetType: GATargetType;
    isSearching: boolean;
    history: { generation: number; bestFitness: number; avgFitness: number }[];
}

export interface GASearchResult {
    individual: GAIndividual;
    cells: [number, number][];
    generation: number;
    fitness: number;
}

function stepGOL(grid: Uint8Array, size: number): Uint8Array {
    const next = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let sum = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = ((x + dx) % size + size) % size;
                    const ny = ((y + dy) % size + size) % size;
                    if (grid[ny * size + nx] > 0) sum++;
                }
            }
            const cur = grid[y * size + x] > 0 ? 1 : 0;
            let nxt = 0;
            if (cur === 1) {
                nxt = (sum === 2 || sum === 3) ? 1 : 0;
            } else {
                nxt = (sum === 3) ? 1 : 0;
            }
            next[y * size + x] = nxt;
        }
    }
    return next;
}

function hashGrid(grid: Uint8Array): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < grid.length; i++) {
        h ^= grid[i];
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

function countAlive(grid: Uint8Array): number {
    let c = 0;
    for (let i = 0; i < grid.length; i++) {
        if (grid[i] > 0) c++;
    }
    return c;
}

function centroid(grid: Uint8Array, size: number): [number, number] {
    let sx = 0, sy = 0, c = 0;
    for (let i = 0; i < grid.length; i++) {
        if (grid[i] > 0) {
            sx += i % size;
            sy += Math.floor(i / size);
            c++;
        }
    }
    return c > 0 ? [sx / c, sy / c] : [0, 0];
}

export function evaluateFitness(
    genome: Uint8Array,
    config: GASearchConfig,
): { fitness: number; mode: string; period: number | null; lifetime: number; cells: number } {
    const size = config.searchRegionSize;
    let grid = new Uint8Array(genome);

    const history: { hash: number; centroid: [number, number]; alive: number }[] = [];
    let period: number | null = null;
    let mode = 'unknown';
    let lifetime = 0;
    let maxAlive = 0;
    let totalDrift = 0;

    for (let step = 0; step < config.evaluationSteps; step++) {
        const alive = countAlive(grid);
        maxAlive = Math.max(maxAlive, alive);

        if (alive === 0) {
            lifetime = step;
            break;
        }

        const h = hashGrid(grid);
        const c = centroid(grid, size);
        history.push({ hash: h, centroid: c, alive });

        if (step > 1) {
            for (let p = 2; p <= Math.min(60, history.length - 1); p++) {
                const prev = history[history.length - 1 - p];
                if (h === prev.hash) {
                    period = p;
                    mode = 'oscillator';
                    lifetime = config.evaluationSteps;
                    break;
                }
            }
            if (period !== null) break;

            if (h === history[history.length - 2].hash) {
                mode = 'stable';
                period = 1;
                lifetime = config.evaluationSteps;
                break;
            }
        }

        if (history.length >= 5) {
            const recent = history.slice(-5);
            let dxTotal = 0, dyTotal = 0;
            for (let i = 1; i < recent.length; i++) {
                dxTotal += recent[i].centroid[0] - recent[i - 1].centroid[0];
                dyTotal += recent[i].centroid[1] - recent[i - 1].centroid[1];
            }
            totalDrift = Math.sqrt(dxTotal * dxTotal + dyTotal * dyTotal);
            if (Math.abs(dxTotal) > 2 || Math.abs(dyTotal) > 2) {
                mode = 'glider';
            }
        }

        grid = stepGOL(grid, size);
        lifetime = step + 1;
    }

    if (mode === 'unknown') {
        if (history.length >= 20) {
            const recent = history.slice(-20);
            const hashes = new Set(recent.map(h => h.hash));
            if (hashes.size >= 15) mode = 'chaos';
        }
    }

    let fitness = 0;
    const finalAlive = countAlive(grid);

    switch (config.targetType) {
        case 'oscillator':
            if (period !== null && period >= 2) {
                fitness = 1.0 - Math.min(1.0, Math.abs(period - config.targetPeriod) / 30);
                if (period === config.targetPeriod) fitness = 1.0;
            } else if (mode === 'stable') {
                fitness = 0.3;
            }
            fitness += Math.min(1.0, maxAlive / 100) * 0.2;
            break;

        case 'custom_period':
            if (period !== null) {
                fitness = 1.0 - Math.min(1.0, Math.abs(period - config.targetPeriod) / config.targetPeriod);
                if (period === config.targetPeriod) fitness = 1.0;
            } else if (mode === 'stable') {
                fitness = 0.2;
            }
            break;

        case 'stable':
            if (mode === 'stable') {
                fitness = Math.min(1.0, finalAlive / 50);
            } else if (period === 1) {
                fitness = Math.min(1.0, finalAlive / 50) * 0.9;
            }
            break;

        case 'glider':
            if (mode === 'glider') {
                fitness = Math.min(1.0, totalDrift / 10);
                fitness += Math.min(1.0, finalAlive / 30) * 0.3;
            }
            break;

        case 'chaos':
            if (mode === 'chaos') {
                fitness = Math.min(1.0, lifetime / config.evaluationSteps);
                fitness += Math.min(1.0, maxAlive / 200) * 0.2;
            } else if (mode === 'unknown') {
                fitness = 0.3;
            }
            break;

        case 'max_lifetime':
            fitness = Math.min(1.0, lifetime / config.evaluationSteps);
            if (mode === 'oscillator' || mode === 'stable') {
                fitness += 0.3;
            }
            break;
    }

    return {
        fitness: Math.min(1.0, fitness),
        mode,
        period,
        lifetime,
        cells: finalAlive,
    };
}

function createIndividual(size: number, density: number = 0.3): GAIndividual {
    const genome = new Uint8Array(size * size);
    for (let i = 0; i < genome.length; i++) {
        genome[i] = Math.random() < density ? 1 : 0;
    }
    return {
        genome,
        fitness: 0,
        evaluated: false,
        resultMode: 'unknown',
        resultPeriod: null,
        resultLifetime: 0,
        resultCells: 0,
    };
}

function tournamentSelect(population: GAIndividual[], tournamentSize: number): GAIndividual {
    const best: GAIndividual = {
        genome: new Uint8Array(),
        fitness: -1,
        evaluated: false,
        resultMode: '',
        resultPeriod: null,
        resultLifetime: 0,
        resultCells: 0,
    };
    for (let i = 0; i < tournamentSize; i++) {
        const idx = Math.floor(Math.random() * population.length);
        if (population[idx].fitness > best.fitness) {
            Object.assign(best, population[idx]);
            best.genome = new Uint8Array(population[idx].genome);
        }
    }
    return best;
}

function crossover(parent1: Uint8Array, parent2: Uint8Array, rate: number): [Uint8Array, Uint8Array] {
    if (Math.random() > rate) {
        return [new Uint8Array(parent1), new Uint8Array(parent2)];
    }
    const len = parent1.length;
    const point1 = Math.floor(Math.random() * len);
    const point2 = Math.floor(Math.random() * (len - point1)) + point1;
    const child1 = new Uint8Array(parent1);
    const child2 = new Uint8Array(parent2);
    for (let i = point1; i < point2; i++) {
        child1[i] = parent2[i];
        child2[i] = parent1[i];
    }
    return [child1, child2];
}

function mutate(genome: Uint8Array, rate: number): Uint8Array {
    const mutated = new Uint8Array(genome);
    for (let i = 0; i < mutated.length; i++) {
        if (Math.random() < rate) {
            mutated[i] = mutated[i] > 0 ? 0 : 1;
        }
    }
    return mutated;
}

export function genomeToCells(genome: Uint8Array, size: number): [number, number][] {
    const cells: [number, number][] = [];
    const offset = Math.floor((512 - size) / 2);
    for (let i = 0; i < genome.length; i++) {
        if (genome[i] > 0) {
            const x = (i % size) + offset;
            const y = Math.floor(i / size) + offset;
            cells.push([x, y]);
        }
    }
    return cells;
}

const workerCode = `
${stepGOL.toString()}
${hashGrid.toString()}
${countAlive.toString()}
${centroid.toString()}
${evaluateFitness.toString()}
${createIndividual.toString()}
${tournamentSelect.toString()}
${crossover.toString()}
${mutate.toString()}
${genomeToCells.toString()}

let isSearching = false;
let shouldStop = false;

self.onmessage = function(e) {
    const { type, config } = e.data;

    if (type === 'start') {
        if (isSearching) return;
        isSearching = true;
        shouldStop = false;
        startSearch(config);
    } else if (type === 'stop') {
        shouldStop = true;
        isSearching = false;
    }
};

function startSearch(config) {
    const size = config.searchRegionSize;
    let population = [];
    for (let i = 0; i < config.populationSize; i++) {
        population.push(createIndividual(size, 0.3));
    }

    const history = [];
    let bestOverall = null;
    let bestOverallFitness = -1;

    for (let gen = 0; gen < config.maxGenerations; gen++) {
        if (shouldStop) {
            self.postMessage({ type: 'stopped' });
            return;
        }

        for (let i = 0; i < population.length; i++) {
            if (!population[i].evaluated) {
                const result = evaluateFitness(population[i].genome, config);
                population[i].fitness = result.fitness;
                population[i].evaluated = true;
                population[i].resultMode = result.mode;
                population[i].resultPeriod = result.period;
                population[i].resultLifetime = result.lifetime;
                population[i].resultCells = result.cells;
            }
        }

        population.sort((a, b) => b.fitness - a.fitness);

        const avgFitness = population.reduce((s, p) => s + p.fitness, 0) / population.length;
        const bestFitness = population[0].fitness;

        if (bestFitness > bestOverallFitness) {
            bestOverallFitness = bestFitness;
            bestOverall = {
                ...population[0],
                genome: new Uint8Array(population[0].genome),
            };
        }

        history.push({ generation: gen, bestFitness, avgFitness });

        self.postMessage({
            type: 'progress',
            generation: gen,
            bestFitness,
            avgFitness,
            bestIndividual: bestOverall,
            targetType: config.targetType,
            isSearching: true,
            history,
        });

        if (bestOverallFitness >= 0.999) {
            self.postMessage({
                type: 'complete',
                bestIndividual: bestOverall,
                cells: genomeToCells(bestOverall.genome, size),
                generation: gen,
                fitness: bestOverallFitness,
            });
            isSearching = false;
            return;
        }

        const nextGen = [];
        for (let i = 0; i < config.elitismCount && i < population.length; i++) {
            nextGen.push({
                ...population[i],
                genome: new Uint8Array(population[i].genome),
                evaluated: true,
            });
        }

        while (nextGen.length < config.populationSize) {
            const p1 = tournamentSelect(population, config.tournamentSize);
            const p2 = tournamentSelect(population, config.tournamentSize);
            const [c1, c2] = crossover(p1.genome, p2.genome, config.crossoverRate);
            nextGen.push({
                genome: mutate(c1, config.mutationRate),
                fitness: 0,
                evaluated: false,
                resultMode: 'unknown',
                resultPeriod: null,
                resultLifetime: 0,
                resultCells: 0,
            });
            if (nextGen.length < config.populationSize) {
                nextGen.push({
                    genome: mutate(c2, config.mutationRate),
                    fitness: 0,
                    evaluated: false,
                    resultMode: 'unknown',
                    resultPeriod: null,
                    resultLifetime: 0,
                    resultCells: 0,
                });
            }
        }

        population = nextGen;
    }

    self.postMessage({
        type: 'complete',
        bestIndividual: bestOverall,
        cells: genomeToCells(bestOverall.genome, size),
        generation: config.maxGenerations,
        fitness: bestOverallFitness,
    });
    isSearching = false;
}
`;

export function createGASearchWorker(): Worker {
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    return worker;
}
