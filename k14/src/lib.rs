pub mod pointcloud;
pub mod damage;
pub mod mechanics;
pub mod report;
pub mod config;
pub mod cli;
pub mod batch;
pub mod comparison;
pub mod decay_prediction;
pub mod defect_reconstruction;

pub use pointcloud::{PointCloud, Point, load_point_cloud};
pub use damage::{DamageAnalysis, DecayResult, InsectResult, CrackResult};
pub use mechanics::{MechanicsAnalysis, SafetyLevel, WoodSpecies};
pub use report::ReportGenerator;
pub use config::Config;
pub use decay_prediction::{DecayPrediction, FickDiffusionSolver, FickSolverConfig, format_prediction_report};
pub use defect_reconstruction::{DefectMesh, DefectType, DefectReconstructor, export_stl, export_all_defects};
