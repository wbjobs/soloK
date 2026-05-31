use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub decay: DecayConfig,
    pub insect: InsectConfig,
    pub crack: CrackConfig,
    pub mechanics: MechanicsConfig,
    pub output: OutputConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecayConfig {
    pub color_threshold_low: [u16; 3],
    pub color_threshold_high: [u16; 3],
    pub intensity_threshold: f64,
    pub min_decay_area: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsectConfig {
    pub hole_radius_min: f64,
    pub hole_radius_max: f64,
    pub clustering_eps: f64,
    pub min_cluster_size: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrackConfig {
    pub ransac_iterations: usize,
    pub distance_threshold: f64,
    pub min_crack_length: f64,
    pub max_crack_width: f64,
    pub grain_k_neighbors: usize,
    pub grain_dir_threshold: f64,
    pub crack_min_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MechanicsConfig {
    pub safety_factor: f64,
    pub reference_standard: String,
    pub environment_factor: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputConfig {
    pub heatmap_resolution: usize,
    pub export_vtk: bool,
    pub report_template: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            decay: DecayConfig {
                color_threshold_low: [100, 50, 0],
                color_threshold_high: [180, 120, 60],
                intensity_threshold: 50.0,
                min_decay_area: 10.0,
            },
            insect: InsectConfig {
                hole_radius_min: 2.0,
                hole_radius_max: 15.0,
                clustering_eps: 50.0,
                min_cluster_size: 3,
            },
            crack: CrackConfig {
                ransac_iterations: 1000,
                distance_threshold: 5.0,
                min_crack_length: 50.0,
                max_crack_width: 30.0,
                grain_k_neighbors: 10,
                grain_dir_threshold: 0.9,
                crack_min_score: 40.0,
            },
            mechanics: MechanicsConfig {
                safety_factor: 1.5,
                reference_standard: "GB50005-2017".to_string(),
                environment_factor: 1.0,
            },
            output: OutputConfig {
                heatmap_resolution: 20,
                export_vtk: false,
                report_template: "default".to_string(),
            },
        }
    }
}

impl Config {
    pub fn from_file(path: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        let contents = std::fs::read_to_string(path)?;
        let config: Config = serde_yaml::from_str(&contents)?;
        Ok(config)
    }

    pub fn to_file(&self, path: &Path) -> Result<(), Box<dyn std::error::Error>> {
        let yaml = serde_yaml::to_string(self)?;
        std::fs::write(path, yaml)?;
        Ok(())
    }

    pub fn with_species(mut self, species: &WoodSpecies) -> Self {
        match species {
            WoodSpecies::Pine => {
                self.mechanics.safety_factor = 1.6;
            }
            WoodSpecies::Fir => {
                self.mechanics.safety_factor = 1.5;
            }
            WoodSpecies::Nanmu => {
                self.mechanics.safety_factor = 1.4;
            }
        }
        self
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum WoodSpecies {
    Pine,
    Fir,
    Nanmu,
}

impl std::fmt::Display for WoodSpecies {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WoodSpecies::Pine => write!(f, "松木"),
            WoodSpecies::Fir => write!(f, "杉木"),
            WoodSpecies::Nanmu => write!(f, "楠木"),
        }
    }
}

impl std::str::FromStr for WoodSpecies {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "pine" | "松木" => Ok(WoodSpecies::Pine),
            "fir" | "杉木" => Ok(WoodSpecies::Fir),
            "nanmu" | "楠木" => Ok(WoodSpecies::Nanmu),
            _ => Err(format!("Unknown wood species: {}", s)),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Environment {
    pub temperature: f64,
    pub humidity: f64,
}

impl Environment {
    pub fn new(temperature: f64, humidity: f64) -> Self {
        Self {
            temperature,
            humidity,
        }
    }

    pub fn decay_factor(&self) -> f64 {
        let temp_factor = if self.temperature > 25.0 {
            1.0 + (self.temperature - 25.0) * 0.05
        } else {
            1.0
        };
        let hum_factor = if self.humidity > 60.0 {
            1.0 + (self.humidity - 60.0) * 0.02
        } else {
            1.0
        };
        temp_factor * hum_factor
    }
}

pub use crate::mechanics::WoodSpecies;
