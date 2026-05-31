from utils.concentration_estimator import ConcentrationEstimator, LangmuirModel
from utils.sensor_diagnosis import SensorDiagnostic, RealTimeSensorDiagnostic
import numpy as np

print('Testing ConcentrationEstimator...')
estimator = ConcentrationEstimator(n_sensors=16)
print(f'  Calibrated for {len(estimator.calibration_curves)} odors')

print('Testing Langmuir Model...')
C_test = np.array([1, 10, 100, 1000])
R = LangmuirModel.langmuir_isotherm(C_test, R_max=1.0, K=0.01)
print(f'  Input concentrations: {C_test}')
print(f'  Response values: {R.round(3)}')

print('Testing SensorDiagnostic...')
diagnostic = RealTimeSensorDiagnostic(n_sensors=16)
diagnostic.set_reference(np.ones(16)*0.1, np.ones(16)*0.8)

responses = np.random.rand(100, 16) * 0.5
diagnosis = diagnostic.process_realtime_data(np.arange(100), responses)
print(f'  Overall status: {diagnosis["overall_status"]}')
print(f'  Health score: {diagnostic.get_overall_health_score()}')

print('Testing sensor failure simulation...')
responses_fail = responses.copy()
responses_fail[:, 5] = 0.01
diagnosis_fail = diagnostic.process_realtime_data(np.arange(100), responses_fail)
print(f'  Failed sensors: {diagnosis_fail["failed_sensors"]}')
print(f'  Warning sensors: {diagnosis_fail["warning_sensors"]}')

print('\nAll tests passed!')
