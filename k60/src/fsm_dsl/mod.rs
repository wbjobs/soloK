pub mod ast;
mod lexer;

use ast::*;
use lexer::{Token, Lexer};

pub type ParseError = String;

pub fn parse(input: &str) -> Result<FsmDecl, ParseError> {
    let mut parser = Parser::new(input)?;
    parser.parse_fsm()
}

struct Parser {
    lexer: Lexer,
    current: Option<Token>,
}

impl Parser {
    fn new(input: &str) -> Result<Self, ParseError> {
        let mut lexer = Lexer::new(input);
        let current = lexer.next_token()?;
        Ok(Parser { lexer, current: Some(current) })
    }

    fn advance(&mut self) -> Result<Token, ParseError> {
        let prev = self.current.take();
        if prev.as_ref() == Some(&Token::Eof) {
            self.current = prev.clone();
            return prev.ok_or_else(|| "unexpected end of input".to_string());
        }
        let next = self.lexer.next_token()?;
        self.current = Some(next);
        prev.ok_or_else(|| "unexpected end of input".to_string())
    }

    fn peek(&self) -> Option<&Token> {
        self.current.as_ref().filter(|t| **t != Token::Eof)
    }

    fn expect(&mut self, expected: &Token) -> Result<(), ParseError> {
        match self.peek() {
            Some(t) if t == expected => {
                self.advance()?;
                Ok(())
            }
            Some(t) => Err(format!("expected {:?}, got {:?}", expected, t)),
            None => Err(format!("expected {:?}, got end of input", expected)),
        }
    }

    fn expect_ident(&mut self) -> Result<String, ParseError> {
        match self.peek() {
            Some(Token::Ident(s)) => {
                let val = s.clone();
                self.advance()?;
                Ok(val)
            }
            Some(t) => Err(format!("expected identifier, got {:?}", t)),
            None => Err("expected identifier, got end of input".to_string()),
        }
    }

    fn expect_literal(&mut self) -> Result<u64, ParseError> {
        match self.peek() {
            Some(Token::Number(n)) => {
                let val = *n;
                self.advance()?;
                Ok(val)
            }
            Some(t) => Err(format!("expected number, got {:?}", t)),
            None => Err("expected number, got end of input".to_string()),
        }
    }

    fn parse_fsm(&mut self) -> Result<FsmDecl, ParseError> {
        self.expect(&Token::Kw("fsm".into()))?;
        let name = self.expect_ident()?;

        let (clock_freq_mhz, reset_kind, encoding) = self.parse_fsm_params()?;

        self.expect(&Token::LBrace)?;
        let (states, transitions, signals, parameters) = self.parse_fsm_body()?;
        self.expect(&Token::RBrace)?;

        Ok(FsmDecl {
            name: Ident(name),
            clock_freq_mhz,
            reset_kind,
            encoding,
            states,
            transitions,
            signals,
            parameters,
        })
    }

    fn parse_fsm_params(&mut self) -> Result<(f64, ResetKind, StateEncoding), ParseError> {
        let mut freq = 100.0f64;
        let mut reset = ResetKind::Sync;
        let mut encoding = StateEncoding::Binary;

        loop {
            match self.peek() {
                Some(Token::Ident(key)) if key == "clock_freq" || key == "reset" || key == "encoding" => {
                    let k = key.clone();
                    self.advance()?;
                    self.expect(&Token::Eq)?;
                    match self.peek() {
                        Some(Token::Ident(v)) => {
                            let val = v.clone();
                            self.advance()?;
                            match k.as_str() {
                                "clock_freq" => freq = val.parse().unwrap_or(100.0),
                                "reset" => reset = if val == "async" { ResetKind::Async } else { ResetKind::Sync },
                                "encoding" => encoding = match val.as_str() {
                                    "onehot" => StateEncoding::OneHot,
                                    "gray" => StateEncoding::Gray,
                                    "user" => StateEncoding::User,
                                    _ => StateEncoding::Binary,
                                },
                                _ => {}
                            }
                        }
                        Some(Token::Number(n)) => {
                            let val = *n;
                            self.advance()?;
                            if k == "clock_freq" {
                                freq = val as f64;
                            }
                        }
                        Some(Token::Float(f)) => {
                            let val = *f;
                            self.advance()?;
                            if k == "clock_freq" {
                                freq = val;
                            }
                        }
                        t => return Err(format!("expected param value, got {:?}", t)),
                    }
                }
                _ => break,
            }
        }

        Ok((freq, reset, encoding))
    }

    fn parse_fsm_body(&mut self) -> Result<(Vec<StateDecl>, Vec<Transition>, Vec<SignalDecl>, Vec<ParamDecl>), ParseError> {
        let mut states = Vec::new();
        let mut transitions = Vec::new();
        let mut signals = Vec::new();
        let mut parameters = Vec::new();

        while self.peek() != Some(&Token::RBrace) && self.peek().is_some() {
            match self.peek() {
                Some(Token::Kw(ref k)) if k == "state" => {
                    states.push(self.parse_state_decl()?);
                }
                Some(Token::Kw(ref k)) if k == "input" || k == "output" || k == "reg" => {
                    signals.push(self.parse_signal_decl()?);
                }
                Some(Token::Kw(ref k)) if k == "param" => {
                    parameters.push(self.parse_param_decl()?);
                }
                Some(Token::Ident(_)) => {
                    transitions.push(self.parse_transition()?);
                }
                t => return Err(format!("unexpected token in FSM body: {:?}", t)),
            }
        }

        Ok((states, transitions, signals, parameters))
    }

    fn parse_state_decl(&mut self) -> Result<StateDecl, ParseError> {
        self.expect(&Token::Kw("state".into()))?;
        let name = self.expect_ident()?;

        let mut is_initial = false;
        let encoding = None;

        while self.peek() != Some(&Token::Semi) {
            match self.peek() {
                Some(Token::Kw(ref k)) if k == "initial" => {
                    is_initial = true;
                    self.advance()?;
                }
                Some(Token::Ident(ref k)) if k == "initial" => {
                    is_initial = true;
                    self.advance()?;
                }
                _ => break,
            }
        }
        self.expect(&Token::Semi)?;

        Ok(StateDecl { name: Ident(name), is_initial, encoding })
    }

    fn parse_signal_decl(&mut self) -> Result<SignalDecl, ParseError> {
        let kind = match self.peek() {
            Some(Token::Kw(ref k)) if k == "input" => SignalKind::Input,
            Some(Token::Kw(ref k)) if k == "output" => SignalKind::Output,
            Some(Token::Kw(ref k)) if k == "reg" => SignalKind::Register,
            t => return Err(format!("expected signal keyword, got {:?}", t)),
        };
        self.advance()?;

        let name = self.expect_ident()?;
        self.expect(&Token::Colon)?;
        let width = self.expect_literal()? as u32;
        self.expect(&Token::Semi)?;

        Ok(SignalDecl { name: Ident(name), width, kind })
    }

    fn parse_param_decl(&mut self) -> Result<ParamDecl, ParseError> {
        self.expect(&Token::Kw("param".into()))?;
        let name = self.expect_ident()?;
        self.expect(&Token::Colon)?;
        let width = self.expect_literal()? as u32;

        let default_value = if self.peek() == Some(&Token::Eq) {
            self.advance()?;
            Some(self.expect_literal()?)
        } else {
            None
        };

        self.expect(&Token::Semi)?;

        Ok(ParamDecl { name: Ident(name), width, default_value })
    }

    fn parse_transition(&mut self) -> Result<Transition, ParseError> {
        let from_state = self.expect_ident()?;
        self.expect(&Token::Arrow)?;
        let to_state = self.expect_ident()?;

        let condition = if self.peek() == Some(&Token::LBracket) {
            self.advance()?;
            let expr = self.parse_expr()?;
            self.expect(&Token::RBracket)?;
            Some(expr)
        } else {
            None
        };

        let actions = if self.peek() == Some(&Token::LBrace) {
            self.advance()?;
            let mut acts = Vec::new();
            while self.peek() != Some(&Token::RBrace) && self.peek().is_some() {
                acts.push(self.parse_action()?);
            }
            self.expect(&Token::RBrace)?;
            acts
        } else {
            vec![]
        };

        self.expect(&Token::Semi)?;

        Ok(Transition {
            from_state: Ident(from_state),
            condition,
            to_state: Ident(to_state),
            actions,
        })
    }

    fn parse_action(&mut self) -> Result<Action, ParseError> {
        if self.peek() == Some(&Token::Kw("output".into())) {
            self.advance()?;
            let signal = self.expect_ident()?;
            self.expect(&Token::Eq)?;
            let value = self.parse_expr()?;
            self.expect(&Token::Semi)?;
            Ok(Action::Output { signal: Ident(signal), value })
        } else {
            let target = self.expect_ident()?;
            self.expect(&Token::Eq)?;
            let value = self.parse_expr()?;
            self.expect(&Token::Semi)?;
            Ok(Action::Assign { target: Ident(target), value })
        }
    }

    fn parse_expr(&mut self) -> Result<Expr, ParseError> {
        self.parse_logic_or()
    }

    fn parse_logic_or(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_logic_and()?;
        while self.peek() == Some(&Token::LogicOr) {
            self.advance()?;
            let right = self.parse_logic_and()?;
            left = Expr::BinOp(BinOp::LogicOr, Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn parse_logic_and(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_equality()?;
        while self.peek() == Some(&Token::LogicAnd) {
            self.advance()?;
            let right = self.parse_equality()?;
            left = Expr::BinOp(BinOp::LogicAnd, Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn parse_equality(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_comparison()?;
        loop {
            match self.peek() {
                Some(Token::Eq) => {
                    self.advance()?;
                    let right = self.parse_comparison()?;
                    left = Expr::BinOp(BinOp::Eq, Box::new(left), Box::new(right));
                }
                Some(Token::Ne) => {
                    self.advance()?;
                    let right = self.parse_comparison()?;
                    left = Expr::BinOp(BinOp::Ne, Box::new(left), Box::new(right));
                }
                _ => break,
            }
        }
        Ok(left)
    }

    fn parse_comparison(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_bitwise_or()?;
        loop {
            match self.peek() {
                Some(Token::Lt) => {
                    self.advance()?;
                    let right = self.parse_bitwise_or()?;
                    left = Expr::BinOp(BinOp::Lt, Box::new(left), Box::new(right));
                }
                Some(Token::Le) => {
                    self.advance()?;
                    let right = self.parse_bitwise_or()?;
                    left = Expr::BinOp(BinOp::Le, Box::new(left), Box::new(right));
                }
                Some(Token::Gt) => {
                    self.advance()?;
                    let right = self.parse_bitwise_or()?;
                    left = Expr::BinOp(BinOp::Gt, Box::new(left), Box::new(right));
                }
                Some(Token::Ge) => {
                    self.advance()?;
                    let right = self.parse_bitwise_or()?;
                    left = Expr::BinOp(BinOp::Ge, Box::new(left), Box::new(right));
                }
                _ => break,
            }
        }
        Ok(left)
    }

    fn parse_bitwise_or(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_bitwise_xor()?;
        while self.peek() == Some(&Token::BitOr) {
            self.advance()?;
            let right = self.parse_bitwise_xor()?;
            left = Expr::BinOp(BinOp::Or, Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn parse_bitwise_xor(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_bitwise_and()?;
        while self.peek() == Some(&Token::Caret) {
            self.advance()?;
            let right = self.parse_bitwise_and()?;
            left = Expr::BinOp(BinOp::Xor, Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn parse_bitwise_and(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_shift()?;
        while self.peek() == Some(&Token::BitAnd) {
            self.advance()?;
            let right = self.parse_shift()?;
            left = Expr::BinOp(BinOp::And, Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn parse_shift(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_additive()?;
        loop {
            match self.peek() {
                Some(Token::Shl) => {
                    self.advance()?;
                    let right = self.parse_additive()?;
                    left = Expr::BinOp(BinOp::Shl, Box::new(left), Box::new(right));
                }
                Some(Token::Shr) => {
                    self.advance()?;
                    let right = self.parse_additive()?;
                    left = Expr::BinOp(BinOp::Shr, Box::new(left), Box::new(right));
                }
                _ => break,
            }
        }
        Ok(left)
    }

    fn parse_additive(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_multiplicative()?;
        loop {
            match self.peek() {
                Some(Token::Plus) => {
                    self.advance()?;
                    let right = self.parse_multiplicative()?;
                    left = Expr::BinOp(BinOp::Add, Box::new(left), Box::new(right));
                }
                Some(Token::Minus) => {
                    self.advance()?;
                    let right = self.parse_multiplicative()?;
                    left = Expr::BinOp(BinOp::Sub, Box::new(left), Box::new(right));
                }
                _ => break,
            }
        }
        Ok(left)
    }

    fn parse_multiplicative(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_unary()?;
        while self.peek() == Some(&Token::Star) {
            self.advance()?;
            let right = self.parse_unary()?;
            left = Expr::BinOp(BinOp::Mul, Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn parse_unary(&mut self) -> Result<Expr, ParseError> {
        match self.peek() {
            Some(Token::Tilde) => {
                self.advance()?;
                let inner = self.parse_unary()?;
                Ok(Expr::UnaryOp(UnaryOp::Not, Box::new(inner)))
            }
            Some(Token::Bang) => {
                self.advance()?;
                let inner = self.parse_unary()?;
                Ok(Expr::UnaryOp(UnaryOp::Not, Box::new(inner)))
            }
            Some(Token::Minus) => {
                self.advance()?;
                let inner = self.parse_unary()?;
                Ok(Expr::UnaryOp(UnaryOp::Neg, Box::new(inner)))
            }
            _ => self.parse_ternary(),
        }
    }

    fn parse_ternary(&mut self) -> Result<Expr, ParseError> {
        let cond = self.parse_atom()?;
        if self.peek() == Some(&Token::Question) {
            self.advance()?;
            let then_expr = self.parse_expr()?;
            self.expect(&Token::Colon)?;
            let else_expr = self.parse_expr()?;
            Ok(Expr::Ternary(Box::new(cond), Box::new(then_expr), Box::new(else_expr)))
        } else {
            Ok(cond)
        }
    }

    fn parse_atom(&mut self) -> Result<Expr, ParseError> {
        match self.peek().cloned() {
            Some(Token::Number(n)) => {
                self.advance()?;
                let expr = Expr::Literal(n);
                self.parse_postfix(expr)
            }
            Some(Token::Ident(id)) => {
                self.advance()?;
                let expr = Expr::Var(Ident(id));
                self.parse_postfix(expr)
            }
            Some(Token::LParen) => {
                self.advance()?;
                let expr = self.parse_expr()?;
                self.expect(&Token::RParen)?;
                self.parse_postfix(expr)
            }
            Some(Token::LBrace) => {
                self.advance()?;
                let mut exprs = Vec::new();
                while self.peek() != Some(&Token::RBrace) && self.peek().is_some() {
                    exprs.push(self.parse_expr()?);
                }
                self.expect(&Token::RBrace)?;
                Ok(Expr::Concat(exprs))
            }
            t => Err(format!("expected expression, got {:?}", t)),
        }
    }

    fn parse_postfix(&mut self, expr: Expr) -> Result<Expr, ParseError> {
        if self.peek() == Some(&Token::LBracket) {
            self.advance()?;
            let high = self.expect_literal()? as u32;
            self.expect(&Token::Colon)?;
            let low = self.expect_literal()? as u32;
            self.expect(&Token::RBracket)?;
            Ok(Expr::BitSlice(Box::new(expr), high, low))
        } else {
            Ok(expr)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_fsm() {
        let input = r#"
            fsm traffic_light clock_freq=100 reset=async encoding=onehot {
                state IDLE initial;
                state GO;
                state STOP;

                input sensor : 1;
                output light : 2;
                reg counter : 8;

                IDLE -> GO [sensor == 1] { light = 0; counter = 0; };
                GO -> STOP [counter >= 100] { light = 2; counter = 0; };
                STOP -> IDLE [counter >= 200] { light = 0; counter = 0; };
                GO -> GO [counter < 100] { counter = counter + 1; };
                STOP -> STOP [counter < 200] { counter = counter + 1; };
            }
        "#;
        let result = parse(input);
        assert!(result.is_ok(), "Parse failed: {:?}", result);
        let fsm = result.unwrap();
        assert_eq!(fsm.name.0, "traffic_light");
        assert_eq!(fsm.states.len(), 3);
        assert_eq!(fsm.transitions.len(), 5);
    }

    #[test]
    fn test_expressions() {
        let input = r#"
            fsm test_expr clock_freq=50 reset=sync encoding=binary {
                state S0 initial;
                state S1;

                input x : 8;
                output y : 8;
                reg r : 8;

                S0 -> S1 [x >= 10] { y = x + 1; r = 0; };
                S1 -> S0 [r < 255] { r = r + 1; };
            }
        "#;
        let result = parse(input);
        assert!(result.is_ok(), "Parse failed: {:?}", result);
    }
}
