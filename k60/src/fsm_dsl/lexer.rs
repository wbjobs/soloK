#[derive(Debug, Clone, PartialEq)]
pub enum Token {
    Kw(String),
    Ident(String),
    Number(u64),
    Float(f64),
    LBrace,
    RBrace,
    LBracket,
    RBracket,
    LParen,
    RParen,
    Semi,
    Colon,
    Eq,
    Ne,
    Lt,
    Le,
    Gt,
    Ge,
    Arrow,
    Plus,
    Minus,
    Star,
    Tilde,
    Bang,
    Caret,
    BitAnd,
    BitOr,
    LogicAnd,
    LogicOr,
    Shl,
    Shr,
    Question,
    Eof,
}

pub struct Lexer {
    input: Vec<char>,
    pos: usize,
}

impl Lexer {
    pub fn new(input: &str) -> Self {
        Lexer {
            input: input.chars().collect(),
            pos: 0,
        }
    }

    fn peek_char(&self) -> Option<char> {
        self.input.get(self.pos).copied()
    }

    fn advance_char(&mut self) -> Option<char> {
        let ch = self.input.get(self.pos).copied();
        if ch.is_some() {
            self.pos += 1;
        }
        ch
    }

    fn peek_next(&self) -> Option<char> {
        self.input.get(self.pos + 1).copied()
    }

    fn skip_whitespace_and_comments(&mut self) {
        loop {
            match self.peek_char() {
                Some(c) if c.is_whitespace() => {
                    self.advance_char();
                }
                Some('/') if self.peek_next() == Some('/') => {
                    while self.peek_char().map_or(false, |c| c != '\n') {
                        self.advance_char();
                    }
                }
                Some('/') if self.peek_next() == Some('*') => {
                    self.advance_char();
                    self.advance_char();
                    loop {
                        match (self.peek_char(), self.peek_next()) {
                            (Some('*'), Some('/')) => {
                                self.advance_char();
                                self.advance_char();
                                break;
                            }
                            (Some(_), _) => {
                                self.advance_char();
                            }
                            _ => break,
                        }
                    }
                }
                _ => break,
            }
        }
    }

    pub fn next_token(&mut self) -> Result<Token, String> {
        self.skip_whitespace_and_comments();

        let ch = match self.peek_char() {
            Some(c) => c,
            None => return Ok(Token::Eof),
        };

        match ch {
            '{' => { self.advance_char(); Ok(Token::LBrace) }
            '}' => { self.advance_char(); Ok(Token::RBrace) }
            '[' => { self.advance_char(); Ok(Token::LBracket) }
            ']' => { self.advance_char(); Ok(Token::RBracket) }
            '(' => { self.advance_char(); Ok(Token::LParen) }
            ')' => { self.advance_char(); Ok(Token::RParen) }
            ';' => { self.advance_char(); Ok(Token::Semi) }
            ':' => { self.advance_char(); Ok(Token::Colon) }
            '?' => { self.advance_char(); Ok(Token::Question) }
            '^' => { self.advance_char(); Ok(Token::Caret) }
            '~' => { self.advance_char(); Ok(Token::Tilde) }
            '+' => { self.advance_char(); Ok(Token::Plus) }
            '*' => { self.advance_char(); Ok(Token::Star) }
            '-' => {
                self.advance_char();
                if self.peek_char() == Some('>') {
                    self.advance_char();
                    Ok(Token::Arrow)
                } else {
                    Ok(Token::Minus)
                }
            }
            '!' => {
                self.advance_char();
                if self.peek_char() == Some('=') {
                    self.advance_char();
                    Ok(Token::Ne)
                } else {
                    Ok(Token::Bang)
                }
            }
            '=' => {
                self.advance_char();
                if self.peek_char() == Some('=') {
                    self.advance_char();
                    Ok(Token::Eq)
                } else {
                    Ok(Token::Eq)
                }
            }
            '<' => {
                self.advance_char();
                match self.peek_char() {
                    Some('=') => { self.advance_char(); Ok(Token::Le) }
                    Some('<') => { self.advance_char(); Ok(Token::Shl) }
                    _ => Ok(Token::Lt)
                }
            }
            '>' => {
                self.advance_char();
                match self.peek_char() {
                    Some('=') => { self.advance_char(); Ok(Token::Ge) }
                    Some('>') => { self.advance_char(); Ok(Token::Shr) }
                    _ => Ok(Token::Gt)
                }
            }
            '&' => {
                self.advance_char();
                if self.peek_char() == Some('&') {
                    self.advance_char();
                    Ok(Token::LogicAnd)
                } else {
                    Ok(Token::BitAnd)
                }
            }
            '|' => {
                self.advance_char();
                if self.peek_char() == Some('|') {
                    self.advance_char();
                    Ok(Token::LogicOr)
                } else {
                    Ok(Token::BitOr)
                }
            }
            c if c.is_ascii_digit() => self.read_number(),
            c if c.is_ascii_alphabetic() || c == '_' => self.read_ident_or_kw(),
            c => Err(format!("unexpected character: '{}'", c)),
        }
    }

    fn read_number(&mut self) -> Result<Token, String> {
        let start = self.pos;

        if self.peek_char() == Some('0') {
            match self.peek_next() {
                Some('x') | Some('X') => {
                    self.advance_char();
                    self.advance_char();
                    let hex_start = self.pos;
                    while self.peek_char().map_or(false, |c| c.is_ascii_hexdigit()) {
                        self.advance_char();
                    }
                    let hex_str: String = self.input[hex_start..self.pos].iter().collect();
                    let val = u64::from_str_radix(&hex_str, 16)
                        .map_err(|e| format!("invalid hex number: {}", e))?;
                    return Ok(Token::Number(val));
                }
                Some('b') | Some('B') => {
                    self.advance_char();
                    self.advance_char();
                    let bin_start = self.pos;
                    while self.peek_char().map_or(false, |c| c == '0' || c == '1') {
                        self.advance_char();
                    }
                    let bin_str: String = self.input[bin_start..self.pos].iter().collect();
                    let val = u64::from_str_radix(&bin_str, 2)
                        .map_err(|e| format!("invalid binary number: {}", e))?;
                    return Ok(Token::Number(val));
                }
                _ => {}
            }
        }

        while self.peek_char().map_or(false, |c| c.is_ascii_digit()) {
            self.advance_char();
        }

        let num_str: String = self.input[start..self.pos].iter().collect();

        if self.peek_char() == Some('\'') {
            let _width: u32 = num_str.parse()
                .map_err(|e| format!("invalid width: {}", e))?;
            self.advance_char();

            let base_char = self.advance_char().ok_or("expected base specifier after '")?;
            let digit_start = self.pos;

            match base_char {
                'b' | 'B' => {
                    while self.peek_char().map_or(false, |c| c == '0' || c == '1' || c == '_') {
                        self.advance_char();
                    }
                }
                'h' | 'H' => {
                    while self.peek_char().map_or(false, |c| c.is_ascii_hexdigit() || c == '_') {
                        self.advance_char();
                    }
                }
                'd' | 'D' => {
                    while self.peek_char().map_or(false, |c| c.is_ascii_digit() || c == '_') {
                        self.advance_char();
                    }
                }
                _ => return Err(format!("unknown base specifier: '{}'", base_char)),
            }

            let digit_str: String = self.input[digit_start..self.pos].iter()
                .filter(|c| **c != '_')
                .collect();

            let val = match base_char {
                'b' | 'B' => u64::from_str_radix(&digit_str, 2),
                'h' | 'H' => u64::from_str_radix(&digit_str, 16),
                'd' | 'D' => digit_str.parse(),
                _ => unreachable!(),
            }.map_err(|e| format!("invalid verilog literal: {}", e))?;

            Ok(Token::Number(val))
        } else if self.peek_char() == Some('.') {
            self.advance_char();
            while self.peek_char().map_or(false, |c| c.is_ascii_digit()) {
                self.advance_char();
            }
            let float_str: String = self.input[start..self.pos].iter().collect();
            let val: f64 = float_str.parse()
                .map_err(|e| format!("invalid float: {}", e))?;
            Ok(Token::Float(val))
        } else {
            let val: u64 = num_str.parse()
                .map_err(|e| format!("invalid number: {}", e))?;
            Ok(Token::Number(val))
        }
    }

    fn read_ident_or_kw(&mut self) -> Result<Token, String> {
        let start = self.pos;
        while self.peek_char().map_or(false, |c| c.is_ascii_alphanumeric() || c == '_') {
            self.advance_char();
        }
        let word: String = self.input[start..self.pos].iter().collect();

        match word.as_str() {
            "fsm" | "state" | "input" | "output" | "reg" | "param" | "initial" => {
                Ok(Token::Kw(word))
            }
            _ => Ok(Token::Ident(word)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_tokens() {
        let mut lexer = Lexer::new("fsm test clock_freq=100 { } -> [ ] ; : = == != < <= > >= && || << >> + - * ~ ! ^ & | ?");
        let tokens: Vec<Token> = vec![
            Token::Kw("fsm".into()),
            Token::Ident("test".into()),
            Token::Ident("clock_freq".into()),
            Token::Eq,
            Token::Number(100),
            Token::LBrace,
            Token::RBrace,
            Token::Arrow,
            Token::LBracket,
            Token::RBracket,
            Token::Semi,
            Token::Colon,
            Token::Eq,
            Token::Eq,
            Token::Ne,
            Token::Lt,
            Token::Le,
            Token::Gt,
            Token::Ge,
            Token::LogicAnd,
            Token::LogicOr,
            Token::Shl,
            Token::Shr,
            Token::Plus,
            Token::Minus,
            Token::Star,
            Token::Tilde,
            Token::Bang,
            Token::Caret,
            Token::BitAnd,
            Token::BitOr,
            Token::Question,
        ];

        for expected in tokens {
            let tok = lexer.next_token().unwrap();
            assert_eq!(tok, expected);
        }
    }

    #[test]
    fn test_verilog_literals() {
        let mut lexer = Lexer::new("8'b01 2'b10 16'hFF 8'd255 0xFF 0b1010 42");
        assert_eq!(lexer.next_token().unwrap(), Token::Number(1));
        assert_eq!(lexer.next_token().unwrap(), Token::Number(2));
        assert_eq!(lexer.next_token().unwrap(), Token::Number(255));
        assert_eq!(lexer.next_token().unwrap(), Token::Number(255));
        assert_eq!(lexer.next_token().unwrap(), Token::Number(255));
        assert_eq!(lexer.next_token().unwrap(), Token::Number(10));
        assert_eq!(lexer.next_token().unwrap(), Token::Number(42));
    }
}
