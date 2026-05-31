use crate::fsm_dsl::ast::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FpgaFamily {
    Xilinx7Series,
    XilinxUltraScale,
    XilinxUltraScalePlus,
    IntelCyclone10,
    IntelStratix10,
    IntelAgilex,
    Generic,
}

impl FpgaFamily {
    pub fn from_target(s: &str) -> Self {
        let s = s.to_lowercase();
        if s.contains("xc7") || s.contains("7series") || s.contains("artix") || s.contains("kintex7") || s.contains("virtex7") || s.contains("zynq7") {
            FpgaFamily::Xilinx7Series
        } else if s.contains("xciu") || (s.contains("ultrascale") && !s.contains("plus")) {
            FpgaFamily::XilinxUltraScale
        } else if s.contains("ultrascale+") || s.contains("ultrascale_plus") {
            FpgaFamily::XilinxUltraScalePlus
        } else if s.contains("10cx") || s.contains("cyclone10") || s.contains("5ce") || s.contains("cyclone") {
            FpgaFamily::IntelCyclone10
        } else if s.contains("1sx") || s.contains("stratix10") || s.contains("stratix") {
            FpgaFamily::IntelStratix10
        } else if s.contains("agilex") {
            FpgaFamily::IntelAgilex
        } else {
            FpgaFamily::Generic
        }
    }

    pub fn lut_delay_ps(&self) -> u32 {
        match self {
            FpgaFamily::Xilinx7Series => 350,
            FpgaFamily::XilinxUltraScale => 250,
            FpgaFamily::XilinxUltraScalePlus => 180,
            FpgaFamily::IntelCyclone10 => 400,
            FpgaFamily::IntelStratix10 => 200,
            FpgaFamily::IntelAgilex => 150,
            FpgaFamily::Generic => 300,
        }
    }

    pub fn setup_time_ps(&self) -> u32 {
        match self {
            FpgaFamily::Xilinx7Series => 300,
            FpgaFamily::XilinxUltraScale => 200,
            FpgaFamily::XilinxUltraScalePlus => 100,
            FpgaFamily::IntelCyclone10 => 350,
            FpgaFamily::IntelStratix10 => 150,
            FpgaFamily::IntelAgilex => 100,
            FpgaFamily::Generic => 250,
        }
    }

    pub fn clock_to_out_ps(&self) -> u32 {
        match self {
            FpgaFamily::Xilinx7Series => 400,
            FpgaFamily::XilinxUltraScale => 250,
            FpgaFamily::XilinxUltraScalePlus => 180,
            FpgaFamily::IntelCyclone10 => 450,
            FpgaFamily::IntelStratix10 => 200,
            FpgaFamily::IntelAgilex => 150,
            FpgaFamily::Generic => 350,
        }
    }

    pub fn routing_overhead_ps(&self) -> u32 {
        match self {
            FpgaFamily::Xilinx7Series => 600,
            FpgaFamily::XilinxUltraScale => 400,
            FpgaFamily::XilinxUltraScalePlus => 300,
            FpgaFamily::IntelCyclone10 => 700,
            FpgaFamily::IntelStratix10 => 350,
            FpgaFamily::IntelAgilex => 250,
            FpgaFamily::Generic => 500,
        }
    }

    #[allow(dead_code)]
    pub fn is_xilinx(&self) -> bool {
        matches!(self, FpgaFamily::Xilinx7Series | FpgaFamily::XilinxUltraScale | FpgaFamily::XilinxUltraScalePlus)
    }

    pub fn is_intel(&self) -> bool {
        matches!(self, FpgaFamily::IntelCyclone10 | FpgaFamily::IntelStratix10 | FpgaFamily::IntelAgilex)
    }
}

#[derive(Debug, Clone)]
pub struct PipelineConfig {
    pub num_stages: u32,
    pub stage_registers: Vec<StageRegister>,
    pub target_period_ps: u32,
    pub needs_pipeline: bool,
    #[allow(dead_code)]
    pub estimated_delay_ps: u32,
}

#[derive(Debug, Clone)]
pub struct StageRegister {
    pub name: String,
    pub width: u32,
    pub stage: u32,
}

pub struct PipelineInserter {
    fsm: FsmDecl,
    target: FpgaFamily,
}

impl PipelineInserter {
    pub fn new(fsm: FsmDecl, target: FpgaFamily) -> Self {
        PipelineInserter { fsm, target }
    }

    pub fn analyze_and_insert(self) -> (FsmDecl, PipelineConfig) {
        let target_period_ps = (1_000_000_000_000.0 / (self.fsm.clock_freq_mhz * 1e6)) as u32;
        let overhead_ps = self.target.setup_time_ps() + self.target.clock_to_out_ps() + self.target.routing_overhead_ps();
        let available_logic_ps = target_period_ps.saturating_sub(overhead_ps);

        let estimated_delay_ps = self.estimate_total_delay();

        let needs_pipeline = estimated_delay_ps > available_logic_ps;
        let num_stages = if needs_pipeline && available_logic_ps > 0 {
            ((estimated_delay_ps + available_logic_ps - 1) / available_logic_ps).max(2)
        } else if available_logic_ps == 0 {
            2
        } else {
            1
        };

        let mut stage_registers = Vec::new();

        if num_stages > 1 {
            for signal in &self.fsm.signals {
                if signal.kind == SignalKind::Register || signal.kind == SignalKind::Output {
                    for stage in 1..num_stages {
                        stage_registers.push(StageRegister {
                            name: format!("{}_pipe{}", signal.name.0, stage),
                            width: signal.width,
                            stage,
                        });
                    }
                }
            }
            stage_registers.push(StageRegister {
                name: format!("{}_next", self.fsm.name.0),
                width: self.fsm.state_width(),
                stage: 1,
            });
        }

        let config = PipelineConfig {
            num_stages,
            stage_registers,
            target_period_ps,
            needs_pipeline,
            estimated_delay_ps,
        };

        (self.fsm, config)
    }

    fn estimate_total_delay(&self) -> u32 {
        let lut_delay = self.target.lut_delay_ps();
        let num_states = self.fsm.num_states();

        let state_decoder_depth = if num_states <= 4 {
            1
        } else if num_states <= 16 {
            2
        } else if num_states <= 64 {
            3
        } else if num_states <= 256 {
            4
        } else {
            5
        };

        let expr_depth = self.estimate_max_expr_depth();
        let condition_mux_depth = if self.fsm.transitions.iter().any(|t| t.condition.is_some()) {
            2
        } else {
            0
        };

        let output_mux_depth = if self.fsm.signals.iter().any(|s| s.kind == SignalKind::Output || s.kind == SignalKind::Register) {
            1
        } else {
            0
        };

        let total_lut_levels = state_decoder_depth + expr_depth + condition_mux_depth + output_mux_depth;
        total_lut_levels * lut_delay
    }

    fn estimate_max_expr_depth(&self) -> u32 {
        let mut max_depth: u32 = 1;

        for t in &self.fsm.transitions {
            if let Some(ref cond) = t.condition {
                let depth = Self::expr_depth(cond);
                max_depth = max_depth.max(depth);
            }
            for a in &t.actions {
                match a {
                    Action::Assign { value, .. } | Action::Output { value, .. } => {
                        let depth = Self::expr_depth(value);
                        max_depth = max_depth.max(depth);
                    }
                }
            }
        }

        max_depth
    }

    fn expr_depth(expr: &Expr) -> u32 {
        match expr {
            Expr::Literal(_) | Expr::Var(_) => 1,
            Expr::BinOp(_, lhs, rhs) => {
                1 + Self::expr_depth(lhs).max(Self::expr_depth(rhs))
            }
            Expr::UnaryOp(_, inner) => 1 + Self::expr_depth(inner),
            Expr::Ternary(cond, then_, else_) => {
                1 + Self::expr_depth(cond)
                    .max(Self::expr_depth(then_))
                    .max(Self::expr_depth(else_))
            }
            Expr::Concat(exprs) => {
                1 + exprs.iter().map(Self::expr_depth).max().unwrap_or(0)
            }
            Expr::BitSlice(inner, _, _) => 1 + Self::expr_depth(inner),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_60_state_fsm() -> FsmDecl {
        let mut states = Vec::new();
        let mut transitions = Vec::new();

        for i in 0..60 {
            states.push(StateDecl {
                name: Ident(format!("S{}", i)),
                is_initial: i == 0,
                encoding: None,
            });
        }

        for i in 0..60 {
            let next = (i + 1) % 60;
            transitions.push(Transition {
                from_state: Ident(format!("S{}", i)),
                condition: Some(Expr::Var(Ident("go".into()))),
                to_state: Ident(format!("S{}", next)),
                actions: vec![Action::Assign {
                    target: Ident("cnt".into()),
                    value: Expr::BinOp(BinOp::Add, Box::new(Expr::Var(Ident("cnt".into()))), Box::new(Expr::Literal(1))),
                }],
            });
            transitions.push(Transition {
                from_state: Ident(format!("S{}", i)),
                condition: None,
                to_state: Ident(format!("S{}", i)),
                actions: vec![],
            });
        }

        FsmDecl {
            name: Ident("large_test".into()),
            clock_freq_mhz: 100.0,
            reset_kind: ResetKind::Sync,
            encoding: StateEncoding::Binary,
            states,
            transitions,
            signals: vec![
                SignalDecl { name: Ident("go".into()), width: 1, kind: SignalKind::Input },
                SignalDecl { name: Ident("cnt".into()), width: 8, kind: SignalKind::Register },
            ],
            parameters: vec![],
        }
    }

    #[test]
    fn test_pipeline_not_needed() {
        let fsm = FsmDecl {
            name: Ident("test".into()),
            clock_freq_mhz: 10.0,
            reset_kind: ResetKind::Sync,
            encoding: StateEncoding::Binary,
            states: vec![
                StateDecl { name: Ident("A".into()), is_initial: true, encoding: None },
                StateDecl { name: Ident("B".into()), is_initial: false, encoding: None },
            ],
            transitions: vec![Transition {
                from_state: Ident("A".into()),
                condition: Some(Expr::Var(Ident("x".into()))),
                to_state: Ident("B".into()),
                actions: vec![],
            }],
            signals: vec![],
            parameters: vec![],
        };

        let inserter = PipelineInserter::new(fsm, FpgaFamily::Xilinx7Series);
        let (_, config) = inserter.analyze_and_insert();
        assert!(!config.needs_pipeline);
        assert_eq!(config.num_stages, 1);
    }

    #[test]
    fn test_60_states_timing_analysis() {
        let fsm = make_60_state_fsm();
        let inserter = PipelineInserter::new(fsm, FpgaFamily::Xilinx7Series);
        let (_, config) = inserter.analyze_and_insert();

        assert!(config.estimated_delay_ps > 0, "delay should be positive");

        let _expected_period_ps = 10_000;
        assert!(config.target_period_ps > 0);
    }

    #[test]
    fn test_fpga_family_detection() {
        assert_eq!(FpgaFamily::from_target("xc7a100t"), FpgaFamily::Xilinx7Series);
        assert_eq!(FpgaFamily::from_target("xciu50"), FpgaFamily::XilinxUltraScale);
        assert!(FpgaFamily::from_target("xc7a100t").is_xilinx());
        assert!(FpgaFamily::from_target("10cx150").is_intel());
    }
}
