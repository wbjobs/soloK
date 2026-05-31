use crate::config::{Config, Environment};
use crate::damage::DamageAnalysis;
use crate::decay_prediction::{format_prediction_report, DecayPrediction};
use crate::mechanics::{MechanicsAnalysis, RepairSuggestion};
use crate::pointcloud::PointCloud;
use chrono::Local;
use ndarray::Array2;
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};

pub struct ReportGenerator;

impl ReportGenerator {
    pub fn generate_markdown(
        filename: &str,
        point_cloud: &PointCloud,
        damage: &DamageAnalysis,
        mechanics: &MechanicsAnalysis,
        config: &Config,
        env: &Environment,
        repairs: &[RepairSuggestion],
        decay_prediction: Option<&DecayPrediction>,
        stl_files: &[PathBuf],
    ) -> Result<String, Box<dyn std::error::Error>> {
        let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let heatmap = damage.get_damage_heatmap(config.output.heatmap_resolution);
        let ascii_heatmap = Self::generate_ascii_heatmap(&heatmap);

        let mut report = String::new();

        report.push_str(&format!("# 古建筑木结构残损评估报告\n\n"));
        report.push_str(&format!("**生成时间**: {}\n\n", timestamp));
        report.push_str(&format!("**文件**: {}\n\n", filename));
        report.push_str(&format!("**参考规范**: {}\n\n", config.mechanics.reference_standard));

        report.push_str("## 1. 基本信息\n\n");
        report.push_str("| 项目 | 数值 |\n");
        report.push_str("|------|------|\n");
        report.push_str(&format!("| 木材树种 | {} |\n", mechanics.species));
        report.push_str(&format!("| 环境温度 | {:.1}°C |\n", env.temperature));
        report.push_str(&format!("| 环境湿度 | {:.1}% |\n", env.humidity));
        report.push_str(&format!("| 点云数量 | {} 个 |\n", point_cloud.len()));
        let (w, h, d) = point_cloud.bounds.dimensions();
        report.push_str(&format!("| 构件尺寸 | {:.1} × {:.1} × {:.1} mm |\n", w, h, d));
        report.push_str(&format!("| 点云体积 | {:.2} cm³ |\n", point_cloud.bounds.volume() / 1000.0));
        report.push('\n');

        report.push_str("## 2. 残损检测结果\n\n");

        report.push_str("### 2.1 总体评估\n\n");
        report.push_str(&format!(
            "**综合残损指数**: {:.1}/100\n\n",
            damage.overall_damage_score
        ));
        report.push_str(&format!(
            "{}",
            Self::generate_progress_bar(damage.overall_damage_score, 50)
        ));
        report.push_str("\n\n");

        report.push_str("### 2.2 腐朽检测\n\n");
        report.push_str("| 指标 | 数值 |\n");
        report.push_str("|------|------|\n");
        report.push_str(&format!(
            "| 腐朽体积占比 | {:.2}% |\n",
            damage.decay.decay_volume_percent
        ));
        report.push_str(&format!(
            "| 最大腐朽深度 | {:.1} mm |\n",
            damage.decay.max_decay_depth
        ));
        report.push_str(&format!(
            "| 平均腐朽深度 | {:.1} mm |\n",
            damage.decay.avg_decay_depth
        ));
        report.push_str(&format!(
            "| 腐朽区域数量 | {} 个 |\n",
            damage.decay.decay_regions.len()
        ));
        report.push('\n');

        if !damage.decay.decay_regions.is_empty() {
            report.push_str("#### 腐朽区域详情\n\n");
            for (i, region) in damage.decay.decay_regions.iter().enumerate() {
                report.push_str(&format!(
                    "- 区域{}: 中心({:.1}, {:.1}, {:.1}), 体积 {:.1} mm³, 严重度 {:.0}%\n",
                    i + 1,
                    region.center[0],
                    region.center[1],
                    region.center[2],
                    region.volume,
                    region.severity * 100.0
                ));
            }
            report.push('\n');
        }

        report.push_str("### 2.3 虫蛀检测\n\n");
        report.push_str("| 指标 | 数值 |\n");
        report.push_str("|------|------|\n");
        report.push_str(&format!("| 虫孔数量 | {} 个 |\n", damage.insect.hole_count));
        report.push_str(&format!(
            "| 虫孔密度 | {:.2} 个/m³ |\n",
            damage.insect.hole_density
        ));
        report.push_str(&format!(
            "| 虫孔聚类数量 | {} 个 |\n",
            damage.insect.clusters.len()
        ));
        report.push_str(&format!(
            "| 平均虫孔半径 | {:.1} mm |\n",
            damage.insect.avg_hole_radius
        ));
        report.push('\n');

        if !damage.insect.clusters.is_empty() {
            report.push_str("#### 虫蛀聚类详情\n\n");
            for (i, cluster) in damage.insect.clusters.iter().enumerate() {
                report.push_str(&format!(
                    "- 聚类{}: 中心({:.1}, {:.1}, {:.1}), 包含 {} 个虫孔, 影响半径 {:.1} mm\n",
                    i + 1,
                    cluster.center[0],
                    cluster.center[1],
                    cluster.center[2],
                    cluster.hole_count,
                    cluster.radius
                ));
            }
            report.push('\n');
        }

        report.push_str("### 2.4 开裂检测\n\n");
        report.push_str("| 指标 | 数值 |\n");
        report.push_str("|------|------|\n");
        report.push_str(&format!("| 裂缝数量 | {} 条 |\n", damage.crack.crack_count));
        report.push_str(&format!(
            "| 裂缝总长度 | {:.1} mm |\n",
            damage.crack.total_crack_length
        ));
        report.push_str(&format!(
            "| 最大裂缝宽度 | {:.1} mm |\n",
            damage.crack.max_crack_width
        ));
        report.push_str(&format!(
            "| 平均裂缝宽度 | {:.1} mm |\n",
            damage.crack.avg_crack_width
        ));
        report.push('\n');

        if !damage.crack.cracks.is_empty() {
            report.push_str("#### 主要裂缝详情\n\n");
            for (i, crack) in damage.crack.cracks.iter().take(5).enumerate() {
                report.push_str(&format!(
                    "- 裂缝{}: 起点({:.1}, {:.1}, {:.1}) → 终点({:.1}, {:.1}, {:.1}), 长度 {:.1} mm, 宽度 {:.1} mm\n",
                    i + 1,
                    crack.start[0], crack.start[1], crack.start[2],
                    crack.end[0], crack.end[1], crack.end[2],
                    crack.length, crack.width
                ));
            }
            if damage.crack.cracks.len() > 5 {
                report.push_str(&format!("- ... 还有 {} 条裂缝\n", damage.crack.cracks.len() - 5));
            }
            report.push('\n');
        }

        report.push_str("## 3. 残损热图 (ASCII)\n\n");
        report.push_str("```\n");
        report.push_str(&ascii_heatmap);
        report.push_str("```\n\n");
        report.push_str("图例: ░ 轻微 │ ▒ 中等 │ ▓ 严重 │ █ 极重\n\n");

        report.push_str("## 4. 力学性能评估\n\n");
        report.push_str("### 4.1 截面特性\n\n");
        report.push_str("| 属性 | 原值 | 残余值 | 保留率 |\n");
        report.push_str("|------|------|--------|--------|\n");
        report.push_str(&format!(
            "| 截面面积 | {:.1} mm² | {:.1} mm² | {:.1}% |\n",
            mechanics.original_section.area,
            mechanics.residual_section.area,
            mechanics.damage_effect_factor * 100.0
        ));
        report.push_str(&format!(
            "| 截面惯性矩 | {:.1} mm⁴ | {:.1} mm⁴ | {:.1}% |\n",
            mechanics.original_section.moment_of_inertia,
            mechanics.residual_section.moment_of_inertia,
            mechanics.damage_effect_factor * mechanics.damage_effect_factor * 100.0
        ));
        report.push_str(&format!(
            "| 截面模量 | {:.1} mm³ | {:.1} mm³ | {:.1}% |\n",
            mechanics.original_section.section_modulus,
            mechanics.residual_section.section_modulus,
            mechanics.damage_effect_factor * mechanics.damage_effect_factor.sqrt() * 100.0
        ));
        report.push('\n');

        report.push_str("### 4.2 承载力计算\n\n");
        report.push_str("| 受力类型 | 承载力 | 单位 |\n");
        report.push_str("|----------|--------|------|\n");
        report.push_str(&format!(
            "| 抗弯承载力 | {:.2} | N·mm |\n",
            mechanics.bending_capacity
        ));
        report.push_str(&format!(
            "| 抗压承载力 | {:.2} | N |\n",
            mechanics.compression_capacity
        ));
        report.push_str(&format!(
            "| 抗剪承载力 | {:.2} | N |\n",
            mechanics.shear_capacity
        ));
        report.push('\n');

        report.push_str("### 4.3 安全等级评定\n\n");
        report.push_str(&format!(
            "**安全等级**: {} (保留率 {:.1}%)\n\n",
            mechanics.safety_level,
            mechanics.capacity_ratio * 100.0
        ));

        let level_desc = match mechanics.safety_level {
            crate::mechanics::SafetyLevel::I => "结构完好，承载力满足要求，可正常使用。",
            crate::mechanics::SafetyLevel::II => "轻微损伤，承载力略有下降，建议监控使用，适时维修。",
            crate::mechanics::SafetyLevel::III => "严重损伤，承载力显著下降，需尽快进行加固处理。",
            crate::mechanics::SafetyLevel::IV => "危险状态，承载力严重不足，必须立即采取措施。",
        };
        report.push_str(&format!("{}\n\n", level_desc));

        if let Some(pred) = decay_prediction {
            report.push_str("## 5. 腐朽发展预测\n\n");
            report.push_str(&format_prediction_report(pred));
            report.push('\n');
        }

        report.push_str("## 6. 修复建议\n\n");

        if repairs.is_empty() {
            report.push_str("构件状态良好，暂无修复建议。\n\n");
        } else {
            for (i, repair) in repairs.iter().enumerate() {
                report.push_str(&format!("### 6.{} {} ({})\n\n", i + 1, repair.damage_type, repair.severity));
                report.push_str(&format!("**推荐方案**: {}\n\n", repair.recommended_method));
                report.push_str(&format!("{}\n\n", repair.description));
            }
        }

        if !stl_files.is_empty() {
            report.push_str("## 7. 3D缺陷模型导出\n\n");
            report.push_str(&format!(
                "已导出 {} 个缺陷STL模型，可用于3D打印修复补块：\n\n",
                stl_files.len()
            ));
            for (i, file) in stl_files.iter().enumerate() {
                if let Some(name) = file.file_name().and_then(|n| n.to_str()) {
                    report.push_str(&format!("- [{}]({})\n", name, name));
                }
            }
            report.push('\n');
        }

        report.push_str("## 8. 备注\n\n");
        report.push_str("- 本报告基于点云扫描数据自动分析生成\n");
        report.push_str("- 力学计算参考《木结构设计规范》GB50005-2017\n");
        report.push_str(&format!("- 计算采用安全系数: {}\n", mechanics.safety_factor));
        report.push_str("- 建议结合现场勘察进行最终判定\n");

        Ok(report)
    }

    fn generate_ascii_heatmap(heatmap: &Array2<f64>) -> String {
        let chars = [' ', '░', '▒', '▓', '█'];
        let mut result = String::new();

        let (rows, cols) = heatmap.dim();

        result.push_str("  ");
        for j in 0..cols {
            if j % 5 == 0 {
                result.push_str(&format!("{:2}", j));
            } else {
                result.push_str("  ");
            }
        }
        result.push('\n');

        for i in 0..rows {
            result.push_str(&format!("{:2} ", i));
            for j in 0..cols {
                let value = heatmap[[i, j]];
                let idx = (value * 4.0).round() as usize;
                let idx = idx.min(4).max(0);
                result.push(chars[idx]);
                result.push(chars[idx]);
            }
            result.push('\n');
        }

        result
    }

    fn generate_progress_bar(value: f64, width: usize) -> String {
        let filled = ((value / 100.0) * width as f64).round() as usize;
        let empty = width - filled;

        let color = if value < 30.0 {
            "█"
        } else if value < 60.0 {
            "█"
        } else if value < 80.0 {
            "█"
        } else {
            "█"
        };

        format!(
            "[{}{}] {:.1}%",
            color.repeat(filled),
            " ".repeat(empty),
            value
        )
    }

    pub fn save_report(report: &str, path: &Path) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut file = File::create(path)?;
        file.write_all(report.as_bytes())?;
        Ok(())
    }

    pub fn export_vtk(
        point_cloud: &PointCloud,
        damage: &DamageAnalysis,
        path: &Path,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let mut file = File::create(path)?;

        writeln!(file, "# vtk DataFile Version 3.0")?;
        writeln!(file, "Timber Damage Analysis")?;
        writeln!(file, "ASCII")?;
        writeln!(file, "DATASET POLYDATA")?;
        writeln!(file, "POINTS {} float", point_cloud.len())?;

        for p in &point_cloud.points {
            writeln!(file, "{} {} {}", p.x, p.y, p.z)?;
        }

        writeln!(file, "\nPOINT_DATA {}", point_cloud.len())?;
        writeln!(file, "SCALARS damage_level float 1")?;
        writeln!(file, "LOOKUP_TABLE default")?;

        let decay_set: std::collections::HashSet<_> = damage.decay.decayed_points.iter().collect();

        for i in 0..point_cloud.len() {
            if decay_set.contains(&i) {
                writeln!(file, "1.0")?;
            } else {
                writeln!(file, "0.0")?;
            }
        }

        Ok(())
    }
}
