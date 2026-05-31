package com.powergrid.check.model.dto;

import lombok.Data;

@Data
public class MonteCarloConfig {

    private int iterations = 10000;

    private long randomSeed = 42;

    private double operatorErrorRate = 0.001;

    private double relayMalfunctionRate = 0.0005;

    private double breakerFailureRate = 0.0001;

    private boolean enableParallelSimulation = true;

    private int parallelThreads = 4;

    private double confidenceLevel = 0.95;

    private double convergenceThreshold = 0.001;
}
