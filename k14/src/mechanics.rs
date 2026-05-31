use crate::config::{Config, Environment};
use crate::damage::DamageAnalysis;
use crate::pointcloud::PointCloud;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum SafetyLevel {
    I,
    II,
    III,
    IV,
}

impl std::fmt::Display for SafetyLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SafetyLevel::I => write!(f, "I级（完好）"),
            SafetyLevel::II => write!(f, "II级（轻微）"),
            SafetyLevel::III => write!(f, "III级（严重）"),
            SafetyLevel::IV => write!(f, "IV级（危险）"),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum WoodSpecies {
    Pine,
    Fir,
    Nanmu,
}

impl WoodSpecies {
    pub fn bending_strength(&self) -> f64 {
        match self {
            WoodSpecies::Pine => 17.0,
            WoodSpecies::Fir => 15.0,
            WoodSpecies::Nanmu => 20.0,
        }
    }

    pub fn compression_strength(&self) -> f64 {
        match self {
            WoodSpecies::Pine => 12.0,
            WoodSpecies::Fir => 10.0,
            WoodSpecies::Nanmu => 15.0,
        }
    }

    pub fn elastic_modulus(&self) -> f64 {
        match self {
            WoodSpecies::Pine => 10000.0,
            WoodSpecies::Fir => 9000.0,
            WoodSpecies::Nanmu => 12000.0,
        }
    }

    pub fn shear_strength(&self) -> f64 {
        match self {
            WoodSpecies::Pine => 1.6,
            WoodSpecies::Fir => 1.4,
            WoodSpecies::Nanmu => 2.0,
        }
    }
}

#[derive(Debug, Clone)]
pub struct MechanicsAnalysis {
    pub species: WoodSpecies,
    pub original_section: SectionProperties,
    pub residual_section: SectionProperties,
    pub bending_capacity: f64,
    pub compression_capacity: f64,
    pub shear_capacity: f64,
    pub capacity_ratio: f64,
    pub safety_level: SafetyLevel,
    pub safety_factor: f64,
    pub damage_effect_factor: f64,
}

#[derive(Debug, Clone, Copy)]
pub struct SectionProperties {
    pub area: f64,
    pub moment_of_inertia: f64,
    pub section_modulus: f64,
    pub width: f64,
    pub height: f64,
}

impl SectionProperties {
    pub fn rectangular(width: f64, height: f64) -> Self {
        let area = width * height;
        let moment_of_inertia = width * height.powi(3) / 12.0;
        let section_modulus = moment_of_inertia / (height / 2.0);
        Self {
            area,
            moment_of_inertia,
            section_modulus,
            width,
            height,
        }
    }

    pub fn from_point_cloud(pc: &PointCloud) -> Self {
        let (w, h, d) = pc.bounds.dimensions();
        let (width, height) = if w > h && w > d {
            (h.min(d), h.max(d))
        } else if h > d {
            (w.min(d), w.max(d))
        } else {
            (w.min(h), w.max(h))
        };
        Self::rectangular(width, height)
    }
}

impl MechanicsAnalysis {
    pub fn analyze(
        point_cloud: &PointCloud,
        damage: &DamageAnalysis,
        config: &Config,
        species: WoodSpecies,
        _env: &Environment,
    ) -> Self {
        let original_section = SectionProperties::from_point_cloud(point_cloud);

        let damage_factor = Self::calculate_damage_factor(damage);
        let damage_effect_factor = 1.0 - damage_factor * 0.8;

        let residual_area = original_section.area * damage_effect_factor;
        let residual_height = original_section.height * (damage_effect_factor).sqrt();
        let residual_width = original_section.width;
        let residual_section = SectionProperties::rectangular(residual_width, residual_height);

        let f_m = species.bending_strength();
        let f_c = species.compression_strength();
        let f_v = species.shear_strength();
        let gamma = config.mechanics.safety_factor;
        let k = config.mechanics.environment_factor;

        let bending_capacity = f_m * residual_section.section_modulus / gamma * k;
        let compression_capacity = f_c * residual_section.area / gamma * k;
        let shear_capacity = f_v * residual_section.area / gamma * k * 0.7;

        let original_bending = f_m * original_section.section_modulus;
        let capacity_ratio = bending_capacity / original_bending;

        let safety_level = if capacity_ratio >= 0.9 {
            SafetyLevel::I
        } else if capacity_ratio >= 0.7 {
            SafetyLevel::II
        } else if capacity_ratio >= 0.4 {
            SafetyLevel::III
        } else {
            SafetyLevel::IV
        };

        Self {
            species,
            original_section,
            residual_section,
            bending_capacity,
            compression_capacity,
            shear_capacity,
            capacity_ratio,
            safety_level,
            safety_factor: gamma,
            damage_effect_factor,
        }
    }

    fn calculate_damage_factor(damage: &DamageAnalysis) -> f64 {
        let decay_factor = (damage.decay.decay_volume_percent / 100.0).min(1.0);
        let insect_factor = (damage.insect.hole_density / 500.0).min(1.0);
        let crack_factor = (damage.crack.total_crack_length / 5000.0).min(1.0);

        let weighted = decay_factor * 0.5 + insect_factor * 0.25 + crack_factor * 0.25;
        weighted.min(1.0)
    }

    pub fn recommend_repairs(&self, damage: &DamageAnalysis) -> Vec<RepairSuggestion> {
        let mut suggestions = Vec::new();

        if damage.decay.decay_volume_percent > 10.0 {
            suggestions.push(RepairSuggestion {
                damage_type: "腐朽".to_string(),
                severity: Self::severity_from_percent(damage.decay.decay_volume_percent),
                recommended_method: "环氧灌注".to_string(),
                description: "腐朽区域超过10%，建议采用环氧树脂压力灌注，灌注压力0.2-0.4MPa。".to_string(),
                priority: 1,
            });
        } else if damage.decay.decay_volume_percent > 5.0 {
            suggestions.push(RepairSuggestion {
                damage_type: "腐朽".to_string(),
                severity: "中等".to_string(),
                recommended_method: "木粉填充 + 表面封闭".to_string(),
                description: "清理腐朽部位，用木材防腐剂处理后，以木粉和环氧树脂混合物填充，表面做封闭处理。".to_string(),
                priority: 2,
            });
        }

        if damage.insect.hole_count > 20 || damage.insect.clusters.len() > 3 {
            suggestions.push(RepairSuggestion {
                damage_type: "虫蛀".to_string(),
                severity: "严重".to_string(),
                recommended_method: "化学防治 + 木粉填充".to_string(),
                description: "先进行熏蒸或注射杀虫剂，彻底杀灭蛀虫。孔洞用木粉和树脂混合物填充压实。".to_string(),
                priority: 1,
            });
        } else if damage.insect.hole_count > 5 {
            suggestions.push(RepairSuggestion {
                damage_type: "虫蛀".to_string(),
                severity: "轻微".to_string(),
                recommended_method: "表面喷洒杀虫剂 + 封堵".to_string(),
                description: "表面喷洒杀虫剂，用木材腻子封堵虫孔，防止继续侵害。".to_string(),
                priority: 3,
            });
        }

        if damage.crack.max_crack_width > 10.0 {
            suggestions.push(RepairSuggestion {
                damage_type: "开裂".to_string(),
                severity: "严重".to_string(),
                recommended_method: "铁件加固 + 粘结".to_string(),
                description: "裂缝宽度超过10mm，建议采用扁钢或钢板加固，配合结构胶粘剂，必要时加螺栓锚固。".to_string(),
                priority: 1,
            });
        } else if damage.crack.total_crack_length > 200.0 {
            suggestions.push(RepairSuggestion {
                damage_type: "开裂".to_string(),
                severity: "中等".to_string(),
                recommended_method: "粘结加固".to_string(),
                description: "清理裂缝后，注入环氧树脂胶进行粘结，表面贴碳纤维布增强。".to_string(),
                priority: 2,
            });
        }

        if self.safety_level == SafetyLevel::IV {
            suggestions.push(RepairSuggestion {
                damage_type: "整体结构".to_string(),
                severity: "危险".to_string(),
                recommended_method: "构件替换".to_string(),
                description: "残余承载力不足40%，建议整体替换该构件，确保结构安全。替换前应设置临时支撑。".to_string(),
                priority: 0,
            });
        } else if self.safety_level == SafetyLevel::III {
            suggestions.push(RepairSuggestion {
                damage_type: "整体结构".to_string(),
                severity: "严重".to_string(),
                recommended_method: "综合加固".to_string(),
                description: "残余承载力在40%-70%之间，建议采用综合加固方案，包括碳纤维包裹、外包型钢等方法。".to_string(),
                priority: 1,
            });
        }

        suggestions.sort_by_key(|s| s.priority);
        suggestions
    }

    fn severity_from_percent(percent: f64) -> String {
        if percent > 20.0 {
            "严重".to_string()
        } else if percent > 10.0 {
            "中等".to_string()
        } else {
            "轻微".to_string()
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct RepairSuggestion {
    pub damage_type: String,
    pub severity: String,
    pub recommended_method: String,
    pub description: String,
    pub priority: usize,
}
