use crate::config::{Config, Environment, WoodSpecies};
use crate::damage::DamageAnalysis;
use crate::mechanics::MechanicsAnalysis;
use crate::pointcloud::PointCloud;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisSnapshot {
    pub timestamp: String,
    pub filename: String,
    pub overall_damage_score: f64,
    pub decay_volume_percent: f64,
    pub insect_hole_count: usize,
    pub crack_total_length: f64,
    pub safety_level: String,
    pub capacity_ratio: f64,
}

impl AnalysisSnapshot {
    pub fn from_analysis(
        filename: &str,
        damage: &DamageAnalysis,
        mechanics: &MechanicsAnalysis,
    ) -> Self {
        Self {
            timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            filename: filename.to_string(),
            overall_damage_score: damage.overall_damage_score,
            decay_volume_percent: damage.decay.decay_volume_percent,
            insect_hole_count: damage.insect.hole_count,
            crack_total_length: damage.crack.total_crack_length,
            safety_level: mechanics.safety_level.to_string(),
            capacity_ratio: mechanics.capacity_ratio,
        }
    }

    pub fn save(&self, path: &Path) -> Result<(), Box<dyn std::error::Error>> {
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(path, json)?;
        Ok(())
    }

    pub fn load(path: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        let json = std::fs::read_to_string(path)?;
        let snapshot: Self = serde_json::from_str(&json)?;
        Ok(snapshot)
    }
}

pub struct ComparisonResult {
    pub old: AnalysisSnapshot,
    pub new: AnalysisSnapshot,
    pub score_change: f64,
    pub decay_change: f64,
    pub insect_change: isize,
    pub crack_change: f64,
    pub capacity_change: f64,
    pub safety_level_downgraded: bool,
    pub severity: ComparisonSeverity,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ComparisonSeverity {
    Improved,
    Stable,
    MinorDegradation,
    MajorDegradation,
    Critical,
}

impl std::fmt::Display for ComparisonSeverity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ComparisonSeverity::Improved => write!(f, "改善"),
            ComparisonSeverity::Stable => write!(f, "稳定"),
            ComparisonSeverity::MinorDegradation => write!(f, "轻微劣化"),
            ComparisonSeverity::MajorDegradation => write!(f, "显著劣化"),
            ComparisonSeverity::Critical => write!(f, "严重恶化"),
        }
    }
}

pub fn compare_snapshots(old: &AnalysisSnapshot, new: &AnalysisSnapshot) -> ComparisonResult {
    let score_change = new.overall_damage_score - old.overall_damage_score;
    let decay_change = new.decay_volume_percent - old.decay_volume_percent;
    let insect_change = new.insect_hole_count as isize - old.insect_hole_count as isize;
    let crack_change = new.crack_total_length - old.crack_total_length;
    let capacity_change = new.capacity_ratio - old.capacity_ratio;

    let safety_level_downgraded = is_level_downgraded(&old.safety_level, &new.safety_level);

    let severity = if capacity_change > 0.05 {
        ComparisonSeverity::Improved
    } else if score_change < 2.0 && capacity_change > -0.05 {
        ComparisonSeverity::Stable
    } else if score_change < 10.0 && capacity_change > -0.1 && !safety_level_downgraded {
        ComparisonSeverity::MinorDegradation
    } else if score_change < 20.0 && capacity_change > -0.2 {
        ComparisonSeverity::MajorDegradation
    } else {
        ComparisonSeverity::Critical
    };

    ComparisonResult {
        old: old.clone(),
        new: new.clone(),
        score_change,
        decay_change,
        insect_change,
        crack_change,
        capacity_change,
        safety_level_downgraded,
        severity,
    }
}

fn is_level_downgraded(old_level: &str, new_level: &str) -> bool {
    let rank = |level: &str| -> i32 {
        if level.contains("I级") {
            1
        } else if level.contains("II级") {
            2
        } else if level.contains("III级") {
            3
        } else if level.contains("IV级") {
            4
        } else {
            0
        }
    };

    rank(new_level) > rank(old_level)
}

pub fn generate_comparison_report(result: &ComparisonResult) -> String {
    let mut report = String::new();

    report.push_str("# 历史数据对比分析报告\n\n");
    report.push_str(&format!(
        "**对比时间**: {} → {}\n\n",
        result.old.timestamp, result.new.timestamp
    ));
    report.push_str(&format!("**文件**: {}\n\n", result.old.filename));
    report.push_str(&format!(
        "**整体评估**: {}\n\n",
        result.severity
    ));

    report.push_str("## 1. 关键指标对比\n\n");
    report.push_str("| 指标 | 原值 | 现值 | 变化 |\n");
    report.push_str("|------|------|------|------|\n");
    report.push_str(&format!(
        "| 综合残损指数 | {:.1} | {:.1} | {:+.1} |\n",
        result.old.overall_damage_score, result.new.overall_damage_score, result.score_change
    ));
    report.push_str(&format!(
        "| 腐朽体积占比 | {:.2}% | {:.2}% | {:+.2}% |\n",
        result.old.decay_volume_percent, result.new.decay_volume_percent, result.decay_change
    ));
    report.push_str(&format!(
        "| 虫孔数量 | {} | {} | {:+} |\n",
        result.old.insect_hole_count, result.new.insect_hole_count, result.insect_change
    ));
    report.push_str(&format!(
        "| 裂缝总长度 | {:.1} mm | {:.1} mm | {:+.1} mm |\n",
        result.old.crack_total_length, result.new.crack_total_length, result.crack_change
    ));
    report.push_str(&format!(
        "| 承载力保留率 | {:.1}% | {:.1}% | {:+.1}% |\n",
        result.old.capacity_ratio * 100.0,
        result.new.capacity_ratio * 100.0,
        result.capacity_change * 100.0
    ));
    report.push_str(&format!(
        "| 安全等级 | {} | {} | {} |\n",
        result.old.safety_level,
        result.new.safety_level,
        if result.safety_level_downgraded { "↓ 下降" } else { "-" }
    ));
    report.push('\n');

    report.push_str("## 2. 变化趋势分析\n\n");

    if result.severity == ComparisonSeverity::Improved {
        report.push_str("构件状况有所改善，修复措施有效。建议继续定期监测。\n\n");
    } else if result.severity == ComparisonSeverity::Stable {
        report.push_str("构件状况稳定，残损无明显发展。可按正常周期监测。\n\n");
    } else if result.severity == ComparisonSeverity::MinorDegradation {
        report.push_str("构件有轻微劣化趋势，建议缩短监测周期，密切关注关键损伤部位的发展情况。\n\n");
    } else if result.severity == ComparisonSeverity::MajorDegradation {
        report.push_str("⚠️ **警告**: 构件残损显著发展，承载力明显下降。建议尽快组织现场勘察，制定加固方案。\n\n");
    } else {
        report.push_str("🚨 **紧急**: 构件状况严重恶化，可能存在安全隐患。建议立即采取防护措施，组织专家评估。\n\n");
    }

    report.push_str("## 3. 关注重点\n\n");

    if result.decay_change > 1.0 {
        report.push_str(&format!(
            "- 腐朽发展较快（增加 {:.2}%），检查防腐措施是否有效\n",
            result.decay_change
        ));
    }
    if result.insect_change > 5 {
        report.push_str(&format!(
            "- 虫蛀活动活跃（新增 {} 个孔洞），建议进行虫害防治处理\n",
            result.insect_change
        ));
    }
    if result.crack_change > 50.0 {
        report.push_str(&format!(
            "- 裂缝扩展明显（增加 {:.1} mm），重点关注结构受力部位\n",
            result.crack_change
        ));
    }
    if result.safety_level_downgraded {
        report.push_str("- 安全等级下降，需评估对整体结构安全的影响\n");
    }

    if result.decay_change <= 1.0 && result.insect_change <= 5 && result.crack_change <= 50.0 && !result.safety_level_downgraded {
        report.push_str("- 无明显异常变化项\n");
    }

    report
}

pub fn run_comparison_analysis(
    old_snapshot_path: &Path,
    new_file: &Path,
    config: &Config,
    species: WoodSpecies,
    env: &Environment,
) -> Result<String, Box<dyn std::error::Error>> {
    let old = AnalysisSnapshot::load(old_snapshot_path)?;
    let pc = crate::pointcloud::load_point_cloud(new_file)?;
    let damage = DamageAnalysis::analyze(&pc, config, &species, env);
    let mechanics = MechanicsAnalysis::analyze(&pc, &damage, config, species, env);
    let new = AnalysisSnapshot::from_analysis(
        new_file.file_name().and_then(|n| n.to_str()).unwrap_or("unknown"),
        &damage,
        &mechanics,
    );

    let result = compare_snapshots(&old, &new);
    Ok(generate_comparison_report(&result))
}
