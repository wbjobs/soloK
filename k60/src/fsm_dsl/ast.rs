use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Ident(pub String);

impl fmt::Display for Ident {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Expr {
    Literal(u64),
    Var(Ident),
    BinOp(BinOp, Box<Expr>, Box<Expr>),
    UnaryOp(UnaryOp, Box<Expr>),
    Ternary(Box<Expr>, Box<Expr>, Box<Expr>),
    Concat(Vec<Expr>),
    BitSlice(Box<Expr>, u32, u32),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BinOp {
    Add,
    Sub,
    Mul,
    And,
    Or,
    Xor,
    Shl,
    Shr,
    Eq,
    Ne,
    Lt,
    Le,
    Gt,
    Ge,
    LogicAnd,
    LogicOr,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UnaryOp {
    Not,
    Neg,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Transition {
    pub from_state: Ident,
    pub condition: Option<Expr>,
    pub to_state: Ident,
    pub actions: Vec<Action>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Action {
    Assign { target: Ident, value: Expr },
    Output { signal: Ident, value: Expr },
}

#[derive(Debug, Clone, PartialEq)]
pub struct StateDecl {
    pub name: Ident,
    pub is_initial: bool,
    pub encoding: Option<u64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SignalDecl {
    pub name: Ident,
    pub width: u32,
    pub kind: SignalKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SignalKind {
    Input,
    Output,
    Register,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FsmDecl {
    pub name: Ident,
    pub clock_freq_mhz: f64,
    pub reset_kind: ResetKind,
    pub encoding: StateEncoding,
    pub states: Vec<StateDecl>,
    pub transitions: Vec<Transition>,
    pub signals: Vec<SignalDecl>,
    pub parameters: Vec<ParamDecl>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResetKind {
    Sync,
    Async,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StateEncoding {
    Binary,
    OneHot,
    Gray,
    User,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ParamDecl {
    pub name: Ident,
    pub width: u32,
    pub default_value: Option<u64>,
}

impl FsmDecl {
    pub fn initial_state(&self) -> Option<&StateDecl> {
        self.states.iter().find(|s| s.is_initial)
    }

    pub fn state_index(&self, name: &Ident) -> Option<usize> {
        self.states.iter().position(|s| s.name == *name)
    }

    pub fn num_states(&self) -> usize {
        self.states.len()
    }

    pub fn state_width(&self) -> u32 {
        let n = self.num_states();
        if n <= 1 {
            return 1;
        }
        (n as f64).log2().ceil() as u32
    }
}
