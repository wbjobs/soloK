from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Optional, Any
from datetime import datetime
import uuid
import logging
import os
from collections import deque

from config import settings
from schemas import (
    MeasurementData, BatchDetectionRequest, DetectionResult,
    SimulateAttackRequest, SimulateAttackResponse, AttackNode,
    VisualizationData, VAEDetectionRequest, VAEDetectionResponse,
    ConsequencePredictionRequest, ConsequencePredictionResponse,
    VoltageViolationInfo, EconomicImpactInfo
)
from state_estimation import WeightedLeastSquaresEstimator
from chi_square_detector import ChiSquareDetector
from lstm_autoencoder import LSTMAnomalyDetector
from mpnn_detector import SpatialConsistencyDetector
from vae_detector import VAEDetector
from attack_simulator import AttackSimulator
from consequence_predictor import AttackConsequencePredictor
from shap_explainer import SHAPExplainer
from visualization import VisualizationGenerator
from incremental_learning import IncrementalLearningManager
from database import DatabaseManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="电网虚假数据注入攻击(FDIA)检测API服务"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

db_manager = DatabaseManager()

se_estimator = WeightedLeastSquaresEstimator(n_nodes=settings.max_nodes)
chi_square_detector = ChiSquareDetector(confidence_level=settings.chi_square_confidence)
lstm_detector = LSTMAnomalyDetector(
    n_nodes=settings.max_nodes,
    sequence_length=settings.lstm_sequence_length,
    hidden_size=settings.lstm_hidden_size,
    latent_dim=settings.lstm_latent_dim,
    detrend_window=settings.lstm_detrend_window,
    ewma_alpha=settings.lstm_ewma_alpha,
    relative_error=settings.lstm_relative_error
)
mpnn_detector = SpatialConsistencyDetector(
    n_nodes=settings.max_nodes,
    hidden_channels=settings.mpnn_hidden_channels,
    num_layers=settings.mpnn_num_layers
)
vae_detector = VAEDetector(
    input_dim=4,
    hidden_dim=settings.vae_hidden_dim,
    latent_dim=settings.vae_latent_dim,
    beta=settings.vae_beta,
    density_threshold_percentile=settings.vae_density_threshold_percentile
)
attack_simulator = AttackSimulator()
consequence_predictor = AttackConsequencePredictor(
    n_nodes=settings.max_nodes,
    voltage_limits=(settings.consequence_voltage_min, settings.consequence_voltage_max),
    cost_coefficients=(settings.consequence_cost_a, settings.consequence_cost_b, settings.consequence_cost_c),
    electricity_price_usd_per_mwh=settings.consequence_electricity_price
)
shap_explainer = SHAPExplainer(
    lstm_detector=lstm_detector,
    mpnn_detector=mpnn_detector,
    se_estimator=se_estimator
)
visualization_generator = VisualizationGenerator()

incremental_manager = IncrementalLearningManager(
    lstm_detector=lstm_detector,
    mpnn_detector=mpnn_detector,
    chi_square_detector=chi_square_detector,
    db_manager=db_manager
)

measurement_history = deque(maxlen=1000)

os.makedirs(settings.model_save_path, exist_ok=True)


def merge_suspicious_nodes(*node_lists: List[AttackNode]) -> List[AttackNode]:
    node_map = {}
    
    for node_list in node_lists:
        for node in node_list:
            node_id = node.node_id
            if node_id not in node_map:
                node_map[node_id] = {
                    'suspicious_index': 0.0,
                    'attack_types': [],
                    'affected_measurements': set()
                }
            
            node_map[node_id]['suspicious_index'] = max(
                node_map[node_id]['suspicious_index'],
                node.suspicious_index
            )
            
            if node.attack_type and node.attack_type not in node_map[node_id]['attack_types']:
                node_map[node_id]['attack_types'].append(node.attack_type)
            
            for meas in node.affected_measurements:
                node_map[node_id]['affected_measurements'].add(meas)
    
    result = []
    for node_id, data in node_map.items():
        attack_type_str = ','.join(data['attack_types']) if data['attack_types'] else None
        result.append(AttackNode(
            node_id=node_id,
            suspicious_index=min(1.0, data['suspicious_index']),
            attack_type=attack_type_str,
            affected_measurements=list(data['affected_measurements'])
        ))
    
    result.sort(key=lambda x: x.suspicious_index, reverse=True)
    return result


def ensemble_detection(chi2_result, lstm_result, mpnn_result, vae_result=None) -> tuple:
    results = [chi2_result, lstm_result, mpnn_result]
    if vae_result is not None:
        results.append(vae_result)
    
    is_attack = any(r.is_attack for r in results)
    
    confidences = []
    for r in results:
        if r.is_attack:
            confidences.append(r.confidence)
    
    if confidences:
        attack_confidence = max(confidences)
    else:
        normal_confs = [1 - r.confidence for r in results if hasattr(r, 'confidence')]
        attack_confidence = 1 - min(normal_confs) if normal_confs else 0.0
    
    detection_methods = []
    if chi2_result.is_attack:
        detection_methods.append("chi_square")
    if lstm_result.is_attack:
        detection_methods.append("lstm_autoencoder")
    if mpnn_result.is_attack:
        detection_methods.append("mpnn")
    if vae_result is not None and vae_result.is_attack:
        detection_methods.append("vae")
    
    detection_method = "+".join(detection_methods) if detection_methods else "normal"
    
    return is_attack, attack_confidence, detection_method


@app.on_event("startup")
async def startup_event():
    try:
        db_manager.init_database()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.warning(f"Database initialization failed (may not be available): {e}")
    
    logger.info("FDIA Detection API started successfully")


@app.get("/")
async def root():
    return {
        "name": settings.app_name,
        "version": settings.version,
        "endpoints": {
            "POST /batch_detect": "批量检测攻击",
            "POST /simulate_attack": "模拟攻击",
            "POST /detect/vae": "VAE潜在空间密度异常检测",
            "POST /predict_consequences": "攻击后果预测（经济损失+电压越限）",
            "GET /visualization/{batch_id}": "获取可视化数据",
            "POST /update_models": "触发模型更新",
            "GET /model_status": "获取模型状态",
            "GET /detection_history": "获取检测历史"
        }
    }


@app.post("/batch_detect", response_model=DetectionResult)
async def batch_detect(
    request: BatchDetectionRequest,
    background_tasks: BackgroundTasks
):
    try:
        batch_id = str(uuid.uuid4())
        measurements = request.measurements
        
        if len(measurements) == 0:
            raise HTTPException(status_code=400, detail="No measurements provided")
        
        if len(measurements) > settings.max_nodes:
            raise HTTPException(
                status_code=400, 
                detail=f"Too many nodes. Maximum allowed: {settings.max_nodes}"
            )
        
        logger.info(f"Processing batch {batch_id} with {len(measurements)} nodes")
        
        n_nodes = len(measurements)
        se_estimator_local = WeightedLeastSquaresEstimator(n_nodes=n_nodes)
        se_result = se_estimator_local.estimate(measurements)
        
        n_states = 2 * n_nodes
        chi2_result = chi_square_detector.detect(se_result, measurements, n_states)
        
        history_for_lstm = list(measurement_history)[-settings.lstm_sequence_length:]
        lstm_result = lstm_detector.detect(measurements, history_for_lstm)
        
        mpnn_result = mpnn_detector.detect(measurements, request.topology)
        
        vae_result = None
        if vae_detector.is_trained:
            vae_result = vae_detector.detect(measurements)
            suspicious_nodes_list = [
                chi2_result.suspicious_nodes,
                lstm_result.suspicious_nodes,
                mpnn_result.suspicious_nodes,
                vae_result.suspicious_nodes
            ]
        else:
            suspicious_nodes_list = [
                chi2_result.suspicious_nodes,
                lstm_result.suspicious_nodes,
                mpnn_result.suspicious_nodes
            ]
        
        is_attack, attack_confidence, detection_method = ensemble_detection(
            chi2_result, lstm_result, mpnn_result, vae_result
        )
        
        suspicious_nodes = merge_suspicious_nodes(*suspicious_nodes_list)
        
        shap_values = None
        if request.return_shap_values and len(measurement_history) >= 10:
            shap_results = shap_explainer.explain_ensemble(
                measurements,
                list(measurement_history),
                request.topology,
                method="all"
            )
            shap_values = shap_results.get('combined_shap')
        
        result = DetectionResult(
            is_attack=is_attack,
            attack_confidence=float(attack_confidence),
            detection_method=detection_method,
            suspicious_nodes=suspicious_nodes,
            chi_square_value=float(chi2_result.chi_square_value),
            chi_square_threshold=float(chi2_result.threshold),
            reconstruction_error=float(lstm_result.reconstruction_error),
            reconstruction_threshold=float(lstm_result.threshold),
            shap_values=shap_values,
            timestamp=datetime.utcnow()
        )
        
        measurement_history.append(measurements)
        
        should_update = incremental_manager.add_new_samples(measurements)
        if should_update:
            background_tasks.add_task(
                incremental_manager.check_and_update,
                topology=request.topology
            )
        
        try:
            db_manager.save_measurements(measurements, batch_id)
            db_manager.save_detection_result(
                batch_id, result,
                spatial_score=getattr(mpnn_result, 'spatial_anomaly_score', None),
                shap_values=shap_values
            )
        except Exception as e:
            logger.warning(f"Failed to save to database: {e}")
        
        logger.info(
            f"Batch {batch_id} processed. "
            f"Attack: {is_attack}, Confidence: {attack_confidence:.4f}, "
            f"Method: {detection_method}"
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Error in batch_detect: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/simulate_attack", response_model=SimulateAttackResponse)
async def simulate_attack(request: SimulateAttackRequest):
    try:
        logger.info(
            f"Simulating {request.attack_type} attack on "
            f"{len(request.target_nodes)} nodes"
        )
        
        se_result = None
        if request.attack_type.lower() == 'stealth':
            se_estimator_local = WeightedLeastSquaresEstimator(n_nodes=len(request.base_measurements))
            se_result = se_estimator_local.estimate(request.base_measurements)
        
        result = attack_simulator.simulate_attack(
            attack_type=request.attack_type,
            base_measurements=request.base_measurements,
            target_nodes=request.target_nodes,
            attack_magnitude=request.attack_magnitude,
            attack_duration=request.attack_duration,
            se_result=se_result
        )
        
        try:
            db_manager.save_attack_simulation(
                attack_type=request.attack_type,
                target_nodes=request.target_nodes,
                attack_magnitude=request.attack_magnitude,
                attack_duration=request.attack_duration,
                attack_pattern=result.attack_pattern
            )
        except Exception as e:
            logger.warning(f"Failed to save attack simulation to database: {e}")
        
        return result
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in simulate_attack: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/visualization/{batch_id}")
async def get_visualization(batch_id: str):
    try:
        logger.info(f"Generating visualization for batch {batch_id}")
        
        db_records = db_manager.get_measurements_by_batch(batch_id)
        if not db_records:
            raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
        
        measurements = []
        for record in db_records:
            measurements.append(MeasurementData(
                timestamp=record.timestamp,
                node_id=record.node_id,
                voltage_magnitude=record.voltage_magnitude,
                voltage_angle=record.voltage_angle,
                active_power=record.active_power,
                reactive_power=record.reactive_power
            ))
        
        n_nodes = len(measurements)
        se_estimator_local = WeightedLeastSquaresEstimator(n_nodes=n_nodes)
        se_result = se_estimator_local.estimate(measurements)
        
        detection_records = db_manager.get_detection_history(limit=1)
        detection_result = None
        if detection_records:
            rec = detection_records[0]
            import json
            suspicious_nodes = json.loads(rec.suspicious_nodes) if rec.suspicious_nodes else []
            attack_nodes = [AttackNode(**n) for n in suspicious_nodes]
            
            from schemas import DetectionResult as SchemaResult
            detection_result = SchemaResult(
                is_attack=rec.is_attack,
                attack_confidence=rec.attack_confidence,
                detection_method=rec.detection_method,
                suspicious_nodes=attack_nodes,
                chi_square_value=rec.chi_square_value,
                chi_square_threshold=rec.chi_square_threshold,
                reconstruction_error=rec.reconstruction_error,
                reconstruction_threshold=rec.reconstruction_threshold,
                timestamp=rec.timestamp
            )
        
        visualization_data = visualization_generator.generate_residual_distribution(
            original_se_result=se_result,
            attacked_se_result=None,
            measurements=measurements
        )
        
        complete_viz = {
            'batch_id': batch_id,
            'residual_distribution': visualization_data.dict(),
            'timestamp': datetime.utcnow()
        }
        
        if detection_result:
            complete_viz['detection'] = visualization_generator.generate_attack_detection_visualization(
                detection_result, se_result, measurements
            )
        
        return complete_viz
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_visualization: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/visualization/compare")
async def compare_visualization(
    original_measurements: List[MeasurementData],
    attacked_measurements: List[MeasurementData],
    topology: Optional[Dict] = None
):
    try:
        n_nodes = len(original_measurements)
        se_estimator_local = WeightedLeastSquaresEstimator(n_nodes=n_nodes)
        
        se_original = se_estimator_local.estimate(original_measurements)
        se_attacked = se_estimator_local.estimate(attacked_measurements)
        
        n_states = 2 * n_nodes
        chi2_result = chi_square_detector.detect(se_attacked, attacked_measurements, n_states)
        
        detection_result = DetectionResult(
            is_attack=chi2_result.is_attack,
            attack_confidence=float(chi2_result.confidence),
            detection_method="chi_square",
            suspicious_nodes=chi2_result.suspicious_nodes,
            chi_square_value=float(chi2_result.chi_square_value),
            chi_square_threshold=float(chi2_result.threshold),
            reconstruction_error=None,
            reconstruction_threshold=None,
            timestamp=datetime.utcnow()
        )
        
        viz_data = visualization_generator.generate_complete_visualization(
            original_se_result=se_original,
            attacked_se_result=se_attacked,
            detection_result=detection_result,
            measurements=attacked_measurements,
            topology=topology
        )
        
        return viz_data
        
    except Exception as e:
        logger.error(f"Error in compare_visualization: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/update_models")
async def update_models(
    background_tasks: BackgroundTasks,
    force_update: bool = False,
    topology: Optional[Dict] = None
):
    try:
        logger.info(f"Model update requested (force={force_update})")
        
        results = incremental_manager.check_and_update(
            topology=topology,
            force_update=force_update
        )
        
        if not results:
            return {
                "status": "no_update_needed",
                "message": "Not enough samples for update or update not required",
                "history_size": len(measurement_history)
            }
        
        return {
            "status": "update_completed",
            "results": {
                k: {
                    "success": v.success,
                    "previous_threshold": v.previous_threshold,
                    "new_threshold": v.new_threshold,
                    "num_samples": v.num_samples_used,
                    "metrics": v.metrics
                }
                for k, v in results.items()
            }
        }
        
    except Exception as e:
        logger.error(f"Error in update_models: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/handle_topology_change")
async def handle_topology_change(new_topology: Dict[str, Any]):
    try:
        if 'edges' not in new_topology:
            raise HTTPException(status_code=400, detail="Topology must contain 'edges' key")
        
        logger.info("Processing topology change")
        results = incremental_manager.handle_topology_change(new_topology)
        
        return {
            "status": "topology_updated",
            "results": {
                k: {
                    "success": v.success,
                    "previous_threshold": v.previous_threshold,
                    "new_threshold": v.new_threshold,
                    "num_samples": v.num_samples_used
                }
                for k, v in results.items()
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in handle_topology_change: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/model_status")
async def get_model_status():
    try:
        status = incremental_manager.get_model_status()
        status['chi_square'] = {
            'confidence_level': settings.chi_square_confidence
        }
        return status
    except Exception as e:
        logger.error(f"Error in get_model_status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/detection_history")
async def get_detection_history(limit: int = 100):
    try:
        records = db_manager.get_detection_history(limit=limit)
        
        history = []
        import json
        for rec in records:
            suspicious_nodes = json.loads(rec.suspicious_nodes) if rec.suspicious_nodes else []
            history.append({
                'id': rec.id,
                'timestamp': rec.timestamp,
                'batch_id': rec.batch_id,
                'is_attack': rec.is_attack,
                'attack_confidence': rec.attack_confidence,
                'detection_method': rec.detection_method,
                'chi_square_value': rec.chi_square_value,
                'chi_square_threshold': rec.chi_square_threshold,
                'reconstruction_error': rec.reconstruction_error,
                'reconstruction_threshold': rec.reconstruction_threshold,
                'spatial_anomaly_score': rec.spatial_anomaly_score,
                'suspicious_nodes': suspicious_nodes
            })
        
        return {
            'count': len(history),
            'history': history
        }
        
    except Exception as e:
        logger.error(f"Error in get_detection_history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/explain/shap")
async def get_shap_explanation(
    measurements: List[MeasurementData],
    method: str = "all",
    topology: Optional[Dict] = None
):
    try:
        if len(measurement_history) < 10:
            raise HTTPException(
                status_code=400,
                detail="Not enough historical data for SHAP explanation. Need at least 10 samples."
            )
        
        shap_results = shap_explainer.explain_ensemble(
            measurements,
            list(measurement_history),
            topology=topology,
            method=method
        )
        
        top_contributors = None
        if shap_results.get('combined_shap'):
            top_contributors = shap_explainer.summarize_top_contributors(
                shap_results['combined_shap'],
                top_k=10
            )
        
        return {
            'shap_values': shap_results,
            'top_contributors': top_contributors
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_shap_explanation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/train_models")
async def train_models(
    training_data: List[List[MeasurementData]],
    topology: Optional[Dict] = None,
    epochs: int = 50
):
    try:
        logger.info(f"Training models with {len(training_data)} samples")
        
        for measurements in training_data:
            measurement_history.append(measurements)
            incremental_manager.add_new_samples(measurements)
        
        results = {}
        
        lstm_metrics = lstm_detector.fit(training_data, epochs=epochs)
        results['lstm'] = lstm_metrics
        
        mpnn_metrics = mpnn_detector.fit(training_data, topology=topology, epochs=epochs)
        results['mpnn'] = mpnn_metrics
        
        vae_metrics = vae_detector.fit(training_data, epochs=epochs)
        results['vae'] = vae_metrics
        
        lstm_path = os.path.join(settings.model_save_path, "lstm_model.pt")
        mpnn_path = os.path.join(settings.model_save_path, "mpnn_model.pt")
        vae_path = os.path.join(settings.model_save_path, "vae_model.pt")
        lstm_detector.save_model(lstm_path)
        mpnn_detector.save_model(mpnn_path)
        vae_detector.save_model(vae_path)
        
        return {
            "status": "training_completed",
            "results": results,
            "model_paths": {
                "lstm": lstm_path,
                "mpnn": mpnn_path,
                "vae": vae_path
            }
        }
        
    except Exception as e:
        logger.error(f"Error in train_models: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/detect/vae", response_model=VAEDetectionResponse)
async def detect_vae(request: VAEDetectionRequest):
    try:
        if not vae_detector.is_trained:
            raise HTTPException(
                status_code=400,
                detail="VAE model not trained yet. Call /train_models first."
            )
        
        result = vae_detector.detect(request.measurements)
        
        suspicious_nodes = []
        for node in result.suspicious_nodes:
            suspicious_nodes.append(AttackNode(
                node_id=node.node_id,
                suspicious_index=node.suspicious_index,
                attack_type=node.attack_type,
                affected_measurements=node.affected_measurements
            ))
        
        return VAEDetectionResponse(
            is_attack=result.is_attack,
            elbo_score=result.elbo_score,
            kl_divergence=result.kl_divergence,
            reconstruction_likelihood=result.reconstruction_likelihood,
            latent_density_score=result.latent_density_score,
            threshold=result.threshold,
            confidence=result.confidence,
            suspicious_nodes=suspicious_nodes,
            node_density_scores=result.node_density_scores
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in VAE detection: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict_consequences", response_model=ConsequencePredictionResponse)
async def predict_consequences(request: ConsequencePredictionRequest):
    try:
        result = consequence_predictor.predict_consequences(
            original_measurements=request.original_measurements,
            attacked_measurements=request.attacked_measurements
        )
        
        voltage_violations = [
            VoltageViolationInfo(
                node_id=v.node_id,
                voltage_pu=v.voltage_pu,
                violation_type=v.violation_type,
                severity=v.severity
            )
            for v in result.voltage_violations
        ]
        
        economic_impact = EconomicImpactInfo(
            generation_cost_change_mw=result.economic_impact.generation_cost_change_mw,
            estimated_cost_change_usd=result.economic_impact.estimated_cost_change_usd,
            redispatch_amount_mw=result.economic_impact.redispatch_amount_mw,
            affected_generators=result.economic_impact.affected_generators,
            load_shedding_mw=result.economic_impact.load_shedding_mw
        )
        
        return ConsequencePredictionResponse(
            economic_impact=economic_impact,
            voltage_violations=voltage_violations,
            max_voltage_deviation_pu=result.max_voltage_deviation_pu,
            voltage_violation_risk=result.voltage_violation_risk,
            total_economic_loss_usd=result.total_economic_loss_usd,
            risk_level=result.risk_level,
            vulnerable_nodes=result.vulnerable_nodes
        )
    except Exception as e:
        logger.error(f"Error in consequence prediction: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow(),
        "measurement_history_size": len(measurement_history)
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
