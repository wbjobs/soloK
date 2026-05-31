import numpy as np
from scipy.optimize import curve_fit
from config import ODOR_CLASSES

class LangmuirModel:
    @staticmethod
    def langmuir_isotherm(C, R_max, K):
        return R_max * (K * C) / (1 + K * C)

    @staticmethod
    def inverse_langmuir(R, R_max, K):
        if R >= R_max:
            return np.inf
        return R / (K * (R_max - R))


class ConcentrationEstimator:
    def __init__(self, n_sensors=16):
        self.n_sensors = n_sensors
        self.calibration_curves = {}
        self._init_default_calibration()

    def _init_default_calibration(self):
        for odor in ODOR_CLASSES[:10]:
            self.calibration_curves[odor] = []
            for sensor_idx in range(self.n_sensors):
                base_sensitivity = 0.5 + 0.5 * np.sin(sensor_idx * 0.5 + hash(odor) % 10 * 0.3)
                R_max = 1.0 * base_sensitivity
                K = 0.01 * (1 + 0.5 * np.random.rand())
                self.calibration_curves[odor].append({
                    'R_max': R_max,
                    'K': K,
                    'min_concentration': 0.1,
                    'max_concentration': 1000.0
                })

    def calibrate_single_sensor(self, odor_class, sensor_idx, concentrations, responses):
        if odor_class not in self.calibration_curves:
            self.calibration_curves[odor_class] = [{} for _ in range(self.n_sensors)]
        
        try:
            popt, _ = curve_fit(
                LangmuirModel.langmuir_isotherm,
                concentrations, responses,
                p0=[np.max(responses), 0.01],
                bounds=([0, 0], [np.inf, np.inf])
            )
            
            self.calibration_curves[odor_class][sensor_idx] = {
                'R_max': popt[0],
                'K': popt[1],
                'min_concentration': np.min(concentrations),
                'max_concentration': np.max(concentrations)
            }
            return True
        except:
            return False

    def calibrate_all_sensors(self, odor_class, concentrations, response_matrix):
        n_sensors = response_matrix.shape[1]
        results = []
        for i in range(n_sensors):
            success = self.calibrate_single_sensor(
                odor_class, i, concentrations, response_matrix[:, i]
            )
            results.append(success)
        return results

    def estimate_concentration(self, response, odor_class=None, sensor_idx=0):
        if odor_class is None or odor_class not in self.calibration_curves:
            return {'value': None, 'unit': 'ppm', 'range': '未知'}
        
        if sensor_idx >= len(self.calibration_curves[odor_class]):
            return {'value': None, 'unit': 'ppm', 'range': '未知'}
        
        calib = self.calibration_curves[odor_class][sensor_idx]
        R_max = calib['R_max']
        K = calib['K']
        
        if response >= R_max * 0.95:
            return {
                'value': None, 
                'unit': 'ppm', 
                'range': f'> {calib["max_concentration"]:.1f}',
                'warning': '响应接近饱和，浓度超出校准范围'
            }
        
        if response <= R_max * 0.05:
            return {
                'value': None, 
                'unit': 'ppm', 
                'range': f'< {calib["min_concentration"]:.1f}',
                'warning': '响应过低，浓度低于检测限'
            }
        
        concentration = LangmuirModel.inverse_langmuir(response, R_max, K)
        
        return {
            'value': round(concentration, 2),
            'unit': 'ppm',
            'range': f'{calib["min_concentration"]:.1f} - {calib["max_concentration"]:.1f}',
            'confidence': 'medium' if calib['min_concentration'] <= concentration <= calib['max_concentration'] else 'low'
        }

    def estimate_concentration_multisensor(self, responses, odor_class=None):
        if odor_class is None or odor_class not in self.calibration_curves:
            return {'value': None, 'unit': 'ppm', 'estimations': []}
        
        estimations = []
        valid_concentrations = []
        
        for i, response in enumerate(responses):
            if i < len(self.calibration_curves[odor_class]):
                result = self.estimate_concentration(response, odor_class, i)
                estimations.append(result)
                if result['value'] is not None:
                    valid_concentrations.append(result['value'])
        
        if not valid_concentrations:
            return {
                'value': None,
                'unit': 'ppm',
                'estimations': estimations,
                'warning': '无法获得有效浓度估算'
            }
        
        mean_conc = np.mean(valid_concentrations)
        std_conc = np.std(valid_concentrations)
        
        return {
            'value': round(mean_conc, 2),
            'unit': 'ppm',
            'std': round(std_conc, 2),
            'range': f'{max(0.1, mean_conc - 2*std_conc):.1f} - {mean_conc + 2*std_conc:.1f}',
            'estimations': estimations,
            'n_valid': len(valid_concentrations)
        }

    def estimate_from_top3(self, top3_results, sensor_responses):
        all_estimations = []
        
        for result in top3_results:
            odor_class = result['class']
            similarity = result['similarity']
            
            if similarity < 30:
                continue
            
            est_result = self.estimate_concentration_multisensor(sensor_responses, odor_class)
            
            if est_result['value'] is not None:
                all_estimations.append({
                    'odor': odor_class,
                    'similarity': similarity,
                    'concentration': est_result['value'],
                    'unit': est_result['unit'],
                    'range': est_result.get('range', 'N/A'),
                    'weighted_value': est_result['value'] * (similarity / 100.0)
                })
        
        if not all_estimations:
            return None
        
        total_weight = sum(est['similarity'] for est in all_estimations)
        weighted_conc = sum(est['weighted_value'] for est in all_estimations) / (total_weight / 100.0)
        
        return {
            'best_estimate': all_estimations[0],
            'all_estimates': all_estimations,
            'weighted_concentration': round(weighted_conc, 2),
            'unit': 'ppm'
        }
