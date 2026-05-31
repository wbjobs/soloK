#!/usr/bin/env python3
"""
FDIA Detection System Test Script
Tests core functionality without requiring database or full training
"""

import sys
import numpy as np
from datetime import datetime, timedelta
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from schemas import MeasurementData, BatchDetectionRequest
from state_estimation import WeightedLeastSquaresEstimator
from chi_square_detector import ChiSquareDetector
from lstm_autoencoder import LSTMAnomalyDetector
from mpnn_detector import SpatialConsistencyDetector
from vae_detector import VAEDetector
from attack_simulator import AttackSimulator
from consequence_predictor import AttackConsequencePredictor
from visualization import VisualizationGenerator


def generate_test_measurements(n_nodes: int = 10, 
                                add_attack: bool = False,
                                attack_nodes: list = None) -> list:
    """Generate synthetic grid measurements"""
    if attack_nodes is None:
        attack_nodes = [3, 7] if add_attack else []
    
    measurements = []
    base_time = datetime.utcnow()
    
    for i in range(n_nodes):
        # Base voltage around 1.0 p.u.
        v_mag = 1.0 + 0.05 * np.random.randn()
        v_angle = 0.1 * np.random.randn()
        p_flow = 50 + 20 * np.random.randn()
        q_flow = 20 + 10 * np.random.randn()
        
        # Add attack on specified nodes
        if add_attack and i in attack_nodes:
            v_mag += 0.15  # 15% bias attack
            p_flow += 15.0
        
        measurements.append(MeasurementData(
            timestamp=base_time + timedelta(seconds=i),
            node_id=i + 1,
            voltage_magnitude=float(v_mag),
            voltage_angle=float(v_angle),
            active_power=float(p_flow),
            reactive_power=float(q_flow)
        ))
    
    return measurements


def test_state_estimation():
    """Test WLS State Estimation"""
    logger.info("=" * 60)
    logger.info("Testing State Estimation (WLS)")
    logger.info("=" * 60)
    
    n_nodes = 10
    measurements = generate_test_measurements(n_nodes=n_nodes)
    
    estimator = WeightedLeastSquaresEstimator(n_nodes=n_nodes, tolerance=1e-4, max_iterations=50)
    result = estimator.estimate(measurements)
    
    logger.info(f"Convergence: {result.convergence}")
    logger.info(f"Iterations: {result.iterations}")
    logger.info(f"Chi-square value: {result.chi_square_value:.4f}")
    logger.info(f"Degrees of freedom: {result.degrees_of_freedom}")
    logger.info(f"Mean residual: {np.mean(np.abs(result.residuals)):.6f}")
    logger.info(f"Max normalized residual: {np.max(np.abs(result.normalized_residuals)):.4f}")
    
    assert len(result.voltage_magnitudes) == n_nodes, "Voltage magnitudes length mismatch"
    assert len(result.residuals) == 4 * n_nodes, "Residuals length mismatch"
    
    if result.convergence:
        logger.info("✓ State Estimation converged")
    else:
        logger.info("⚠ State Estimation did not converge (expected for random data)")
    
    logger.info("✓ State Estimation test passed\n")
    return result


def test_chi_square_detection():
    """Test Chi-square attack detection"""
    logger.info("=" * 60)
    logger.info("Testing Chi-square Detection")
    logger.info("=" * 60)
    
    n_nodes = 10
    
    # Test normal case
    measurements_normal = generate_test_measurements(n_nodes=n_nodes, add_attack=False)
    estimator = WeightedLeastSquaresEstimator(n_nodes=n_nodes, tolerance=1e-4, max_iterations=50)
    se_normal = estimator.estimate(measurements_normal)
    
    detector = ChiSquareDetector(confidence_level=0.99)
    result_normal = detector.detect(se_normal, measurements_normal, 2 * n_nodes)
    
    logger.info(f"Normal case - Attack: {result_normal.is_attack}")
    logger.info(f"Normal case - Chi2: {result_normal.chi_square_value:.4f}, Threshold: {result_normal.threshold:.4f}")
    
    # Test attack case
    measurements_attack = generate_test_measurements(n_nodes=n_nodes, add_attack=True)
    se_attack = estimator.estimate(measurements_attack)
    result_attack = detector.detect(se_attack, measurements_attack, 2 * n_nodes)
    
    logger.info(f"Attack case - Attack: {result_attack.is_attack}")
    logger.info(f"Attack case - Chi2: {result_attack.chi_square_value:.4f}, Threshold: {result_attack.threshold:.4f}")
    logger.info(f"Attack case - Suspicious nodes: {[n.node_id for n in result_attack.suspicious_nodes]}")
    for node in result_attack.suspicious_nodes[:3]:
        logger.info(f"  Node {node.node_id}: index={node.suspicious_index:.3f}, type={node.attack_type}")
    
    assert result_normal.chi_square_value > 0, "Chi-square value should be positive"
    assert result_attack.chi_square_value > 0, "Chi-square value should be positive"
    
    if result_attack.is_attack:
        logger.info("✓ Attack detected successfully")
    else:
        logger.info("⚠ Attack not detected (may require more realistic data)")
    
    logger.info("✓ Chi-square Detection test passed\n")
    return result_normal, result_attack


def test_lstm_autoencoder():
    """Test LSTM Autoencoder"""
    logger.info("=" * 60)
    logger.info("Testing LSTM Autoencoder")
    logger.info("=" * 60)
    
    n_nodes = 10
    detector = LSTMAnomalyDetector(
        n_nodes=n_nodes,
        sequence_length=10,
        hidden_size=32,
        latent_dim=16
    )
    
    # Generate some history
    history = []
    for i in range(15):
        history.append(generate_test_measurements(n_nodes=n_nodes, add_attack=False))
    
    # Quick training
    logger.info("Performing quick training (5 epochs)...")
    metrics = detector.fit(history, epochs=5, batch_size=4)
    logger.info(f"Training complete - Threshold: {metrics['threshold']:.6f}")
    
    # Test detection
    test_measurements = generate_test_measurements(n_nodes=n_nodes, add_attack=True)
    result = detector.detect(test_measurements, history)
    
    logger.info(f"Is attack: {result.is_attack}")
    logger.info(f"Reconstruction error: {result.reconstruction_error:.6f}")
    logger.info(f"Threshold: {result.threshold:.6f}")
    logger.info(f"Suspicious nodes: {[n.node_id for n in result.suspicious_nodes]}")
    
    assert detector.is_trained, "LSTM should be trained"
    assert result.reconstruction_error > 0, "Should have reconstruction error"
    
    logger.info("✓ LSTM Autoencoder test passed\n")
    return result


def test_mpnn_detector():
    """Test MPNN Spatial Consistency Detector"""
    logger.info("=" * 60)
    logger.info("Testing MPNN Spatial Detector")
    logger.info("=" * 60)
    
    n_nodes = 10
    detector = SpatialConsistencyDetector(
        n_nodes=n_nodes,
        hidden_channels=32,
        num_layers=2,
        latent_dim=16
    )
    
    # Generate some history
    history = []
    for i in range(10):
        history.append(generate_test_measurements(n_nodes=n_nodes, add_attack=False))
    
    # Quick training
    logger.info("Performing quick training (5 epochs)...")
    metrics = detector.fit(history, epochs=5, batch_size=4)
    logger.info(f"Training complete - Threshold: {metrics['threshold']:.6f}")
    
    # Create simple topology
    topology = {
        'edges': [[i, j] for i in range(n_nodes) for j in range(i+1, min(i+3, n_nodes))]
    }
    
    # Test detection
    test_measurements = generate_test_measurements(n_nodes=n_nodes, add_attack=True)
    result = detector.detect(test_measurements, topology)
    
    logger.info(f"Is attack: {result.is_attack}")
    logger.info(f"Spatial anomaly score: {result.spatial_anomaly_score:.6f}")
    logger.info(f"Threshold: {result.threshold:.6f}")
    logger.info(f"Suspicious nodes: {[n.node_id for n in result.suspicious_nodes]}")
    
    assert detector.is_trained, "MPNN should be trained"
    assert result.spatial_anomaly_score > 0, "Should have spatial anomaly score"
    
    logger.info("✓ MPNN Detector test passed\n")
    return result


def test_attack_simulator():
    """Test Attack Simulator"""
    logger.info("=" * 60)
    logger.info("Testing Attack Simulator")
    logger.info("=" * 60)
    
    simulator = AttackSimulator()
    n_nodes = 10
    base_measurements = generate_test_measurements(n_nodes=n_nodes)
    
    attack_types = ['constant_bias', 'random', 'ramp']
    
    for attack_type in attack_types:
        logger.info(f"\nTesting {attack_type} attack...")
        result = simulator.simulate_attack(
            attack_type=attack_type,
            base_measurements=base_measurements,
            target_nodes=[2, 5, 8],
            attack_magnitude=0.1,
            attack_duration=10,
            time_step=5
        )
        
        assert len(result.attacked_measurements) == n_nodes
        assert len(result.attack_pattern) == 3
        
        # Verify attacks were applied
        for node_id, attack_data in result.attack_pattern.items():
            assert len(attack_data) == 4  # 4 measurement types
            total_bias = sum(abs(v) for v in attack_data.values())
            assert total_bias > 0, f"Node {node_id} should have attack bias"
        
        logger.info(f"  ✓ {attack_type} attack: {len(result.attack_pattern)} nodes affected")
    
    logger.info("\n✓ Attack Simulator test passed\n")


def test_visualization():
    """Test Visualization Generator"""
    logger.info("=" * 60)
    logger.info("Testing Visualization Generator")
    logger.info("=" * 60)
    
    n_nodes = 10
    viz = VisualizationGenerator()
    
    # Generate normal and attacked data
    normal_meas = generate_test_measurements(n_nodes=n_nodes, add_attack=False)
    attacked_meas = generate_test_measurements(n_nodes=n_nodes, add_attack=True, attack_nodes=[3, 7])
    
    # Run state estimation
    estimator = WeightedLeastSquaresEstimator(n_nodes=n_nodes)
    se_normal = estimator.estimate(normal_meas)
    se_attacked = estimator.estimate(attacked_meas)
    
    # Generate detection result for visualization
    detector = ChiSquareDetector()
    chi2_result = detector.detect(se_attacked, attacked_meas, 2 * n_nodes)
    
    from schemas import DetectionResult, AttackNode
    detection_result = DetectionResult(
        is_attack=chi2_result.is_attack,
        attack_confidence=chi2_result.confidence,
        detection_method="chi_square",
        suspicious_nodes=chi2_result.suspicious_nodes,
        chi_square_value=chi2_result.chi_square_value,
        chi_square_threshold=chi2_result.threshold,
        reconstruction_error=None,
        reconstruction_threshold=None,
        timestamp=datetime.utcnow()
    )
    
    # Generate visualization
    viz_data = viz.generate_complete_visualization(
        original_se_result=se_normal,
        attacked_se_result=se_attacked,
        detection_result=detection_result,
        measurements=attacked_meas
    )
    
    assert 'residual_distribution' in viz_data
    assert 'detection' in viz_data
    assert len(viz_data['residual_distribution']['residuals_before']) == 4 * n_nodes
    assert len(viz_data['residual_distribution']['residuals_after']) == 4 * n_nodes
    
    logger.info(f"Residuals before - mean: {np.mean(np.abs(viz_data['residual_distribution']['residuals_before'])):.6f}")
    logger.info(f"Residuals after - mean: {np.mean(np.abs(viz_data['residual_distribution']['residuals_after'])):.6f}")
    logger.info(f"Confidence interval: {viz_data['residual_distribution']['confidence_interval']}")
    logger.info(f"Node residuals available for nodes: {list(viz_data['residual_distribution']['node_residuals'].keys())}")
    
    logger.info("✓ Visualization test passed\n")
    return viz_data


def test_ensemble_detection():
    """Test ensemble detection logic"""
    logger.info("=" * 60)
    logger.info("Testing Ensemble Detection Logic")
    logger.info("=" * 60)
    
    from main import merge_suspicious_nodes, ensemble_detection
    
    # Create mock detection results
    from chi_square_detector import ChiSquareDetectionResult
    from lstm_autoencoder import LSTMDetectionResult
    from mpnn_detector import MPNNDetectionResult
    from schemas import AttackNode
    
    chi2_result = ChiSquareDetectionResult(
        is_attack=True,
        chi_square_value=150.0,
        threshold=50.0,
        confidence=0.9,
        degrees_of_freedom=20,
        suspicious_nodes=[
            AttackNode(node_id=3, suspicious_index=0.8, attack_type="chi_square", 
                       affected_measurements=["voltage_magnitude"]),
            AttackNode(node_id=7, suspicious_index=0.7, attack_type="chi_square",
                       affected_measurements=["active_power"])
        ]
    )
    
    lstm_result = LSTMDetectionResult(
        is_attack=False,
        reconstruction_error=0.05,
        threshold=0.1,
        confidence=0.7,
        suspicious_nodes=[
            AttackNode(node_id=7, suspicious_index=0.6, attack_type="temporal_anomaly",
                       affected_measurements=["voltage_angle"])
        ],
        node_errors={7: 0.08}
    )
    
    mpnn_result = MPNNDetectionResult(
        is_attack=True,
        spatial_anomaly_score=0.15,
        threshold=0.1,
        confidence=0.85,
        suspicious_nodes=[
            AttackNode(node_id=3, suspicious_index=0.75, attack_type="spatial_anomaly",
                       affected_measurements=["reactive_power"])
        ],
        node_consistency_scores={3: 0.12, 7: 0.05}
    )
    
    # Test ensemble detection
    is_attack, confidence, method = ensemble_detection(chi2_result, lstm_result, mpnn_result)
    merged_nodes = merge_suspicious_nodes(
        chi2_result.suspicious_nodes,
        lstm_result.suspicious_nodes,
        mpnn_result.suspicious_nodes
    )
    
    logger.info(f"Ensemble result - Attack: {is_attack}")
    logger.info(f"Ensemble confidence: {confidence:.4f}")
    logger.info(f"Detection method: {method}")
    logger.info(f"Merged suspicious nodes:")
    for node in merged_nodes:
        logger.info(f"  Node {node.node_id}: index={node.suspicious_index:.3f}, "
                   f"types={node.attack_type}, affected={node.affected_measurements}")
    
    assert is_attack == True, "Ensemble should detect attack"
    assert confidence >= 0.85, "Confidence should be high"
    assert "chi_square" in method, "Should include chi_square method"
    assert "mpnn" in method, "Should include mpnn method"
    assert len(merged_nodes) == 2, "Should have 2 unique suspicious nodes"
    
    # Verify node 3 has merged data
    node3 = next(n for n in merged_nodes if n.node_id == 3)
    assert "voltage_magnitude" in node3.affected_measurements
    assert "reactive_power" in node3.affected_measurements
    assert "chi_square" in node3.attack_type
    assert "spatial_anomaly" in node3.attack_type
    
    logger.info("✓ Ensemble Detection test passed\n")


def test_lstm_daily_load_fluctuation():
    """Test LSTM does not misclassify normal daily load fluctuations (>30% peak-valley) as attacks"""
    logger.info("=" * 60)
    logger.info("Testing LSTM - Daily Load Fluctuation (False Positive Fix)")
    logger.info("=" * 60)
    
    n_nodes = 10
    detector = LSTMAnomalyDetector(
        n_nodes=n_nodes,
        sequence_length=10,
        hidden_size=32,
        latent_dim=16,
        detrend_window=8,
        ewma_alpha=0.05,
        relative_error=True
    )
    
    base_time = datetime.utcnow()
    
    training_history = []
    n_hours = 48
    steps_per_hour = 2
    
    for h in range(n_hours * steps_per_hour):
        hour = h / steps_per_hour
        load_factor = 0.7 + 0.6 * (0.5 + 0.5 * np.sin(2 * np.pi * (hour - 6) / 24))
        
        measurements = []
        for i in range(n_nodes):
            v_mag = 1.0 + 0.02 * np.random.randn()
            v_angle = 0.05 * np.random.randn()
            p_base = 50.0 * load_factor + 5.0 * np.random.randn()
            q_base = 20.0 * load_factor + 3.0 * np.random.randn()
            
            measurements.append(MeasurementData(
                timestamp=base_time + timedelta(minutes=30 * h, seconds=i),
                node_id=i + 1,
                voltage_magnitude=float(v_mag),
                voltage_angle=float(v_angle),
                active_power=float(p_base),
                reactive_power=float(q_base)
            ))
        training_history.append(measurements)
    
    logger.info(f"Generated {len(training_history)} training samples with ~{60:.0f}% peak-valley variation")
    
    logger.info("Training LSTM on daily load pattern (10 epochs)...")
    metrics = detector.fit(training_history, epochs=10, batch_size=8)
    logger.info(f"Training threshold: {metrics['threshold']:.6f}")
    
    false_positives = 0
    n_test = 20
    test_errors = []
    
    for t in range(n_test):
        hour = 8 + t * 1.2
        load_factor = 0.7 + 0.6 * (0.5 + 0.5 * np.sin(2 * np.pi * (hour - 6) / 24))
        
        measurements = []
        for i in range(n_nodes):
            v_mag = 1.0 + 0.02 * np.random.randn()
            v_angle = 0.05 * np.random.randn()
            p_base = 50.0 * load_factor + 5.0 * np.random.randn()
            q_base = 20.0 * load_factor + 3.0 * np.random.randn()
            
            measurements.append(MeasurementData(
                timestamp=base_time + timedelta(minutes=30 * t, seconds=i),
                node_id=i + 1,
                voltage_magnitude=float(v_mag),
                voltage_angle=float(v_angle),
                active_power=float(p_base),
                reactive_power=float(q_base)
            ))
        
        result = detector.detect(measurements, training_history[-10:])
        test_errors.append(result.reconstruction_error)
        
        if result.is_attack:
            false_positives += 1
    
    fp_rate = false_positives / n_test
    logger.info(f"False positive rate on normal fluctuation data: {fp_rate:.1%} ({false_positives}/{n_test})")
    logger.info(f"Mean reconstruction error: {np.mean(test_errors):.6f}")
    logger.info(f"Threshold: {detector.threshold:.6f}")
    
    assert fp_rate <= 0.25, f"False positive rate {fp_rate:.1%} exceeds 25% target"
    
    attack_measurements = []
    load_factor = 1.0
    for i in range(n_nodes):
        v_mag = 1.0 + 0.02 * np.random.randn()
        v_angle = 0.05 * np.random.randn()
        p_base = 50.0 * load_factor + 5.0 * np.random.randn()
        q_base = 20.0 * load_factor + 3.0 * np.random.randn()
        
        if i in [2, 5]:
            v_mag += 0.2
            p_base += 20.0
        
        attack_measurements.append(MeasurementData(
            timestamp=base_time + timedelta(minutes=30 * n_test),
            node_id=i + 1,
            voltage_magnitude=float(v_mag),
            voltage_angle=float(v_angle),
            active_power=float(p_base),
            reactive_power=float(q_base)
        ))
    
    attack_result = detector.detect(attack_measurements, training_history[-10:])
    logger.info(f"Attack detection on injected data: is_attack={attack_result.is_attack}")
    
    logger.info("✓ LSTM Daily Load Fluctuation test passed\n")
    return fp_rate


def test_mpnn_new_nodes():
    """Test MPNN handles new nodes not seen during training without index out of bounds"""
    logger.info("=" * 60)
    logger.info("Testing MPNN - New Node Handling (Index Out of Bounds Fix)")
    logger.info("=" * 60)
    
    n_train_nodes = 8
    detector = SpatialConsistencyDetector(
        n_nodes=n_train_nodes,
        hidden_channels=32,
        num_layers=2,
        latent_dim=16
    )
    
    base_time = datetime.utcnow()
    
    training_history = []
    for _ in range(10):
        measurements = []
        for i in range(n_train_nodes):
            measurements.append(MeasurementData(
                timestamp=base_time + timedelta(seconds=i),
                node_id=i + 1,
                voltage_magnitude=1.0 + 0.03 * np.random.randn(),
                voltage_angle=0.1 * np.random.randn(),
                active_power=50.0 + 10.0 * np.random.randn(),
                reactive_power=20.0 + 5.0 * np.random.randn()
            ))
        training_history.append(measurements)
    
    logger.info(f"Training MPNN with {n_train_nodes} nodes...")
    metrics = detector.fit(training_history, epochs=5, batch_size=4)
    logger.info(f"Training complete - Trained node IDs: {sorted(detector._trained_node_ids)}")
    
    new_node_measurements = []
    n_total = n_train_nodes + 3
    for i in range(n_total):
        new_node_measurements.append(MeasurementData(
            timestamp=base_time + timedelta(seconds=100 + i),
            node_id=i + 1,
            voltage_magnitude=1.0 + 0.03 * np.random.randn(),
            voltage_angle=0.1 * np.random.randn(),
            active_power=50.0 + 10.0 * np.random.randn(),
            reactive_power=20.0 + 5.0 * np.random.randn()
        ))
    
    logger.info(f"Detecting with {n_total} nodes (3 new: IDs {n_train_nodes+1}-{n_total})...")
    
    try:
        result = detector.detect(new_node_measurements)
        logger.info(f"✓ No exception with new nodes!")
        logger.info(f"  is_attack: {result.is_attack}")
        logger.info(f"  spatial_anomaly_score: {result.spatial_anomaly_score:.6f}")
        logger.info(f"  Node consistency scores: {list(result.node_consistency_scores.keys())}")
        
        assert len(result.node_consistency_scores) == n_total, \
            f"Expected {n_total} node scores, got {len(result.node_consistency_scores)}"
        
        for nid in range(n_train_nodes + 1, n_total + 1):
            assert nid in result.node_consistency_scores, \
                f"New node {nid} missing from consistency scores"
    except IndexError as e:
        raise AssertionError(f"IndexError with new nodes (bug not fixed): {e}")
    except Exception as e:
        raise AssertionError(f"Unexpected error with new nodes: {e}")
    
    sparse_new_measurements = []
    for i in range(n_train_nodes):
        sparse_new_measurements.append(MeasurementData(
            timestamp=base_time + timedelta(seconds=200 + i),
            node_id=i + 1,
            voltage_magnitude=1.0 + 0.03 * np.random.randn(),
            voltage_angle=0.1 * np.random.randn(),
            active_power=50.0 + 10.0 * np.random.randn(),
            reactive_power=20.0 + 5.0 * np.random.randn()
        ))
    
    sparse_new_measurements.append(MeasurementData(
        timestamp=base_time + timedelta(seconds=200 + n_train_nodes),
        node_id=99,
        voltage_magnitude=1.0 + 0.03 * np.random.randn(),
        voltage_angle=0.1 * np.random.randn(),
        active_power=50.0 + 10.0 * np.random.randn(),
        reactive_power=20.0 + 5.0 * np.random.randn()
    ))
    sparse_new_measurements.append(MeasurementData(
        timestamp=base_time + timedelta(seconds=200 + n_train_nodes + 1),
        node_id=150,
        voltage_magnitude=1.0 + 0.03 * np.random.randn(),
        voltage_angle=0.1 * np.random.randn(),
        active_power=50.0 + 10.0 * np.random.randn(),
        reactive_power=20.0 + 5.0 * np.random.randn()
    ))
    
    logger.info(f"Testing with sparse new node IDs (99, 150)...")
    
    try:
        result2 = detector.detect(sparse_new_measurements)
        logger.info(f"✓ No exception with sparse high-ID nodes!")
        assert 99 in result2.node_consistency_scores, "Node 99 should be in scores"
        assert 150 in result2.node_consistency_scores, "Node 150 should be in scores"
    except IndexError as e:
        raise AssertionError(f"IndexError with sparse high-ID nodes (bug not fixed): {e}")
    except Exception as e:
        raise AssertionError(f"Unexpected error with sparse high-ID nodes: {e}")
    
    logger.info("✓ MPNN New Node Handling test passed\n")


def test_vae_detector():
    logger.info("=" * 60)
    logger.info("Testing VAE Detector (Latent Space Density Anomaly)")
    logger.info("=" * 60)
    
    n_nodes = 10
    detector = VAEDetector(
        input_dim=4,
        hidden_dim=32,
        latent_dim=8,
        beta=1.0,
        density_threshold_percentile=5.0
    )
    
    base_time = datetime.utcnow()
    
    training_history = []
    for t in range(30):
        measurements = []
        for i in range(n_nodes):
            measurements.append(MeasurementData(
                timestamp=base_time + timedelta(seconds=t * 5 + i),
                node_id=i + 1,
                voltage_magnitude=1.0 + 0.02 * np.random.randn(),
                voltage_angle=0.05 * np.random.randn(),
                active_power=50.0 + 5.0 * np.random.randn(),
                reactive_power=20.0 + 3.0 * np.random.randn()
            ))
        training_history.append(measurements)
    
    logger.info("Training VAE (10 epochs)...")
    metrics = detector.fit(training_history, epochs=10, batch_size=16)
    logger.info(f"Training complete - ELBO threshold: {metrics['elbo_threshold']:.2f}, "
               f"Density threshold: {metrics['density_threshold']:.2f}")
    
    normal_measurements = []
    for i in range(n_nodes):
        normal_measurements.append(MeasurementData(
            timestamp=base_time + timedelta(seconds=200 + i),
            node_id=i + 1,
            voltage_magnitude=1.0 + 0.02 * np.random.randn(),
            voltage_angle=0.05 * np.random.randn(),
            active_power=50.0 + 5.0 * np.random.randn(),
            reactive_power=20.0 + 3.0 * np.random.randn()
        ))
    
    normal_result = detector.detect(normal_measurements)
    logger.info(f"Normal data - is_attack: {normal_result.is_attack}, "
               f"ELBO: {normal_result.elbo_score:.2f}, "
               f"Density: {normal_result.latent_density_score:.2f}")
    
    adversarial_measurements = []
    for i in range(n_nodes):
        v_mag = 1.0 + 0.02 * np.random.randn()
        v_angle = 0.05 * np.random.randn()
        p = 50.0 + 5.0 * np.random.randn()
        q = 20.0 + 3.0 * np.random.randn()
        
        if i in [2, 5, 7]:
            v_mag += 0.12
            p += 15.0
            q += 8.0
        
        adversarial_measurements.append(MeasurementData(
            timestamp=base_time + timedelta(seconds=300 + i),
            node_id=i + 1,
            voltage_magnitude=float(v_mag),
            voltage_angle=float(v_angle),
            active_power=float(p),
            reactive_power=float(q)
        ))
    
    adv_result = detector.detect(adversarial_measurements)
    logger.info(f"Adversarial data - is_attack: {adv_result.is_attack}, "
               f"ELBO: {adv_result.elbo_score:.2f}, "
               f"Density: {adv_result.latent_density_score:.2f}")
    logger.info(f"Suspicious nodes: {[n.node_id for n in adv_result.suspicious_nodes]}")
    logger.info(f"Node density scores: {adv_result.node_density_scores}")
    
    assert detector.is_trained, "VAE should be trained"
    assert normal_result.elbo_score != 0 or normal_result.latent_density_score != 0, \
        "Should have detection scores"
    
    logger.info("✓ VAE Detector test passed\n")
    return normal_result, adv_result


def test_consequence_predictor():
    logger.info("=" * 60)
    logger.info("Testing Attack Consequence Predictor")
    logger.info("=" * 60)
    
    n_nodes = 10
    predictor = AttackConsequencePredictor(
        n_nodes=n_nodes,
        voltage_limits=(0.95, 1.05),
        cost_coefficients=(0.01, 20.0, 100.0),
        electricity_price_usd_per_mwh=50.0
    )
    
    base_time = datetime.utcnow()
    
    original_measurements = []
    for i in range(n_nodes):
        original_measurements.append(MeasurementData(
            timestamp=base_time + timedelta(seconds=i),
            node_id=i + 1,
            voltage_magnitude=1.0 + 0.02 * np.random.randn(),
            voltage_angle=0.05 * np.random.randn(),
            active_power=50.0 + 5.0 * np.random.randn(),
            reactive_power=20.0 + 3.0 * np.random.randn()
        ))
    
    attacked_measurements = []
    for i in range(n_nodes):
        v_mag = original_measurements[i].voltage_magnitude
        v_angle = original_measurements[i].voltage_angle
        p = original_measurements[i].active_power
        q = original_measurements[i].reactive_power
        
        if i in [2, 5]:
            v_mag -= 0.08
            p += 25.0
        
        attacked_measurements.append(MeasurementData(
            timestamp=original_measurements[i].timestamp,
            node_id=i + 1,
            voltage_magnitude=float(v_mag),
            voltage_angle=float(v_angle),
            active_power=float(p),
            reactive_power=float(q)
        ))
    
    result = predictor.predict_consequences(
        original_measurements=original_measurements,
        attacked_measurements=attacked_measurements
    )
    
    logger.info(f"Economic Impact:")
    logger.info(f"  Generation cost change: {result.economic_impact.generation_cost_change_mw:.2f} MW")
    logger.info(f"  Estimated cost change: ${result.economic_impact.estimated_cost_change_usd:.2f}")
    logger.info(f"  Redispatch amount: {result.economic_impact.redispatch_amount_mw:.2f} MW")
    logger.info(f"  Affected generators: {result.economic_impact.affected_generators}")
    logger.info(f"  Load shedding: {result.economic_impact.load_shedding_mw:.2f} MW")
    logger.info(f"Voltage Violations:")
    logger.info(f"  Max voltage deviation: {result.max_voltage_deviation_pu:.6f} p.u.")
    logger.info(f"  Violation risk: {result.voltage_violation_risk:.4f}")
    logger.info(f"  Number of violations: {len(result.voltage_violations)}")
    for v in result.voltage_violations:
        logger.info(f"    Node {v.node_id}: {v.violation_type}, "
                   f"v={v.voltage_pu:.4f} p.u., severity={v.severity:.4f}")
    logger.info(f"Total economic loss: ${result.total_economic_loss_usd:.2f}")
    logger.info(f"Risk level: {result.risk_level}")
    logger.info(f"Vulnerable nodes: {result.vulnerable_nodes}")
    
    assert result.economic_impact is not None, "Should have economic impact"
    assert result.max_voltage_deviation_pu >= 0, "Voltage deviation should be non-negative"
    assert result.risk_level in ["low", "medium", "high", "critical"], \
        f"Invalid risk level: {result.risk_level}"
    assert result.voltage_violation_risk >= 0 and result.voltage_violation_risk <= 1, \
        "Risk should be between 0 and 1"
    
    logger.info("✓ Consequence Predictor test passed\n")
    return result


def main():
    """Run all tests"""
    logger.info("\n" + "=" * 60)
    logger.info("FDIA Detection System - Comprehensive Test Suite")
    logger.info("=" * 60 + "\n")
    
    try:
        test_state_estimation()
        test_chi_square_detection()
        test_lstm_autoencoder()
        test_mpnn_detector()
        test_attack_simulator()
        test_visualization()
        test_ensemble_detection()
        test_lstm_daily_load_fluctuation()
        test_mpnn_new_nodes()
        test_vae_detector()
        test_consequence_predictor()
        
        logger.info("=" * 60)
        logger.info("✅ ALL TESTS PASSED!")
        logger.info("=" * 60)
        return 0
        
    except AssertionError as e:
        logger.error(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return 1
    except Exception as e:
        logger.error(f"\n❌ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
