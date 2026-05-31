use clap::Parser;
use std::path::Path;
use timber_assess::batch::BatchProcessor;
use timber_assess::cli::{Cli, Commands};
use timber_assess::comparison::{run_comparison_analysis, AnalysisSnapshot};
use timber_assess::config::{Config, Environment, WoodSpecies};
use timber_assess::damage::DamageAnalysis;
use timber_assess::decay_prediction::{FickDiffusionSolver, FickSolverConfig};
use timber_assess::defect_reconstruction::export_all_defects;
use timber_assess::mechanics::MechanicsAnalysis;
use timber_assess::pointcloud::{load_point_cloud, Point, PointCloud};
use timber_assess::report::ReportGenerator;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    let mut config = if let Some(config_path) = &cli.config {
        Config::from_file(config_path)?
    } else {
        Config::default()
    };

    let species: WoodSpecies = cli.species.parse()?;
    config = config.with_species(&species);

    let env = Environment::new(cli.temperature, cli.humidity);

    match cli.command {
        Commands::Analyze {
            input,
            output,
            export_vtk,
            export_stl,
            predict_decay,
        } => {
            println!("Loading point cloud: {}", input.display());
            let pc = load_point_cloud(&input)?;
            println!("Loaded {} points", pc.len());

            println!("Analyzing damage...");
            let damage = DamageAnalysis::analyze(&pc, &config, &species, &env);
            println!("Overall damage score: {:.1}/100", damage.overall_damage_score);

            println!("Analyzing mechanics...");
            let mechanics = MechanicsAnalysis::analyze(&pc, &damage, &config, species, &env);
            println!("Safety level: {}", mechanics.safety_level);

            let repairs = mechanics.recommend_repairs(&damage);
            println!("Repair suggestions: {} items", repairs.len());

            let decay_prediction = if predict_decay && !damage.decay.decayed_points.is_empty() {
                println!("Predicting decay progression...");
                let solver = FickDiffusionSolver::new(FickSolverConfig::default(), species, env);
                let thickness = mechanics.original_section.height;
                let pred = solver.predict_decay(&damage.decay, thickness);
                println!(
                    "Remaining safe years: {:.1} (confidence: {:.0}%)",
                    pred.remaining_safe_years,
                    pred.confidence * 100.0
                );
                Some(pred)
            } else {
                None
            };

            let filename = input
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown");
            let stem = input.file_stem().and_then(|s| s.to_str()).unwrap_or("report");

            let stl_files = if export_stl {
                println!("Exporting defect STL models...");
                let stl_dir = Path::new(stem);
                let exported =
                    export_all_defects(&pc, &damage.decay, &damage.insect, &damage.crack, stl_dir, stem)?;
                println!("Exported {} STL files", exported.len());
                exported
            } else {
                Vec::new()
            };

            let report = ReportGenerator::generate_markdown(
                filename,
                &pc,
                &damage,
                &mechanics,
                &config,
                &env,
                &repairs,
                decay_prediction.as_ref(),
                &stl_files,
            )?;

            let output_path = output.unwrap_or_else(|| Path::new(&format!("{}.md", stem)).to_path_buf());

            ReportGenerator::save_report(&report, &output_path)?;
            println!("Report saved to: {}", output_path.display());

            if export_vtk || config.output.export_vtk {
                let vtk_path = output_path.with_extension("vtk");
                ReportGenerator::export_vtk(&pc, &damage, &vtk_path)?;
                println!("VTK file saved to: {}", vtk_path.display());
            }

            let snapshot = AnalysisSnapshot::from_analysis(filename, &damage, &mechanics);
            let snapshot_path = output_path.with_extension("json");
            snapshot.save(&snapshot_path)?;
            println!("Snapshot saved to: {}", snapshot_path.display());
        }

        Commands::Process {
            input,
            output,
            max_parallel,
            batch_size,
        } => {
            println!("Batch processing mode");
            println!("Input pattern: {}", input);
            println!("Output directory: {}", output.display());

            std::fs::create_dir_all(&output)?;

            let mut batch_config = timber_assess::batch::BatchConfig::default();
            if let Some(mp) = max_parallel {
                batch_config.max_parallel = mp;
            }
            if let Some(bs) = batch_size {
                batch_config.batch_size = bs;
            }

            println!(
                "Batch config: max_parallel={}, batch_size={}",
                batch_config.max_parallel, batch_config.batch_size
            );

            let results = BatchProcessor::process_directory_with_config(
                &input, &output, &config, species, &env, batch_config,
            );
            BatchProcessor::generate_summary(&results, &output)?;
        }

        Commands::Compare { old, new, output } => {
            println!("Running comparison analysis...");
            let report = run_comparison_analysis(&old, &new, &config, species, &env)?;

            let output_path = output.unwrap_or_else(|| Path::new("comparison.md").to_path_buf());

            std::fs::write(&output_path, report)?;
            println!("Comparison report saved to: {}", output_path.display());
        }

        Commands::InitConfig { output } => {
            config.to_file(&output)?;
            println!("Default config saved to: {}", output.display());
        }

        Commands::Demo { output } => {
            println!("Generating demo point cloud data...");
            let output_dir = output.unwrap_or_else(|| Path::new("./demo").to_path_buf());
            std::fs::create_dir_all(&output_dir)?;

            generate_demo_data(&output_dir)?;
            println!("Demo data generated in: {}", output_dir.display());
            println!("\nYou can now run:");
            println!("  timber-assess analyze ./demo/beam_damaged.ply");
            println!("  timber-assess process --input ./demo/*.ply --output ./reports");
        }
    }

    Ok(())
}

fn generate_demo_data(output_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    use rand::Rng;
    let mut rng = rand::thread_rng();

    let beam_good = generate_beam(&mut rng, 200, 0.0, 0.0, 0.0);
    save_ply(&beam_good, &output_dir.join("beam_good.ply"))?;

    let beam_decayed = generate_beam(&mut rng, 200, 0.15, 0.0, 0.0);
    save_ply(&beam_decayed, &output_dir.join("beam_decayed.ply"))?;

    let beam_insect = generate_beam(&mut rng, 200, 0.0, 0.05, 0.0);
    save_ply(&beam_insect, &output_dir.join("beam_insect.ply"))?;

    let beam_cracked = generate_beam(&mut rng, 200, 0.0, 0.0, 0.1);
    save_ply(&beam_cracked, &output_dir.join("beam_cracked.ply"))?;

    let beam_damaged = generate_beam(&mut rng, 200, 0.2, 0.08, 0.15);
    save_ply(&beam_damaged, &output_dir.join("beam_damaged.ply"))?;

    Ok(())
}

fn generate_beam(
    rng: &mut impl rand::Rng,
    n_points: usize,
    decay_ratio: f64,
    insect_ratio: f64,
    crack_ratio: f64,
) -> PointCloud {
    let mut points = Vec::new();

    let length = 2000.0;
    let width = 150.0;
    let height = 200.0;

    for _ in 0..n_points {
        let x = rng.gen_range(0.0..length);
        let y = rng.gen_range(-width / 2.0..width / 2.0);
        let z = rng.gen_range(-height / 2.0..height / 2.0);

        let mut p = Point::new(x, y, z);

        let dist_from_surface = (y.abs() - width / 2.0).abs().min((z.abs() - height / 2.0).abs());

        let is_decayed = rng.gen_bool(decay_ratio) && dist_from_surface < 30.0;
        let is_insect = rng.gen_bool(insect_ratio);
        let is_crack = rng.gen_bool(crack_ratio) && (x > length * 0.3 && x < length * 0.7);

        if is_decayed {
            p = p.with_color(150, 80, 30);
            p.intensity = Some(30.0);
        } else if is_insect {
            p.intensity = Some(10.0);
        } else if is_crack {
            p = p.with_color(80, 60, 40);
            p.intensity = Some(20.0);
        } else {
            p = p.with_color(200, 160, 100);
            p.intensity = Some(180.0);
        }

        points.push(p);
    }

    PointCloud::new(points)
}

fn save_ply(pc: &PointCloud, path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let mut content = String::new();
    content.push_str("ply\n");
    content.push_str("format ascii 1.0\n");
    content.push_str(&format!("element vertex {}\n", pc.len()));
    content.push_str("property float x\n");
    content.push_str("property float y\n");
    content.push_str("property float z\n");
    content.push_str("property float intensity\n");
    content.push_str("property uchar red\n");
    content.push_str("property uchar green\n");
    content.push_str("property uchar blue\n");
    content.push_str("end_header\n");

    for p in &pc.points {
        let r = p.red.unwrap_or(200) as u8;
        let g = p.green.unwrap_or(160) as u8;
        let b = p.blue.unwrap_or(100) as u8;
        let intensity = p.intensity.unwrap_or(100.0);
        content.push_str(&format!(
            "{} {} {} {} {} {} {}\n",
            p.x, p.y, p.z, intensity, r, g, b
        ));
    }

    std::fs::write(path, content)?;
    Ok(())
}
