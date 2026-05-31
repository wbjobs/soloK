use crate::fsm_dsl::ast::*;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct TransitionTable {
    pub entries: Vec<TransitionEntry>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct TransitionEntry {
    pub from_state: String,
    pub to_state: String,
    pub condition: Option<Expr>,
    pub actions: Vec<Action>,
    pub is_default: bool,
}

pub struct Optimizer {
    fsm: FsmDecl,
}

impl Optimizer {
    pub fn new(fsm: FsmDecl) -> Self {
        Optimizer { fsm }
    }

    pub fn optimize(self) -> FsmDecl {
        let fsm = Self::merge_dont_care_transitions(self.fsm);
        let fsm = Self::minimize_states(fsm);
        let fsm = Self::add_default_transitions(fsm);
        fsm
    }

    fn merge_dont_care_transitions(mut fsm: FsmDecl) -> FsmDecl {
        let mut merged: Vec<Transition> = Vec::new();
        let mut processed: Vec<bool> = vec![false; fsm.transitions.len()];

        for i in 0..fsm.transitions.len() {
            if processed[i] {
                continue;
            }
            let mut current = fsm.transitions[i].clone();
            processed[i] = true;

            for j in (i + 1)..fsm.transitions.len() {
                if processed[j] {
                    continue;
                }
                let other = &fsm.transitions[j];
                if current.from_state == other.from_state
                    && current.to_state == other.to_state
                    && current.actions == other.actions
                    && current.condition.is_some()
                    && other.condition.is_some()
                {
                    processed[j] = true;
                    current.condition = match (current.condition.take(), other.condition.clone()) {
                        (Some(a), Some(b)) => Some(Expr::BinOp(BinOp::LogicOr, Box::new(a), Box::new(b))),
                        (Some(a), None) | (None, Some(a)) => Some(a),
                        (None, None) => None,
                    };
                }
            }
            merged.push(current);
        }

        fsm.transitions = merged;
        fsm
    }

    fn minimize_states(mut fsm: FsmDecl) -> FsmDecl {
        let n = fsm.states.len();
        if n <= 1 {
            return fsm;
        }

        let mut partition: Vec<usize> = (0..n).collect();

        let mut output_signature: Vec<u64> = Vec::with_capacity(n);
        for i in 0..n {
            output_signature.push(compute_state_signature(&fsm, &fsm.states[i].name));
        }

        for i in 0..n {
            for j in (i + 1)..n {
                if output_signature[i] != output_signature[j] {
                    partition[j] = j;
                } else {
                    partition[j] = i;
                }
            }
        }
        partition[0] = 0;

        loop {
            let mut new_partition = partition.clone();

            for i in 0..n {
                if partition[i] != i {
                    continue;
                }
                for j in (i + 1)..n {
                    if partition[j] != i {
                        continue;
                    }

                    if !states_transition_equivalent(&fsm, &fsm.states[i].name, &fsm.states[j].name, &partition) {
                        new_partition[j] = j;
                    }
                }
            }

            let mut changed = false;
            for i in 0..n {
                if new_partition[i] != partition[i] {
                    changed = true;
                    break;
                }
            }

            partition = new_partition;

            if !changed {
                break;
            }
        }

        let mut representative: Vec<usize> = (0..n).collect();
        for i in 0..n {
            representative[i] = find_representative(&partition, i);
        }

        let mut removed: Vec<bool> = vec![false; n];
        for i in 0..n {
            if representative[i] != i {
                removed[i] = true;
            }
        }

        let mut new_states: Vec<StateDecl> = Vec::new();
        let mut name_map: HashMap<String, String> = HashMap::new();

        for i in 0..n {
            if !removed[i] {
                new_states.push(fsm.states[i].clone());
            } else {
                let rep = representative[i];
                name_map.insert(
                    fsm.states[i].name.0.clone(),
                    fsm.states[rep].name.0.clone(),
                );
            }
        }

        fsm.states = new_states;

        for t in &mut fsm.transitions {
            if let Some(new_name) = name_map.get(&t.from_state.0) {
                t.from_state = Ident(new_name.clone());
            }
            if let Some(new_name) = name_map.get(&t.to_state.0) {
                t.to_state = Ident(new_name.clone());
            }
        }

        let mut dedup_set: HashSet<(String, String, Option<String>)> = HashSet::new();
        fsm.transitions.retain(|t| {
            let cond_key = t.condition.as_ref().map(|e| format!("{:?}", e));
            let key = (t.from_state.0.clone(), t.to_state.0.clone(), cond_key);
            dedup_set.insert(key)
        });

        fsm
    }

    fn add_default_transitions(mut fsm: FsmDecl) -> FsmDecl {
        let states_with_default: HashSet<String> = fsm
            .transitions
            .iter()
            .filter(|t| t.condition.is_none())
            .map(|t| t.from_state.0.clone())
            .collect();

        let _initial = match fsm.initial_state() {
            Some(s) => s.name.0.clone(),
            None => return fsm,
        };

        for state in &fsm.states {
            if !states_with_default.contains(&state.name.0) {
                let has_cond_transitions = fsm
                    .transitions
                    .iter()
                    .any(|t| t.from_state == state.name && t.condition.is_some());

                if has_cond_transitions {
                    let self_loop = fsm.transitions.iter().any(|t| {
                        t.from_state == state.name
                            && t.to_state == state.name
                            && t.condition.is_none()
                    });

                    if !self_loop {
                        fsm.transitions.push(Transition {
                            from_state: state.name.clone(),
                            condition: None,
                            to_state: Ident(state.name.0.clone()),
                            actions: vec![],
                        });
                    }
                }
            }
        }

        fsm
    }
}

fn find_representative(partition: &[usize], i: usize) -> usize {
    let mut current = i;
    loop {
        if partition[current] == current {
            return current;
        }
        current = partition[current];
    }
}

fn compute_state_signature(fsm: &FsmDecl, state_name: &Ident) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();

    let mut trans: Vec<&Transition> = fsm.transitions.iter()
        .filter(|t| t.from_state == *state_name)
        .collect();
    trans.sort_by(|a, b| {
        let a_cond = a.condition.as_ref().map(|e| format!("{:?}", e)).unwrap_or_default();
        let b_cond = b.condition.as_ref().map(|e| format!("{:?}", e)).unwrap_or_default();
        a_cond.cmp(&b_cond).then_with(|| a.to_state.0.cmp(&b.to_state.0))
    });

    for t in &trans {
        t.to_state.0.hash(&mut hasher);
        let has_cond = t.condition.is_some();
        has_cond.hash(&mut hasher);
        for a in &t.actions {
            format!("{:?}", a).hash(&mut hasher);
        }
    }

    hasher.finish()
}

fn states_transition_equivalent(
    fsm: &FsmDecl,
    state_a: &Ident,
    state_b: &Ident,
    partition: &[usize],
) -> bool {
    let trans_a: Vec<&Transition> = fsm.transitions.iter()
        .filter(|t| t.from_state == *state_a)
        .collect();
    let trans_b: Vec<&Transition> = fsm.transitions.iter()
        .filter(|t| t.from_state == *state_b)
        .collect();

    if trans_a.len() != trans_b.len() {
        return false;
    }

    let mut sorted_a: Vec<&Transition> = trans_a;
    let mut sorted_b: Vec<&Transition> = trans_b;
    sorted_a.sort_by(|a, b| {
        let a_cond = a.condition.as_ref().map(|e| format!("{:?}", e)).unwrap_or_default();
        let b_cond = b.condition.as_ref().map(|e| format!("{:?}", e)).unwrap_or_default();
        a_cond.cmp(&b_cond).then_with(|| a.to_state.0.cmp(&b.to_state.0))
    });
    sorted_b.sort_by(|a, b| {
        let a_cond = a.condition.as_ref().map(|e| format!("{:?}", e)).unwrap_or_default();
        let b_cond = b.condition.as_ref().map(|e| format!("{:?}", e)).unwrap_or_default();
        a_cond.cmp(&b_cond).then_with(|| a.to_state.0.cmp(&b.to_state.0))
    });

    for (ta, tb) in sorted_a.iter().zip(sorted_b.iter()) {
        let a_idx = fsm.state_index(&ta.to_state);
        let b_idx = fsm.state_index(&tb.to_state);
        match (a_idx, b_idx) {
            (Some(ai), Some(bi)) => {
                let rep_a = find_representative(partition, ai);
                let rep_b = find_representative(partition, bi);
                if rep_a != rep_b {
                    return false;
                }
            }
            _ => return false,
        }

        if ta.condition.is_some() != tb.condition.is_some() {
            return false;
        }

        if ta.actions != tb.actions {
            return false;
        }
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_large_fsm(num_states: usize) -> FsmDecl {
        let mut states = Vec::new();
        let mut transitions = Vec::new();

        for i in 0..num_states {
            states.push(StateDecl {
                name: Ident(format!("S{}", i)),
                is_initial: i == 0,
                encoding: None,
            });
        }

        for i in 0..num_states {
            let next = (i + 1) % num_states;
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
    fn test_merge_dont_care() {
        let fsm = FsmDecl {
            name: Ident("test".into()),
            clock_freq_mhz: 100.0,
            reset_kind: ResetKind::Sync,
            encoding: StateEncoding::Binary,
            states: vec![
                StateDecl { name: Ident("A".into()), is_initial: true, encoding: None },
                StateDecl { name: Ident("B".into()), is_initial: false, encoding: None },
            ],
            transitions: vec![
                Transition {
                    from_state: Ident("A".into()),
                    condition: Some(Expr::Var(Ident("x".into()))),
                    to_state: Ident("B".into()),
                    actions: vec![Action::Assign { target: Ident("y".into()), value: Expr::Literal(1) }],
                },
                Transition {
                    from_state: Ident("A".into()),
                    condition: Some(Expr::Var(Ident("z".into()))),
                    to_state: Ident("B".into()),
                    actions: vec![Action::Assign { target: Ident("y".into()), value: Expr::Literal(1) }],
                },
            ],
            signals: vec![],
            parameters: vec![],
        };

        let opt = Optimizer::new(fsm);
        let result = opt.optimize();
        assert!(result.transitions.len() <= 2);
    }

    #[test]
    fn test_60_states_no_dead_loop() {
        let fsm = make_large_fsm(60);
        let opt = Optimizer::new(fsm.clone());
        let result = opt.optimize();

        for state in &result.states {
            let trans_from: Vec<&Transition> = result.transitions.iter()
                .filter(|t| t.from_state == state.name)
                .collect();

            let has_default = trans_from.iter().any(|t| t.condition.is_none());
            if !trans_from.is_empty() {
                assert!(has_default, "state {} has transitions but no default (dead loop risk)", state.name.0);
            }
        }
    }

    #[test]
    fn test_60_states_transition_targets_valid() {
        let fsm = make_large_fsm(60);
        let opt = Optimizer::new(fsm);
        let result = opt.optimize();

        let state_names: HashSet<String> = result.states.iter().map(|s| s.name.0.clone()).collect();
        for t in &result.transitions {
            assert!(state_names.contains(&t.from_state.0),
                "transition from nonexistent state {}", t.from_state.0);
            assert!(state_names.contains(&t.to_state.0),
                "transition to nonexistent state {}", t.to_state.0);
        }
    }

    #[test]
    fn test_minimization_preserves_distinct_states() {
        let fsm = FsmDecl {
            name: Ident("test".into()),
            clock_freq_mhz: 100.0,
            reset_kind: ResetKind::Sync,
            encoding: StateEncoding::Binary,
            states: vec![
                StateDecl { name: Ident("A".into()), is_initial: true, encoding: None },
                StateDecl { name: Ident("B".into()), is_initial: false, encoding: None },
            ],
            transitions: vec![
                Transition {
                    from_state: Ident("A".into()),
                    condition: Some(Expr::Var(Ident("x".into()))),
                    to_state: Ident("B".into()),
                    actions: vec![Action::Assign { target: Ident("y".into()), value: Expr::Literal(1) }],
                },
                Transition {
                    from_state: Ident("A".into()),
                    condition: None,
                    to_state: Ident("A".into()),
                    actions: vec![],
                },
                Transition {
                    from_state: Ident("B".into()),
                    condition: Some(Expr::Var(Ident("x".into()))),
                    to_state: Ident("A".into()),
                    actions: vec![Action::Assign { target: Ident("y".into()), value: Expr::Literal(0) }],
                },
                Transition {
                    from_state: Ident("B".into()),
                    condition: None,
                    to_state: Ident("B".into()),
                    actions: vec![],
                },
            ],
            signals: vec![],
            parameters: vec![],
        };

        let opt = Optimizer::new(fsm);
        let result = opt.optimize();
        assert_eq!(result.states.len(), 2, "A and B have different actions and should NOT be merged");
    }
}
