package com.powergrid.check.service;

import com.powergrid.check.model.dto.MonteCarloConfig;
import com.powergrid.check.model.dto.OperationStep;
import com.powergrid.check.model.dto.SwitchingOrder;
import com.powergrid.check.model.graph.Breaker;
import com.powergrid.check.model.graph.Load;
import com.powergrid.check.model.graph.PowerDevice;
import com.powergrid.check.repository.PowerDeviceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@Service
@RequiredArgsConstructor
public class MonteCarloSimulationService {

    private final PowerDeviceRepository powerDeviceRepository;
    private final EnergizedAreaService energizedAreaService;
    private final LoadManagementService loadManagementService;

    public static class SimulationResult {
        public int totalIterations;
        public int loadSheddingCount;
        public double loadSheddingProbability;
        public double totalEnergyLossMWh;
        public double expectedEnergyLossMWh;
        public double maxEnergyLossMWh;
        public Map<String, Integer> eventCounts;
        public Map<String, Double> eventProbabilities;
        public long simulationTimeMs;
        public double confidenceInterval;
    }

    public SimulationResult runSimulation(SwitchingOrder order, MonteCarloConfig config) {
        long startTime = System.currentTimeMillis();

        log.info("开始蒙特卡洛仿真，迭代次数: {}, 并行: {}", config.getIterations(), config.isEnableParallelSimulation());

        SimulationResult result;
        if (config.isEnableParallelSimulation() && config.getParallelThreads() > 1) {
            result = runParallelSimulation(order, config);
        } else {
            result = runSequentialSimulation(order, config);
        }

        result.simulationTimeMs = System.currentTimeMillis() - startTime;
        result.confidenceInterval = calculateConfidenceInterval(
                result.loadSheddingProbability,
                result.totalIterations,
                config.getConfidenceLevel()
        );

        log.info("蒙特卡洛仿真完成，耗时: {}ms, 甩负荷概率: {:.4f}%, 期望损失电量: {:.2f} MW·h",
                result.simulationTimeMs,
                result.loadSheddingProbability * 100,
                result.expectedEnergyLossMWh);

        return result;
    }

    private SimulationResult runSequentialSimulation(SwitchingOrder order, MonteCarloConfig config) {
        SimulationResult result = new SimulationResult();
        result.totalIterations = config.getIterations();
        result.eventCounts = new ConcurrentHashMap<>();

        Random random = new Random(config.getRandomSeed());
        double totalEnergyLoss = 0.0;
        double maxLoss = 0.0;
        int loadSheddingCount = 0;

        for (int i = 0; i < config.getIterations(); i++) {
            double loss = simulateSingleIteration(order, config, random, result.eventCounts);
            if (loss > 0) {
                loadSheddingCount++;
                totalEnergyLoss += loss;
                maxLoss = Math.max(maxLoss, loss);
            }

            if (i > 0 && i % 1000 == 0 && i < config.getIterations() - 1) {
                double currentProb = (double) loadSheddingCount / i;
                if (hasConverged(currentProb, (double) loadSheddingCount / (i + 1), config.getConvergenceThreshold())) {
                    log.debug("仿真在第{}次迭代时收敛", i);
                    result.totalIterations = i + 1;
                    break;
                }
            }
        }

        result.loadSheddingCount = loadSheddingCount;
        result.loadSheddingProbability = (double) loadSheddingCount / result.totalIterations;
        result.totalEnergyLossMWh = totalEnergyLoss;
        result.expectedEnergyLossMWh = totalEnergyLoss / result.totalIterations;
        result.maxEnergyLossMWh = maxLoss;

        calculateEventProbabilities(result);

        return result;
    }

    private SimulationResult runParallelSimulation(SwitchingOrder order, MonteCarloConfig config) {
        SimulationResult result = new SimulationResult();
        result.totalIterations = config.getIterations();
        result.eventCounts = new ConcurrentHashMap<>();

        ExecutorService executor = Executors.newFixedThreadPool(config.getParallelThreads());
        AtomicInteger loadSheddingCounter = new AtomicInteger(0);
        AtomicInteger iterationCounter = new AtomicInteger(0);
        double[] totalLossHolder = new double[1];
        double[] maxLossHolder = new double[1];

        int iterationsPerThread = config.getIterations() / config.getParallelThreads();
        List<Future<?>> futures = new ArrayList<>();

        for (int t = 0; t < config.getParallelThreads(); t++) {
            final int threadId = t;
            final int startIter = t * iterationsPerThread;
            final int endIter = (t == config.getParallelThreads() - 1)
                    ? config.getIterations()
                    : (t + 1) * iterationsPerThread;

            futures.add(executor.submit(() -> {
                Random random = new Random(config.getRandomSeed() + threadId * 1000);
                double threadTotalLoss = 0.0;
                double threadMaxLoss = 0.0;
                int threadLoadShedding = 0;

                for (int i = startIter; i < endIter; i++) {
                    double loss = simulateSingleIteration(order, config, random, result.eventCounts);
                    if (loss > 0) {
                        threadLoadShedding++;
                        threadTotalLoss += loss;
                        threadMaxLoss = Math.max(threadMaxLoss, loss);
                    }
                    iterationCounter.incrementAndGet();
                }

                loadSheddingCounter.addAndGet(threadLoadShedding);
                synchronized (totalLossHolder) {
                    totalLossHolder[0] += threadTotalLoss;
                    maxLossHolder[0] = Math.max(maxLossHolder[0], threadMaxLoss);
                }
            }));
        }

        try {
            for (Future<?> future : futures) {
                future.get();
            }
        } catch (Exception e) {
            log.error("并行仿真执行失败", e);
            throw new RuntimeException("并行仿真执行失败", e);
        } finally {
            executor.shutdown();
        }

        result.loadSheddingCount = loadSheddingCounter.get();
        result.loadSheddingProbability = (double) result.loadSheddingCount / result.totalIterations;
        result.totalEnergyLossMWh = totalLossHolder[0];
        result.expectedEnergyLossMWh = totalLossHolder[0] / result.totalIterations;
        result.maxEnergyLossMWh = maxLossHolder[0];

        calculateEventProbabilities(result);

        return result;
    }

    private double simulateSingleIteration(SwitchingOrder order, MonteCarloConfig config,
                                           Random random, Map<String, Integer> eventCounts) {
        Map<String, PowerDevice> virtualState = new HashMap<>();
        boolean hasError = false;
        boolean cascadingFailure = false;
        StringBuilder eventKey = new StringBuilder();

        List<OperationStep> operations = order.getOperations();
        if (operations == null) return 0.0;

        Collections.sort(operations, Comparator.comparingInt(OperationStep::getStepNumber));

        for (OperationStep step : operations) {
            double r = random.nextDouble();

            if (r < config.getOperatorErrorRate()) {
                hasError = true;
                eventKey.append("OP_ERROR_");
                recordEvent(eventCounts, "OPERATOR_ERROR");

                OperationStep.OperationType wrongOp = (step.getOperationType() == OperationStep.OperationType.CLOSE)
                        ? OperationStep.OperationType.OPEN
                        : OperationStep.OperationType.CLOSE;
                applyOperation(virtualState, step.getDeviceId(), wrongOp);
            } else {
                applyOperation(virtualState, step.getDeviceId(), step.getOperationType());
            }

            if (random.nextDouble() < config.getBreakerFailureRate()) {
                hasError = true;
                eventKey.append("BRK_FAIL_");
                recordEvent(eventCounts, "BREAKER_FAILURE");
                String oppositeStatus = "CLOSED".equals(getDeviceStatus(virtualState, step.getDeviceId()))
                        ? "OPEN" : "CLOSED";
                PowerDevice dev = getDeviceFromState(virtualState, step.getDeviceId());
                if (dev != null) {
                    dev.setStatus(oppositeStatus);
                    virtualState.put(step.getDeviceId(), dev);
                }
            }

            if (random.nextDouble() < config.getRelayMalfunctionRate()) {
                hasError = true;
                eventKey.append("RELAY_FAIL_");
                recordEvent(eventCounts, "RELAY_MALFUNCTION");
                cascadingFailure = true;
            }
        }

        if (hasError) {
            double loadLoss = calculateLoadLoss(virtualState);
            if (loadLoss > 0) {
                recordEvent(eventCounts, "LOAD_SHEDDING");
                if (cascadingFailure) {
                    recordEvent(eventCounts, "CASCADING_FAILURE");
                    loadLoss *= 1.5;
                }
                return loadLoss;
            }
        }

        return 0.0;
    }

    private void applyOperation(Map<String, PowerDevice> state, String deviceId, OperationStep.OperationType op) {
        PowerDevice device = getDeviceFromState(state, deviceId);
        if (device == null) return;

        String newStatus = (op == OperationStep.OperationType.CLOSE) ? "CLOSED" : "OPEN";
        device.setStatus(newStatus);
        state.put(deviceId, device);
    }

    private String getDeviceStatus(Map<String, PowerDevice> state, String deviceId) {
        PowerDevice device = getDeviceFromState(state, deviceId);
        return device != null ? device.getStatus() : null;
    }

    private PowerDevice getDeviceFromState(Map<String, PowerDevice> state, String deviceId) {
        if (state.containsKey(deviceId)) {
            return state.get(deviceId);
        }
        Optional<PowerDevice> deviceOpt = powerDeviceRepository.findByDeviceId(deviceId);
        return deviceOpt.orElse(null);
    }

    private double calculateLoadLoss(Map<String, PowerDevice> virtualState) {
        Set<String> energizedArea = energizedAreaService.calculateEnergizedArea(virtualState);
        double lostLoadMW = 0.0;

        Iterable<PowerDevice> allDevices = powerDeviceRepository.findAll();
        for (PowerDevice device : allDevices) {
            if (device instanceof Load) {
                Load load = (Load) device;
                boolean shouldBeEnergized = isConnectedToSource(load);
                boolean actuallyEnergized = energizedArea.contains(load.getDeviceId());

                if (shouldBeEnergized && !actuallyEnergized) {
                    double currentLoad = load.getCurrentLoadMW() != null ? load.getCurrentLoadMW() : 0.0;
                    double loadFactor = load.getLoadFactor() != null ? load.getLoadFactor() : 0.7;
                    lostLoadMW += currentLoad * loadFactor;
                }
            }
        }

        double outageDurationHours = 4.0;
        return lostLoadMW * outageDurationHours;
    }

    private boolean isConnectedToSource(PowerDevice device) {
        if (device instanceof Load && device.getSubstation() != null) {
            return true;
        }
        return "ENERGIZED".equals(device.getStatus()) || "CLOSED".equals(device.getStatus());
    }

    private void recordEvent(Map<String, Integer> eventCounts, String eventType) {
        eventCounts.merge(eventType, 1, Integer::sum);
    }

    private void calculateEventProbabilities(SimulationResult result) {
        result.eventProbabilities = new HashMap<>();
        for (Map.Entry<String, Integer> entry : result.eventCounts.entrySet()) {
            result.eventProbabilities.put(entry.getKey(),
                    (double) entry.getValue() / result.totalIterations);
        }
    }

    private boolean hasConverged(double oldProb, double newProb, double threshold) {
        return Math.abs(newProb - oldProb) < threshold;
    }

    private double calculateConfidenceInterval(double probability, int sampleSize, double confidenceLevel) {
        double zScore;
        if (confidenceLevel >= 0.99) zScore = 2.576;
        else if (confidenceLevel >= 0.95) zScore = 1.96;
        else if (confidenceLevel >= 0.90) zScore = 1.645;
        else zScore = 1.96;

        double stdError = Math.sqrt((probability * (1 - probability)) / sampleSize);
        return zScore * stdError;
    }

    public Map<String, Double> analyzeRiskContribution(SwitchingOrder order, MonteCarloConfig config) {
        Map<String, Double> riskContribution = new HashMap<>();

        List<OperationStep> operations = order.getOperations();
        if (operations == null) return riskContribution;

        for (OperationStep step : operations) {
            MonteCarloConfig stepConfig = new MonteCarloConfig();
            stepConfig.setIterations(Math.min(config.getIterations(), 2000));
            stepConfig.setOperatorErrorRate(0.0);
            stepConfig.setBreakerFailureRate(0.0);
            stepConfig.setRelayMalfunctionRate(0.0);

            if (step.getDeviceType() != null && step.getDeviceType().equals("Breaker")) {
                stepConfig.setBreakerFailureRate(config.getBreakerFailureRate());
            }

            SimulationResult stepResult = runSimulation(order, stepConfig);
            riskContribution.put(step.getDeviceId(), stepResult.expectedEnergyLossMWh);
        }

        return riskContribution;
    }
}
