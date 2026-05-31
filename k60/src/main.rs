mod fsm_dsl;
mod optimizer;
mod pipeline;
mod codegen;
mod constraint;
mod power;

use clap::Parser;
use std::collections::HashMap;
use std::fs;
use std::path::{PathBuf, Path};
use pipeline::FpgaFamily;
use power::{PowerAnalyzer, generate_markdown_report};

#[derive(Parser, Debug)]
#[command(name = "fsm2v", version, about = "FSM DSL to Verilog compiler for FPGA")]
struct Cli {
    #[arg(help = "Input FSM DSL file path")]
    input: PathBuf,

    #[arg(long, short, help = "Output directory for generated files")]
    output: Option<PathBuf>,

    #[arg(long, short, default_value = "xc7a100t", help = "Target FPGA part number (e.g. xc7a100t, 10cx150, xciu50)")]
    target: String,

    #[arg(long, help = "Override clock frequency in MHz")]
    clock_freq: Option<f64>,

    #[arg(long, default_value = "binary", help = "State encoding: binary, onehot, gray, user")]
    encoding: Option<String>,

    #[arg(long, help = "Force pipeline depth (0 = auto)")]
    pipeline_depth: Option<u32>,

    #[arg(long, help = "Enable power analysis and generate report")]
    power_analysis: bool,

    #[arg(long, help = "Transition probability file (format: from_state to_state probability per line)")]
    prob_file: Option<PathBuf>,

    #[arg(long, help = "Enable verbose output")]
    verbose: bool,
}

fn load_probabilities(path: &Path) -> Result<HashMap<String, HashMap<String, f64>>, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("cannot read probability file: {}", e))?;
    let mut probs: HashMap<String, HashMap<String, f64>> = HashMap::new();

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() != 3 {
            continue;
        }
        let from = parts[0].to_string();
        let to = parts[1].to_string();
        let prob: f64 = parts[2].parse()
            .map_err(|e| format!("invalid probability '{}' on line: {}", parts[2], e))?;
        probs.entry(from).or_default().insert(to, prob);
    }

    Ok(probs)
}

fn main() {
    let cli = Cli::parse();

    let input_path = &cli.input;
    if !input_path.exists() {
        eprintln!("Error: input file '{}' not found", input_path.display());
        std::process::exit(1);
    }

    let input_content = match fs::read_to_string(input_path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Error reading '{}': {}", input_path.display(), e);
            std::process::exit(1);
        }
    };

    let total_steps = if cli.power_analysis { 8 } else { 6 };

    if cli.verbose {
        eprintln!("[1/{}] Parsing FSM DSL...", total_steps);
    }

    let mut fsm = match fsm_dsl::parse(&input_content) {
        Ok(fsm) => fsm,
        Err(e) => {
            eprintln!("Parse error: {:?}", e);
            std::process::exit(1);
        }
    };

    if let Some(freq) = cli.clock_freq {
        fsm.clock_freq_mhz = freq;
    }

    if let Some(ref enc) = cli.encoding {
        fsm.encoding = match enc.as_str() {
            "onehot" => fsm_dsl::ast::StateEncoding::OneHot,
            "gray" => fsm_dsl::ast::StateEncoding::Gray,
            "user" => fsm_dsl::ast::StateEncoding::User,
            _ => fsm_dsl::ast::StateEncoding::Binary,
        };
    }

    if cli.verbose {
        eprintln!(
            "      FSM: {} | States: {} | Transitions: {} | Clock: {} MHz",
            fsm.name.0,
            fsm.states.len(),
            fsm.transitions.len(),
            fsm.clock_freq_mhz,
        );
    }

    if cli.verbose {
        eprintln!("[2/{}] Optimizing state transition table...", total_steps);
    }

    let opt = optimizer::Optimizer::new(fsm);
    let fsm = opt.optimize();

    if cli.verbose {
        eprintln!(
            "      After optimization: {} states, {} transitions",
            fsm.states.len(),
            fsm.transitions.len(),
        );
    }

    let target = FpgaFamily::from_target(&cli.target);

    if cli.verbose {
        eprintln!("[3/{}] Analyzing pipeline requirements for target '{}'...", total_steps, cli.target);
    }

    let (fsm, mut pipeline_config) = pipeline::PipelineInserter::new(fsm, target).analyze_and_insert();

    if let Some(depth) = cli.pipeline_depth {
        if depth > 0 {
            pipeline_config.num_stages = depth;
            pipeline_config.needs_pipeline = depth > 1;
        }
    }

    if cli.verbose {
        if pipeline_config.needs_pipeline {
            eprintln!(
                "      Pipeline required: {} stages (target period: {}ps)",
                pipeline_config.num_stages,
                pipeline_config.target_period_ps,
            );
        } else {
            eprintln!("      No pipeline needed for target frequency");
        }
    }

    if cli.verbose {
        eprintln!("[4/{}] Generating Verilog...", total_steps);
    }

    let verilog_gen = codegen::VerilogGenerator::new(fsm.clone(), pipeline_config.clone(), target);
    let verilog = verilog_gen.generate();

    if cli.verbose {
        eprintln!("[5/{}] Generating constraint file...", total_steps);
    }

    let constraint_gen = constraint::ConstraintGenerator::new(fsm.clone(), pipeline_config, target);
    let constraint = constraint_gen.generate();

    let output_dir = cli.output.unwrap_or_else(|| {
        input_path.parent().unwrap_or(Path::new("")).to_path_buf()
    });

    if !output_dir.exists() {
        fs::create_dir_all(&output_dir).unwrap();
    }

    let stem = input_path.file_stem().unwrap_or_default().to_string_lossy();

    if cli.verbose {
        eprintln!("[6/{}] Writing output files...", total_steps);
    }

    let verilog_path = output_dir.join(format!("{}.v", stem));
    let constraint_path = if target.is_intel() {
        output_dir.join(format!("{}.sdc", stem))
    } else {
        output_dir.join(format!("{}.xdc", stem))
    };

    fs::write(&verilog_path, &verilog).unwrap();
    fs::write(&constraint_path, &constraint).unwrap();

    println!("Generated: {}", verilog_path.display());
    println!("Generated: {}", constraint_path.display());

    if cli.power_analysis {
        if cli.verbose {
            eprintln!("[7/{}] Running power analysis...", total_steps);
        }

        let mut analyzer = PowerAnalyzer::new(fsm.clone(), target);

        if let Some(ref prob_path) = cli.prob_file {
            match load_probabilities(prob_path) {
                Ok(probs) => {
                    if cli.verbose {
                        eprintln!("      Loaded custom transition probabilities from {}", prob_path.display());
                    }
                    analyzer = analyzer.with_probabilities(probs);
                }
                Err(e) => {
                    eprintln!("Warning: {} - using estimated probabilities", e);
                }
            }
        }

        let analysis = analyzer.analyze();

        if cli.verbose {
            eprintln!(
                "      Estimated total power: {:.3} mW (dynamic: {:.3} mW, static: {:.3} mW)",
                analysis.estimated_power_mw.total_power_mw,
                analysis.estimated_power_mw.total_dynamic_power_mw,
                analysis.estimated_power_mw.static_power_mw,
            );
            eprintln!(
                "      Generated {} optimization suggestions",
                analysis.suggestions.len(),
            );
        }

        if cli.verbose {
            eprintln!("[8/{}] Writing power analysis report...", total_steps);
        }

        let report = generate_markdown_report(&analysis);
        let report_path = output_dir.join(format!("{}_power.md", stem));
        fs::write(&report_path, &report).unwrap();
        println!("Generated: {}", report_path.display());
    }

    if cli.verbose {
        eprintln!("Done.");
    }
}
