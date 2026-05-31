use crate::config::{Environment, WoodSpecies};
use crate::damage::DecayResult;
use ndarray::{Array1, Array2};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecayPrediction {
    pub years: Vec<f64>,
    pub depths: Vec<f64>,
    pub remaining_safe_years: f64,
    pub critical_depth: f64,
    pub diffusion_coefficient: f64,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FickSolverConfig {
    pub diffusion_coefficient_base: f64,
    pub surface_concentration: f64,
    pub critical_threshold_ratio: f64,
    pub max_prediction_years: usize,
    pub spatial_steps: usize,
    pub time_steps_per_year: usize,
}

impl Default for FickSolverConfig {
    fn default() -> Self {
        Self {
            diffusion_coefficient_base: 0.5,
            surface_concentration: 1.0,
            critical_threshold_ratio: 0.3,
            max_prediction_years: 20,
            spatial_steps: 100,
            time_steps_per_year: 365,
        }
    }
}

pub struct FickDiffusionSolver {
    config: FickSolverConfig,
    species: WoodSpecies,
    env: Environment,
}

impl FickDiffusionSolver {
    pub fn new(config: FickSolverConfig, species: WoodSpecies, env: Environment) -> Self {
        Self {
            config,
            species,
            env,
        }
    }

    pub fn predict_decay(
        &self,
        current_decay: &DecayResult,
        member_thickness: f64,
    ) -> DecayPrediction {
        let D = self.calculate_diffusion_coefficient();

        let dx = member_thickness / self.config.spatial_steps as f64;
        let dt = 1.0 / self.config.time_steps_per_year as f64;

        let r = D * dt / (dx * dx);
        assert!(r < 0.5, "Numerical instability: r = {:.4} >= 0.5", r);

        let initial_profile = self.build_initial_profile(current_decay, member_thickness);

        let mut concentration = initial_profile.clone();
        let mut depths = vec![current_decay.avg_decay_depth];
        let mut years = vec![0.0];

        for year in 1..=self.config.max_prediction_years {
            for _ in 0..self.config.time_steps_per_year {
                concentration = self.fd_step(&concentration, r, self.config.surface_concentration);
            }

            let decay_depth = self.calculate_decay_depth(&concentration, dx);
            depths.push(decay_depth);
            years.push(year as f64);
        }

        let critical_depth = member_thickness * self.config.critical_threshold_ratio;
        let remaining_safe_years = self.find_remaining_safe_years(&years, &depths, critical_depth);

        let confidence = self.calculate_confidence(current_decay);

        DecayPrediction {
            years,
            depths,
            remaining_safe_years,
            critical_depth,
            diffusion_coefficient: D,
            confidence,
        }
    }

    fn calculate_diffusion_coefficient(&self) -> f64 {
        let base = match self.species {
            WoodSpecies::Pine => 0.6,
            WoodSpecies::Fir => 0.5,
            WoodSpecies::Nanmu => 0.3,
        };

        let temp_factor = if self.env.temperature > 20.0 {
            1.0 + (self.env.temperature - 20.0) * 0.08
        } else {
            1.0 - (20.0 - self.env.temperature) * 0.02
        };

        let hum_factor = if self.env.humidity > 60.0 {
            1.0 + (self.env.humidity - 60.0) * 0.04
        } else {
            1.0 - (60.0 - self.env.humidity) * 0.02
        };

        base * temp_factor * hum_factor * self.config.diffusion_coefficient_base
    }

    fn build_initial_profile(&self, decay: &DecayResult, thickness: f64) -> Array1<f64> {
        let n = self.config.spatial_steps;
        let mut profile = Array1::zeros(n);

        let decay_ratio = if thickness > 0.0 {
            (decay.avg_decay_depth / thickness).min(0.5)
        } else {
            0.1
        };
        let decay_steps = (n as f64 * decay_ratio) as usize;

        for i in 0..n {
            let x = i as f64 / n as f64;
            if i < decay_steps {
                profile[i] = 0.8 + 0.2 * (1.0 - x / decay_ratio);
            } else {
                let dist = (i - decay_steps) as f64 / (n - decay_steps) as f64;
                profile[i] = 0.3 * (-dist * 3.0).exp();
            }
        }

        profile
    }

    fn fd_step(&self, c: &Array1<f64>, r: f64, surface_c: f64) -> Array1<f64> {
        let n = c.len();
        let mut c_new = Array1::zeros(n);

        c_new[0] = surface_c;
        c_new[n - 1] = c[n - 1];

        for i in 1..n - 1 {
            c_new[i] = c[i] + r * (c[i + 1] - 2.0 * c[i] + c[i - 1]);
        }

        c_new
    }

    fn calculate_decay_depth(&self, concentration: &Array1<f64>, dx: f64) -> f64 {
        let threshold = 0.5;
        for i in 0..concentration.len() {
            if concentration[i] < threshold {
                return i as f64 * dx;
            }
        }
        (concentration.len() - 1) as f64 * dx
    }

    fn find_remaining_safe_years(
        &self,
        years: &[f64],
        depths: &[f64],
        critical_depth: f64,
    ) -> f64 {
        for i in 1..depths.len() {
            if depths[i] >= critical_depth {
                let prev_depth = depths[i - 1];
                let prev_year = years[i - 1];
                let curr_depth = depths[i];
                let curr_year = years[i];

                if curr_depth > prev_depth {
                    let ratio = (critical_depth - prev_depth) / (curr_depth - prev_depth);
                    return prev_year + ratio * (curr_year - prev_year);
                }
            }
        }
        self.config.max_prediction_years as f64
    }

    fn calculate_confidence(&self, decay: &DecayResult) -> f64 {
        let points_ratio = if decay.decayed_points.len() > 100 {
            1.0
        } else {
            decay.decayed_points.len() as f64 / 100.0
        };

        let regions_bonus = if decay.decay_regions.len() >= 2 {
            0.1
        } else {
            0.0
        };

        (points_ratio * 0.8 + regions_bonus).min(1.0)
    }
}

pub fn format_prediction_report(pred: &DecayPrediction) -> String {
    let mut report = String::new();

    report.push_str(&format!(
        "## 腐朽发展预测 (Fick扩散模型)\n\n"
    ));
    report.push_str(&format!(
        "**扩散系数**: {:.4} mm²/year\n\n",
        pred.diffusion_coefficient
    ));
    report.push_str(&format!(
        "**临界腐朽深度**: {:.1} mm\n\n",
        pred.critical_depth
    ));
    report.push_str(&format!(
        "**剩余安全年限**: {:.1} 年\n\n",
        pred.remaining_safe_years
    ));
    report.push_str(&format!(
        "**预测置信度**: {:.0}%\n\n",
        pred.confidence * 100.0
    ));

    report.push_str("### 5年预测\n\n");
    report.push_str("| 年份 | 预测腐朽深度 (mm) |\n");
    report.push_str("|------|-------------------|\n");

    for i in 0..=pred.years.len().min(6) {
        if i < pred.years.len() {
            report.push_str(&format!(
                "| {:.0} | {:.1} |\n",
                pred.years[i], pred.depths[i]
            ));
        }
    }

    report.push_str("\n### 发展趋势\n\n");
    report.push_str("```\n");
    report.push_str("时间 →\n");
    let max_depth = pred.depths.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    for level in (0..10).rev() {
        let threshold = max_depth * level as f64 / 10.0;
        let mut line = String::new();
        for &depth in &pred.depths {
            if depth >= threshold {
                line.push('█');
            } else if depth >= threshold * 0.8 {
                line.push('▓');
            } else if depth >= threshold * 0.5 {
                line.push('▒');
            } else {
                line.push('░');
            }
        }
        report.push_str(&format!("{} {:.0}mm\n", line, threshold));
    }
    report.push_str("```\n");

    report
}
