use crate::fsm_dsl::ast::*;
use crate::pipeline::FpgaFamily;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct PowerAnalysis {
    pub fsm_name: String,
    pub clock_freq_mhz: f64,
    pub target: FpgaFamily,
    pub encoding: StateEncoding,
    pub state_probabilities: HashMap<String, f64>,
    pub transition_probabilities: Vec<TransitionProbability>,
    pub state_toggle_rates: HashMap<String, f64>,
    pub estimated_power_mw: PowerEstimate,
    pub suggestions: Vec<PowerSuggestion>,
}

#[derive(Debug, Clone)]
pub struct TransitionProbability {
    pub from_state: String,
    pub to_state: String,
    pub is_conditional: bool,
    pub probability: f64,
    pub bit_hamming_distance: u32,
}

#[derive(Debug, Clone)]
pub struct PowerEstimate {
    pub clock_power_mw: f64,
    pub state_register_power_mw: f64,
    pub combinational_power_mw: f64,
    pub output_power_mw: f64,
    pub total_dynamic_power_mw: f64,
    pub static_power_mw: f64,
    pub total_power_mw: f64,
}

#[derive(Debug, Clone)]
pub struct PowerSuggestion {
    pub category: SuggestionCategory,
    pub severity: SuggestionSeverity,
    pub title: String,
    pub description: String,
    pub estimated_saving_mw: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SuggestionCategory {
    Encoding,
    ClockGating,
    StateMinimization,
    PipelineReduction,
    TransitionOptimization,
    SignalOptimization,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SuggestionSeverity {
    High,
    Medium,
    Low,
}

pub struct PowerAnalyzer {
    fsm: FsmDecl,
    target: FpgaFamily,
    custom_probabilities: HashMap<String, HashMap<String, f64>>,
}

impl PowerAnalyzer {
    pub fn new(fsm: FsmDecl, target: FpgaFamily) -> Self {
        PowerAnalyzer {
            fsm,
            target,
            custom_probabilities: HashMap::new(),
        }
    }

    pub fn with_probabilities(mut self, probs: HashMap<String, HashMap<String, f64>>) -> Self {
        self.custom_probabilities = probs;
        self
    }

    pub fn analyze(self) -> PowerAnalysis {
        let state_probs = self.compute_state_probabilities();
        let transition_probs = self.compute_transition_probabilities(&state_probs);
        let toggle_rates = self.compute_toggle_rates(&transition_probs);
        let power = self.estimate_power(&state_probs, &toggle_rates, &transition_probs);
        let suggestions = self.generate_suggestions(&state_probs, &transition_probs, &toggle_rates, &power);

        PowerAnalysis {
            fsm_name: self.fsm.name.0.clone(),
            clock_freq_mhz: self.fsm.clock_freq_mhz,
            target: self.target,
            encoding: self.fsm.encoding,
            state_probabilities: state_probs,
            transition_probabilities: transition_probs,
            state_toggle_rates: toggle_rates,
            estimated_power_mw: power,
            suggestions,
        }
    }

    fn compute_state_probabilities(&self) -> HashMap<String, f64> {
        let n = self.fsm.states.len();
        if n == 0 {
            return HashMap::new();
        }

        let uniform = 1.0 / n as f64;
        let mut probs: HashMap<String, f64> = self.fsm.states.iter()
            .map(|s| (s.name.0.clone(), uniform))
            .collect();

        if let Some(initial) = self.fsm.initial_state() {
            *probs.get_mut(&initial.name.0).unwrap() += 0.05;
            let overflow: f64 = 0.05 / (n - 1).max(1) as f64;
            for state in &self.fsm.states {
                if state.name.0 != initial.name.0 {
                    *probs.get_mut(&state.name.0).unwrap() -= overflow;
                }
            }
        }

        let out_degree: HashMap<String, usize> = self.fsm.states.iter()
            .map(|s| {
                let count = self.fsm.transitions.iter()
                    .filter(|t| t.from_state == s.name)
                    .count()
                    .max(1);
                (s.name.0.clone(), count)
            })
            .collect();

        let in_degree: HashMap<String, usize> = self.fsm.states.iter()
            .map(|s| {
                let count = self.fsm.transitions.iter()
                    .filter(|t| t.to_state == s.name && t.from_state != s.name)
                    .count();
                (s.name.0.clone(), count)
            })
            .collect();

        let mut adjusted: HashMap<String, f64> = HashMap::new();
        for state in &self.fsm.states {
            let base = probs[&state.name.0];
            let in_deg = in_degree[&state.name.0] as f64;
            let out_deg = out_degree[&state.name.0] as f64;
            let connectivity_bonus = (in_deg * 0.02) - (out_deg * 0.005);
            adjusted.insert(state.name.0.clone(), (base + connectivity_bonus).max(0.001));
        }

        let total: f64 = adjusted.values().sum();
        for v in adjusted.values_mut() {
            *v /= total;
        }

        adjusted
    }

    fn compute_transition_probabilities(&self, state_probs: &HashMap<String, f64>) -> Vec<TransitionProbability> {
        let mut result = Vec::new();

        for state in &self.fsm.states {
            let state_prob = state_probs[&state.name.0];
            let state_transitions: Vec<&Transition> = self.fsm.transitions.iter()
                .filter(|t| t.from_state == state.name)
                .collect();

            let conditional_count = state_transitions.iter().filter(|t| t.condition.is_some()).count();
            let has_default = state_transitions.iter().any(|t| t.condition.is_none());

            let conditional_share = if has_default { 0.8 } else { 1.0 };
            let per_conditional_prob = if conditional_count > 0 {
                conditional_share / conditional_count as f64
            } else {
                0.0
            };
            let default_prob = if has_default { 1.0 - conditional_share } else { 0.0 };

            for t in &state_transitions {
                let trans_prob = if t.condition.is_some() {
                    per_conditional_prob * state_prob
                } else {
                    default_prob * state_prob
                };

                let hamming = compute_hamming_distance(
                    &self.fsm,
                    &t.from_state,
                    &t.to_state,
                );

                if let Some(custom) = self.custom_probabilities.get(&t.from_state.0) {
                    if let Some(cp) = custom.get(&t.to_state.0) {
                        result.push(TransitionProbability {
                            from_state: t.from_state.0.clone(),
                            to_state: t.to_state.0.clone(),
                            is_conditional: t.condition.is_some(),
                            probability: cp * state_prob,
                            bit_hamming_distance: hamming,
                        });
                        continue;
                    }
                }

                result.push(TransitionProbability {
                    from_state: t.from_state.0.clone(),
                    to_state: t.to_state.0.clone(),
                    is_conditional: t.condition.is_some(),
                    probability: trans_prob,
                    bit_hamming_distance: hamming,
                });
            }
        }

        result
    }

    fn compute_toggle_rates(&self, trans_probs: &[TransitionProbability]) -> HashMap<String, f64> {
        let clock_freq = self.fsm.clock_freq_mhz * 1e6;
        let mut toggle_counts: HashMap<String, f64> = HashMap::new();

        for tp in trans_probs {
            if tp.from_state != tp.to_state {
                let entry = toggle_counts.entry(tp.from_state.clone()).or_insert(0.0);
                *entry += tp.probability * clock_freq;
            }
        }

        for state in &self.fsm.states {
            toggle_counts.entry(state.name.0.clone()).or_insert(0.0);
        }

        toggle_counts
    }

    fn estimate_power(
        &self,
        _state_probs: &HashMap<String, f64>,
        _toggle_rates: &HashMap<String, f64>,
        trans_probs: &[TransitionProbability],
    ) -> PowerEstimate {
        let clock_freq = self.fsm.clock_freq_mhz * 1e6;
        let state_width = self.fsm.state_width();
        let num_states = self.fsm.num_states();

        let (cap_pf, static_mw) = self.fpga_power_params();

        let v_dd = 1.0;
        let cap_f = cap_pf * 1e-12;

        let clock_power = 0.5 * cap_f * 3.0 * v_dd * v_dd * clock_freq * 1e3;

        let avg_hamming: f64 = if trans_probs.is_empty() {
            0.0
        } else {
            let total_prob: f64 = trans_probs.iter().map(|t| t.probability).sum();
            if total_prob > 0.0 {
                trans_probs.iter()
                    .map(|t| t.bit_hamming_distance as f64 * t.probability)
                    .sum::<f64>() / total_prob
            } else {
                0.0
            }
        };

        let self_loop_prob: f64 = trans_probs.iter()
            .filter(|t| t.from_state == t.to_state)
            .map(|t| t.probability)
            .sum();

        let state_activity = 1.0 - self_loop_prob;
        let state_register_power = 0.5 * cap_f * state_width as f64 * avg_hamming * v_dd * v_dd * clock_freq * 1e3;

        let decoder_luts = match self.fsm.encoding {
            StateEncoding::OneHot => num_states,
            StateEncoding::Binary | StateEncoding::Gray | StateEncoding::User => {
                (state_width as f64 * 2.0).ceil() as usize
            }
        };
        let decoder_power = 0.5 * cap_f * decoder_luts as f64 * v_dd * v_dd * clock_freq * state_activity * 1e3;

        let output_width: u32 = self.fsm.signals.iter()
            .filter(|s| s.kind == SignalKind::Output)
            .map(|s| s.width)
            .sum();
        let output_power = 0.5 * cap_f * output_width as f64 * 0.5 * v_dd * v_dd * clock_freq * 1e3;

        let reg_width: u32 = self.fsm.signals.iter()
            .filter(|s| s.kind == SignalKind::Register)
            .map(|s| s.width)
            .sum();
        let reg_power = 0.5 * cap_f * reg_width as f64 * 0.3 * v_dd * v_dd * clock_freq * 1e3;

        let combinational_power = decoder_power + reg_power;

        let total_dynamic = clock_power + state_register_power + combinational_power + output_power;
        let total_power = total_dynamic + static_mw;

        PowerEstimate {
            clock_power_mw: clock_power,
            state_register_power_mw: state_register_power,
            combinational_power_mw: combinational_power,
            output_power_mw: output_power,
            total_dynamic_power_mw: total_dynamic,
            static_power_mw: static_mw,
            total_power_mw: total_power,
        }
    }

    fn fpga_power_params(&self) -> (f64, f64) {
        match self.target {
            FpgaFamily::Xilinx7Series => (0.85, 50.0),
            FpgaFamily::XilinxUltraScale => (0.60, 65.0),
            FpgaFamily::XilinxUltraScalePlus => (0.40, 45.0),
            FpgaFamily::IntelCyclone10 => (1.00, 40.0),
            FpgaFamily::IntelStratix10 => (0.50, 60.0),
            FpgaFamily::IntelAgilex => (0.35, 40.0),
            FpgaFamily::Generic => (0.70, 50.0),
        }
    }

    fn generate_suggestions(
        &self,
        state_probs: &HashMap<String, f64>,
        trans_probs: &[TransitionProbability],
        toggle_rates: &HashMap<String, f64>,
        power: &PowerEstimate,
    ) -> Vec<PowerSuggestion> {
        let mut suggestions = Vec::new();

        if self.fsm.encoding != StateEncoding::Gray {
            let avg_hamming: f64 = trans_probs.iter()
                .filter(|t| t.from_state != t.to_state)
                .map(|t| t.bit_hamming_distance as f64)
                .sum::<f64>() / trans_probs.iter().filter(|t| t.from_state != t.to_state).count().max(1) as f64;

            let state_width = self.fsm.state_width();
            let hamming_ratio = if state_width > 0 { avg_hamming / state_width as f64 } else { 0.0 };

            if hamming_ratio > 0.5 {
                let saving = power.state_register_power_mw * (hamming_ratio - 0.3).min(0.5);
                suggestions.push(PowerSuggestion {
                    category: SuggestionCategory::Encoding,
                    severity: SuggestionSeverity::High,
                    title: "Use Gray code encoding to reduce state register toggling".into(),
                    description: format!(
                        "Current encoding has {:.0}% bit toggle rate on state transitions (avg {:.1}/{} bits). \
                         Gray code ensures only 1 bit toggles per transition, potentially saving {:.1} mW on state registers.",
                        hamming_ratio * 100.0, avg_hamming, state_width, saving
                    ),
                    estimated_saving_mw: saving,
                });
            }
        }

        let self_loop_ratio: f64 = trans_probs.iter()
            .filter(|t| t.from_state == t.to_state)
            .map(|t| t.probability)
            .sum();
        if self_loop_ratio > 0.5 {
            let saving = power.total_dynamic_power_mw * (self_loop_ratio - 0.3).min(0.4) * 0.5;
            suggestions.push(PowerSuggestion {
                category: SuggestionCategory::ClockGating,
                severity: if self_loop_ratio > 0.7 { SuggestionSeverity::High } else { SuggestionSeverity::Medium },
                title: "Add clock gating for self-looping states".into(),
                description: format!(
                    "{:.0}% of transitions are self-loops (state stays unchanged). \
                     Clock gating can disable register updates during self-loops, \
                     potentially saving {:.1} mW of dynamic power.",
                    self_loop_ratio * 100.0, saving
                ),
                estimated_saving_mw: saving,
            });
        }

        let high_toggle_states: Vec<(&String, &f64)> = toggle_rates.iter()
            .filter(|(_, rate)| **rate > self.fsm.clock_freq_mhz * 1e6 * 0.3)
            .collect();
        if !high_toggle_states.is_empty() {
            let state_names: Vec<&str> = high_toggle_states.iter().map(|(s, _)| s.as_str()).collect();
            suggestions.push(PowerSuggestion {
                category: SuggestionCategory::TransitionOptimization,
                severity: SuggestionSeverity::Medium,
                title: "Consider merging high-activity states".into(),
                description: format!(
                    "States {} have high toggle rates (>30% of clock frequency). \
                     Merging these with their frequent transition targets could reduce \
                     state register switching activity.",
                    state_names.join(", ")
                ),
                estimated_saving_mw: power.state_register_power_mw * 0.15,
            });
        }

        if self.fsm.num_states() > 16 && self.fsm.encoding == StateEncoding::Binary {
            let saving = power.combinational_power_mw * 0.2;
            suggestions.push(PowerSuggestion {
                category: SuggestionCategory::Encoding,
                severity: SuggestionSeverity::Medium,
                title: "Consider one-hot encoding for large state machines".into(),
                description: format!(
                    "This FSM has {} states with binary encoding, requiring a {}-bit wide state register \
                     and a complex decoder. One-hot encoding distributes the decoder logic, \
                     potentially reducing combinational power by {:.1} mW.",
                    self.fsm.num_states(),
                    self.fsm.state_width(),
                    saving,
                ),
                estimated_saving_mw: saving,
            });
        }

        if self.fsm.clock_freq_mhz > 200.0 {
            let saving = power.clock_power_mw * 0.3;
            suggestions.push(PowerSuggestion {
                category: SuggestionCategory::ClockGating,
                severity: SuggestionSeverity::High,
                title: "Consider clock gating at module level".into(),
                description: format!(
                    "High clock frequency ({} MHz) contributes {:.1} mW of clock tree power. \
                     If the FSM has idle periods, module-level clock gating can reduce \
                     clock power by up to 30% ({:.1} mW).",
                    self.fsm.clock_freq_mhz, power.clock_power_mw, saving
                ),
                estimated_saving_mw: saving,
            });
        }

        let total_reg_width: u32 = self.fsm.signals.iter()
            .filter(|s| s.kind == SignalKind::Register)
            .map(|s| s.width)
            .sum();
        if total_reg_width > 32 {
            let saving = power.combinational_power_mw * 0.1;
            suggestions.push(PowerSuggestion {
                category: SuggestionCategory::SignalOptimization,
                severity: SuggestionSeverity::Low,
                title: "Reduce register width where possible".into(),
                description: format!(
                    "Total internal register width is {} bits. Review if all bits are necessary; \
                     each unused bit still consumes switching power. \
                     Potential saving: {:.1} mW.",
                    total_reg_width, saving
                ),
                estimated_saving_mw: saving,
            });
        }

        let idle_prob: f64 = state_probs.values().sum::<f64>()
            - state_probs.iter()
                .filter(|(k, _)| {
                    let is_initial = self.fsm.initial_state()
                        .map(|s| s.name.0 == **k)
                        .unwrap_or(false);
                    !is_initial
                })
                .map(|(_, v)| *v)
                .sum::<f64>();
        if idle_prob < 0.05 {
            suggestions.push(PowerSuggestion {
                category: SuggestionCategory::StateMinimization,
                severity: SuggestionSeverity::Low,
                title: "Consider adding an idle/off state".into(),
                description: "The FSM spends very little time in the initial state. Adding a dedicated \
                     low-power idle state with minimal register updates could reduce power during inactive periods.".into(),
                estimated_saving_mw: power.total_dynamic_power_mw * 0.05,
            });
        }

        let total_saving: f64 = suggestions.iter().map(|s| s.estimated_saving_mw).sum();
        if power.total_power_mw > 0.0 && total_saving / power.total_power_mw > 0.2 {
            suggestions.push(PowerSuggestion {
                category: SuggestionCategory::PipelineReduction,
                severity: SuggestionSeverity::Low,
                title: "Consider lowering clock frequency if timing permits".into(),
                description: format!(
                    "Dynamic power scales linearly with clock frequency. If the design \
                     can meet timing at a lower frequency, power savings could be significant. \
                     Current: {:.1} mW at {} MHz.",
                    power.total_dynamic_power_mw, self.fsm.clock_freq_mhz
                ),
                estimated_saving_mw: 0.0,
            });
        }

        suggestions.sort_by(|a, b| {
            let sev_order = |s: &SuggestionSeverity| match s {
                SuggestionSeverity::High => 0,
                SuggestionSeverity::Medium => 1,
                SuggestionSeverity::Low => 2,
            };
            sev_order(&a.severity).cmp(&sev_order(&b.severity))
                .then_with(|| b.estimated_saving_mw.partial_cmp(&a.estimated_saving_mw).unwrap_or(std::cmp::Ordering::Equal))
        });

        suggestions
    }
}

fn compute_hamming_distance(fsm: &FsmDecl, from: &Ident, to: &Ident) -> u32 {
    let from_idx = fsm.state_index(from);
    let to_idx = fsm.state_index(to);

    match (from_idx, to_idx) {
        (Some(fi), Some(ti)) => {
            let from_code = encode_state(fsm, fi);
            let to_code = encode_state(fsm, ti);
            (from_code ^ to_code).count_ones()
        }
        _ => 0,
    }
}

fn encode_state(fsm: &FsmDecl, idx: usize) -> u64 {
    match fsm.encoding {
        StateEncoding::Binary => idx as u64,
        StateEncoding::Gray => {
            let binary = idx as u64;
            binary ^ (binary >> 1)
        }
        StateEncoding::OneHot => 1u64 << idx,
        StateEncoding::User => {
            fsm.states.get(idx).and_then(|s| s.encoding).unwrap_or(idx as u64)
        }
    }
}

pub fn generate_markdown_report(analysis: &PowerAnalysis) -> String {
    let mut md = String::new();

    md.push_str(&format!("# Power Analysis Report: {}\n\n", analysis.fsm_name));

    md.push_str("## Configuration\n\n");
    md.push_str(&format!("| Parameter | Value |\n"));
    md.push_str(&format!("|---|---|\n"));
    md.push_str(&format!("| Clock Frequency | {} MHz |\n", analysis.clock_freq_mhz));
    md.push_str(&format!("| Target FPGA | {:?} |\n", analysis.target));
    md.push_str(&format!("| State Encoding | {:?} |\n", analysis.encoding));
    md.push_str(&format!("| State Width | {} bits |\n", analysis.state_probabilities.len().max(1).next_power_of_two().trailing_zeros()));
    md.push_str("\n");

    md.push_str("## Power Estimate\n\n");
    md.push_str("| Component | Power (mW) | Percentage |\n");
    md.push_str("|---|---|---|\n");

    let total = analysis.estimated_power_mw.total_power_mw;
    let pct = |v: f64| if total > 0.0 { format!("{:.1}%", v / total * 100.0) } else { "N/A".into() };

    md.push_str(&format!("| Clock Tree | {:.3} | {} |\n",
        analysis.estimated_power_mw.clock_power_mw,
        pct(analysis.estimated_power_mw.clock_power_mw)));
    md.push_str(&format!("| State Registers | {:.3} | {} |\n",
        analysis.estimated_power_mw.state_register_power_mw,
        pct(analysis.estimated_power_mw.state_register_power_mw)));
    md.push_str(&format!("| Combinational Logic | {:.3} | {} |\n",
        analysis.estimated_power_mw.combinational_power_mw,
        pct(analysis.estimated_power_mw.combinational_power_mw)));
    md.push_str(&format!("| Output Drivers | {:.3} | {} |\n",
        analysis.estimated_power_mw.output_power_mw,
        pct(analysis.estimated_power_mw.output_power_mw)));
    md.push_str(&format!("| **Total Dynamic** | **{:.3}** | **{}** |\n",
        analysis.estimated_power_mw.total_dynamic_power_mw,
        pct(analysis.estimated_power_mw.total_dynamic_power_mw)));
    md.push_str(&format!("| Static (Leakage) | {:.3} | {} |\n",
        analysis.estimated_power_mw.static_power_mw,
        pct(analysis.estimated_power_mw.static_power_mw)));
    md.push_str(&format!("| **Total** | **{:.3}** | **100%** |\n",
        analysis.estimated_power_mw.total_power_mw));
    md.push_str("\n");

    md.push_str("## State Probability Distribution\n\n");
    md.push_str("| State | Probability | Toggle Rate (MHz) |\n");
    md.push_str("|---|---|---|\n");

    let mut sorted_states: Vec<_> = analysis.state_probabilities.iter().collect();
    sorted_states.sort_by(|a, b| b.1.partial_cmp(a.1).unwrap_or(std::cmp::Ordering::Equal));

    for (state, prob) in &sorted_states {
        let toggle_mhz = analysis.state_toggle_rates.get(*state)
            .map(|r| *r / 1e6)
            .unwrap_or(0.0);
        md.push_str(&format!("| {} | {:.4} | {:.2} |\n", state, prob, toggle_mhz));
    }
    md.push_str("\n");

    md.push_str("## Transition Analysis\n\n");
    md.push_str("| From | To | Type | Probability | Hamming Dist. |\n");
    md.push_str("|---|---|---|---|---|\n");

    let mut sorted_trans = analysis.transition_probabilities.clone();
    sorted_trans.sort_by(|a, b| b.probability.partial_cmp(&a.probability).unwrap_or(std::cmp::Ordering::Equal));

    for tp in &sorted_trans {
        let trans_type = if tp.is_conditional { "conditional" } else { "default" };
        md.push_str(&format!(
            "| {} | {} | {} | {:.6} | {} |\n",
            tp.from_state, tp.to_state, trans_type, tp.probability, tp.bit_hamming_distance
        ));
    }
    md.push_str("\n");

    if !analysis.suggestions.is_empty() {
        md.push_str("## Optimization Suggestions\n\n");

        let total_saving: f64 = analysis.suggestions.iter().map(|s| s.estimated_saving_mw).sum();

        for (i, s) in analysis.suggestions.iter().enumerate() {
            let severity_icon = match s.severity {
                SuggestionSeverity::High => "🔴",
                SuggestionSeverity::Medium => "🟡",
                SuggestionSeverity::Low => "🟢",
            };
            let category_str = match s.category {
                SuggestionCategory::Encoding => "Encoding",
                SuggestionCategory::ClockGating => "Clock Gating",
                SuggestionCategory::StateMinimization => "State Minimization",
                SuggestionCategory::PipelineReduction => "Pipeline/Frequency",
                SuggestionCategory::TransitionOptimization => "Transition Optimization",
                SuggestionCategory::SignalOptimization => "Signal Optimization",
            };

            md.push_str(&format!("### {} {}. {}\n\n", severity_icon, i + 1, s.title));
            md.push_str(&format!("- **Category**: {}\n", category_str));
            md.push_str(&format!("- **Severity**: {:?}\n", s.severity));
            if s.estimated_saving_mw > 0.0 {
                md.push_str(&format!("- **Estimated Saving**: {:.3} mW ({:.1}% of total)\n",
                    s.estimated_saving_mw,
                    if analysis.estimated_power_mw.total_power_mw > 0.0 {
                        s.estimated_saving_mw / analysis.estimated_power_mw.total_power_mw * 100.0
                    } else { 0.0 }
                ));
            }
            md.push_str(&format!("\n{}\n\n", s.description));
        }

        if total_saving > 0.0 {
            md.push_str(&format!(
                "### Summary\n\n\
                 If all suggestions are applied, estimated total saving: **{:.3} mW** ({:.1}% of total power).\n",
                total_saving,
                if analysis.estimated_power_mw.total_power_mw > 0.0 {
                    total_saving / analysis.estimated_power_mw.total_power_mw * 100.0
                } else { 0.0 }
            ));
        }
    }

    md.push_str("\n---\n");
    md.push_str(&format!("*Generated by fsm2v power analyzer*\n"));

    md
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_simple_fsm() -> FsmDecl {
        FsmDecl {
            name: Ident("test_fsm".into()),
            clock_freq_mhz: 100.0,
            reset_kind: ResetKind::Sync,
            encoding: StateEncoding::Binary,
            states: vec![
                StateDecl { name: Ident("IDLE".into()), is_initial: true, encoding: None },
                StateDecl { name: Ident("RUN".into()), is_initial: false, encoding: None },
                StateDecl { name: Ident("DONE".into()), is_initial: false, encoding: None },
            ],
            transitions: vec![
                Transition {
                    from_state: Ident("IDLE".into()),
                    condition: Some(Expr::Var(Ident("start".into()))),
                    to_state: Ident("RUN".into()),
                    actions: vec![Action::Assign { target: Ident("counter".into()), value: Expr::Literal(0) }],
                },
                Transition {
                    from_state: Ident("IDLE".into()),
                    condition: None,
                    to_state: Ident("IDLE".into()),
                    actions: vec![],
                },
                Transition {
                    from_state: Ident("RUN".into()),
                    condition: Some(Expr::BinOp(BinOp::Ge, Box::new(Expr::Var(Ident("counter".into()))), Box::new(Expr::Literal(100)))),
                    to_state: Ident("DONE".into()),
                    actions: vec![Action::Output { signal: Ident("done".into()), value: Expr::Literal(1) }],
                },
                Transition {
                    from_state: Ident("RUN".into()),
                    condition: None,
                    to_state: Ident("RUN".into()),
                    actions: vec![Action::Assign { target: Ident("counter".into()), value: Expr::BinOp(BinOp::Add, Box::new(Expr::Var(Ident("counter".into()))), Box::new(Expr::Literal(1))) }],
                },
                Transition {
                    from_state: Ident("DONE".into()),
                    condition: None,
                    to_state: Ident("IDLE".into()),
                    actions: vec![],
                },
            ],
            signals: vec![
                SignalDecl { name: Ident("start".into()), width: 1, kind: SignalKind::Input },
                SignalDecl { name: Ident("done".into()), width: 1, kind: SignalKind::Output },
                SignalDecl { name: Ident("counter".into()), width: 8, kind: SignalKind::Register },
            ],
            parameters: vec![],
        }
    }

    #[test]
    fn test_power_analysis_basic() {
        let fsm = make_simple_fsm();
        let analyzer = PowerAnalyzer::new(fsm, FpgaFamily::Xilinx7Series);
        let result = analyzer.analyze();

        assert!(result.estimated_power_mw.total_power_mw > 0.0);
        assert!(result.estimated_power_mw.total_dynamic_power_mw > 0.0);
        assert!(result.estimated_power_mw.static_power_mw > 0.0);
        assert!(!result.state_probabilities.is_empty());
        assert!(!result.transition_probabilities.is_empty());
    }

    #[test]
    fn test_state_probabilities_sum_to_one() {
        let fsm = make_simple_fsm();
        let analyzer = PowerAnalyzer::new(fsm, FpgaFamily::Xilinx7Series);
        let result = analyzer.analyze();

        let sum: f64 = result.state_probabilities.values().sum();
        assert!((sum - 1.0).abs() < 0.01, "probabilities should sum to ~1.0, got {}", sum);
    }

    #[test]
    fn test_hamming_distance_binary() {
        let fsm = make_simple_fsm();
        let hd = compute_hamming_distance(&fsm, &Ident("IDLE".into()), &Ident("RUN".into()));
        assert!(hd > 0, "hamming distance between different states should be > 0");
    }

    #[test]
    fn test_gray_encoding_low_hamming() {
        let mut fsm = make_simple_fsm();
        fsm.encoding = StateEncoding::Gray;

        let hd_01 = compute_hamming_distance(&fsm, &Ident("IDLE".into()), &Ident("RUN".into()));
        assert_eq!(hd_01, 1, "Gray code adjacent states should have hamming distance 1");
    }

    #[test]
    fn test_markdown_report_generation() {
        let fsm = make_simple_fsm();
        let analyzer = PowerAnalyzer::new(fsm, FpgaFamily::Xilinx7Series);
        let result = analyzer.analyze();
        let report = generate_markdown_report(&result);

        assert!(report.contains("# Power Analysis Report"));
        assert!(report.contains("## Power Estimate"));
        assert!(report.contains("## State Probability Distribution"));
        assert!(report.contains("## Transition Analysis"));
        assert!(report.contains("mW"));
    }

    #[test]
    fn test_suggestions_generated() {
        let fsm = make_simple_fsm();
        let analyzer = PowerAnalyzer::new(fsm, FpgaFamily::Xilinx7Series);
        let result = analyzer.analyze();
        assert!(!result.suggestions.is_empty(), "should generate at least some suggestions");
    }

    #[test]
    fn test_custom_probabilities() {
        let fsm = make_simple_fsm();
        let mut probs = HashMap::new();
        let mut inner = HashMap::new();
        inner.insert("RUN".into(), 0.9);
        inner.insert("IDLE".into(), 0.1);
        probs.insert("IDLE".into(), inner);

        let analyzer = PowerAnalyzer::new(fsm, FpgaFamily::Xilinx7Series).with_probabilities(probs);
        let result = analyzer.analyze();
        assert!(result.estimated_power_mw.total_power_mw > 0.0);
    }
}
