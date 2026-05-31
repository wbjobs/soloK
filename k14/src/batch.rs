use crate::config::{Config, Environment, WoodSpecies};
use crate::damage::DamageAnalysis;
use crate::mechanics::MechanicsAnalysis;
use crate::pointcloud::load_point_cloud;
use crate::report::ReportGenerator;
use rayon::prelude::*;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

pub struct BatchProcessor;

#[derive(Debug, Clone)]
pub struct BatchResult {
    pub file: PathBuf,
    pub success: bool,
    pub report_path: Option<PathBuf>,
    pub error: Option<String>,
    pub safety_level: Option<String>,
    pub damage_score: Option<f64>,
}

#[derive(Debug, Clone, Copy)]
pub struct BatchConfig {
    pub max_parallel: usize,
    pub batch_size: usize,
    pub gc_interval: usize,
}

impl Default for BatchConfig {
    fn default() -> Self {
        let num_cpus = num_cpus::get();
        Self {
            max_parallel: (num_cpus / 2).max(2).min(8),
            batch_size: 10,
            gc_interval: 5,
        }
    }
}

impl BatchProcessor {
    pub fn process_directory(
        input_pattern: &str,
        output_dir: &Path,
        config: &Config,
        species: WoodSpecies,
        env: &Environment,
    ) -> Vec<BatchResult> {
        Self::process_directory_with_config(
            input_pattern,
            output_dir,
            config,
            species,
            env,
            BatchConfig::default(),
        )
    }

    pub fn process_directory_with_config(
        input_pattern: &str,
        output_dir: &Path,
        config: &Config,
        species: WoodSpecies,
        env: &Environment,
        batch_config: BatchConfig,
    ) -> Vec<BatchResult> {
        let files = Self::expand_glob(input_pattern);

        if files.is_empty() {
            eprintln!("No files found matching pattern: {}", input_pattern);
            return Vec::new();
        }

        println!(
            "Found {} files to process (max parallel: {}, batch size: {})",
            files.len(),
            batch_config.max_parallel,
            batch_config.batch_size
        );

        let counter = Arc::new(AtomicUsize::new(0));
        let total = files.len();

        let config = Arc::new(config.clone());
        let env = Arc::new(*env);
        let output_dir = Arc::new(output_dir.to_path_buf());

        let mut all_results = Vec::new();

        for (batch_idx, batch) in files.chunks(batch_config.batch_size).enumerate() {
            println!(
                "\n=== Processing batch {}/{} ===",
                batch_idx + 1,
                (files.len() + batch_config.batch_size - 1) / batch_config.batch_size
            );

            let counter_clone = Arc::clone(&counter);
            let config_clone = Arc::clone(&config);
            let env_clone = Arc::clone(&env);
            let output_dir_clone = Arc::clone(&output_dir);

            let batch_results: Vec<BatchResult> = batch
                .par_iter()
                .with_max_len(batch_config.max_parallel)
                .map(|file| {
                    let current = counter_clone.fetch_add(1, Ordering::SeqCst) + 1;
                    println!("[{}/{}] Processing: {}", current, total, file.display());

                    match Self::process_single_file(
                        file,
                        &output_dir_clone,
                        &config_clone,
                        species,
                        &env_clone,
                    ) {
                        Ok(result) => {
                            println!(
                                "[{}/{}] Completed: {} - Level: {}, Score: {:.1}",
                                current,
                                total,
                                file.display(),
                                result.safety_level.as_deref().unwrap_or("N/A"),
                                result.damage_score.unwrap_or(0.0)
                            );
                            result
                        }
                        Err(e) => {
                            println!("[{}/{}] Failed: {} - {}", current, total, file.display(), e);
                            BatchResult {
                                file: file.clone(),
                                success: false,
                                report_path: None,
                                error: Some(e),
                                safety_level: None,
                                damage_score: None,
                            }
                        }
                    }
                })
                .collect();

            all_results.extend(batch_results);

            if (batch_idx + 1) % batch_config.gc_interval == 0 {
                println!("Memory cleanup after batch {}...", batch_idx + 1);
            }
        }

        let success_count = all_results.iter().filter(|r| r.success).count();
        println!(
            "\nBatch processing complete: {}/{} files successful",
            success_count, total
        );

        all_results
    }

    fn expand_glob(pattern: &str) -> Vec<PathBuf> {
        match glob::glob(pattern) {
            Ok(paths) => paths
                .filter_map(|p| p.ok())
                .filter(|p| p.is_file())
                .collect(),
            Err(_) => {
                let path = Path::new(pattern);
                if path.exists() {
                    vec![path.to_path_buf()]
                } else {
                    Vec::new()
                }
            }
        }
    }

    fn process_single_file(
        file: &Path,
        output_dir: &Path,
        config: &Config,
        species: WoodSpecies,
        env: &Environment,
    ) -> Result<BatchResult, String> {
        let point_cloud =
            load_point_cloud(file).map_err(|e| format!("Failed to load file: {}", e))?;

        let damage = DamageAnalysis::analyze(&point_cloud, config, &species, env);
        let mechanics = MechanicsAnalysis::analyze(&point_cloud, &damage, config, species, env);

        let repairs = mechanics.recommend_repairs(&damage);

        let filename = file
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown");

        let report = ReportGenerator::generate_markdown(
            filename,
            &point_cloud,
            &damage,
            &mechanics,
            config,
            env,
            &repairs,
        )
        .map_err(|e| format!("Failed to generate report: {}", e))?;

        let report_filename = format!(
            "{}.md",
            file.file_stem().and_then(|s| s.to_str()).unwrap_or("report")
        );
        let report_path = output_dir.join(report_filename);

        ReportGenerator::save_report(&report, &report_path)
            .map_err(|e| format!("Failed to save report: {}", e))?;

        if config.output.export_vtk {
            let vtk_filename = format!(
                "{}.vtk",
                file.file_stem().and_then(|s| s.to_str()).unwrap_or("cloud")
            );
            let vtk_path = output_dir.join(vtk_filename);
            let _ = ReportGenerator::export_vtk(&point_cloud, &damage, &vtk_path);
        }

        Ok(BatchResult {
            file: file.to_path_buf(),
            success: true,
            report_path: Some(report_path),
            error: None,
            safety_level: Some(mechanics.safety_level.to_string()),
            damage_score: Some(damage.overall_damage_score),
        })
    }

    pub fn generate_summary(results: &[BatchResult], output_dir: &Path) -> Result<(), String> {
        let summary_path = output_dir.join("SUMMARY.md");

        let mut summary = String::new();
        summary.push_str("# 批量处理结果汇总\n\n");
        summary.push_str(&format!(
            "**处理时间**: {}\n\n",
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S")
        ));
        summary.push_str(&format!(
            "**总计**: {} 个文件\n",
            results.len()
        ));
        summary.push_str(&format!(
            "**成功**: {} 个文件\n",
            results.iter().filter(|r| r.success).count()
        ));
        summary.push_str(&format!(
            "**失败**: {} 个文件\n\n",
            results.iter().filter(|r| !r.success).count()
        ));

        summary.push_str("## 处理结果详情\n\n");
        summary.push_str("| 序号 | 文件 | 状态 | 安全等级 | 残损指数 | 报告 |\n");
        summary.push_str("|------|------|------|----------|----------|------|\n");

        for (i, result) in results.iter().enumerate() {
            let status = if result.success { "✅ 成功" } else { "❌ 失败" };
            let level = result.safety_level.as_deref().unwrap_or("-");
            let score = result
                .damage_score
                .map(|s| format!("{:.1}", s))
                .unwrap_or("-".to_string());
            let report_link = result
                .report_path
                .as_ref()
                .and_then(|p| p.file_name().and_then(|n| n.to_str()))
                .unwrap_or("-");

            summary.push_str(&format!(
                "| {} | {} | {} | {} | {} | [{}]({}) |\n",
                i + 1,
                result.file.file_name().and_then(|n| n.to_str()).unwrap_or("-"),
                status,
                level,
                score,
                report_link,
                report_link
            ));
        }

        summary.push_str("\n## 安全等级统计\n\n");
        let mut level_counts = std::collections::HashMap::new();
        for result in results.iter().filter(|r| r.success) {
            if let Some(level) = &result.safety_level {
                *level_counts.entry(level.clone()).or_insert(0) += 1;
            }
        }

        for (level, count) in level_counts.iter() {
            summary.push_str(&format!("- {}: {} 个构件\n", level, count));
        }

        std::fs::write(&summary_path, summary)
            .map_err(|e| format!("Failed to write summary: {}", e))?;

        println!("Summary saved to: {}", summary_path.display());
        Ok(())
    }
}
