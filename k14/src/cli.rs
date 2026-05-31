use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "timber-assess")]
#[command(about = "古建筑木结构残损评估命令行工具", long_about = None)]
#[command(version = "0.1.0")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,

    #[arg(short, long, global = true, help = "配置文件路径")]
    pub config: Option<PathBuf>,

    #[arg(short, long, global = true, help = "木材树种: pine/fir/nanmu 或 松木/杉木/楠木", default_value = "pine")]
    pub species: String,

    #[arg(long, global = true, help = "环境温度 (°C)", default_value_t = 20.0)]
    pub temperature: f64,

    #[arg(long, global = true, help = "环境湿度 (%)", default_value_t = 50.0)]
    pub humidity: f64,
}

#[derive(Subcommand)]
pub enum Commands {
    #[command(about = "分析单个点云文件")]
    Analyze {
        #[arg(help = "输入点云文件路径 (.las/.ply)")]
        input: PathBuf,

        #[arg(short, long, help = "输出报告文件路径")]
        output: Option<PathBuf>,

        #[arg(long, help = "导出VTK可视化文件")]
        export_vtk: bool,

        #[arg(long, help = "导出缺陷STL模型（用于3D打印修复补块）")]
        export_stl: bool,

        #[arg(long, help = "预测腐朽发展（Fick扩散方程）")]
        predict_decay: bool,
    },

    #[command(about = "批量处理目录下的点云文件")]
    Process {
        #[arg(help = "输入文件匹配模式 (如: ./scans/*.las)")]
        input: String,

        #[arg(short, long, help = "输出报告目录")]
        output: PathBuf,

        #[arg(long, help = "最大并行处理数 (默认: CPU数/2，限制2-8)")]
        max_parallel: Option<usize>,

        #[arg(long, help = "每批处理文件数 (默认: 10)")]
        batch_size: Option<usize>,
    },

    #[command(about = "历史数据对比分析")]
    Compare {
        #[arg(help = "历史快照文件路径 (.json)")]
        old: PathBuf,

        #[arg(help = "新的点云文件路径")]
        new: PathBuf,

        #[arg(short, long, help = "输出对比报告路径")]
        output: Option<PathBuf>,
    },

    #[command(about = "生成默认配置文件")]
    InitConfig {
        #[arg(help = "配置文件输出路径", default_value = "config.yaml")]
        output: PathBuf,
    },

    #[command(about = "生成示例点云数据用于测试")]
    Demo {
        #[arg(short, long, help = "输出目录")]
        output: Option<PathBuf>,
    },
}
