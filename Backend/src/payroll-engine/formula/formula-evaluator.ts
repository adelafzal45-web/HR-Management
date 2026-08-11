/**
 * A controlled arithmetic evaluator for payroll formulas.
 *
 * The spec is explicit that HR configures formulas from the UI but must NOT be
 * able to run arbitrary JavaScript: a stored formula is data, and evaluating it
 * with `eval`/`new Function` would turn a config field into remote code
 * execution against the server. So this is a hand-written tokenizer +
 * recursive-descent parser that understands only:
 *
 *   - numbers            (12, 0.5, 1_000 is NOT allowed — plain decimals only)
 *   - the four operators + - * /  and unary minus
 *   - parentheses        ( )
 *   - a fixed whitelist of UPPER_SNAKE variable names (see PAYROLL_VARIABLES)
 *
 * Anything else — an unknown identifier, a function call, a property access, a
 * stray character — is a `FormulaError`, surfaced to the caller as a readable
 * message rather than a 500. Division by zero is likewise a `FormulaError`, not
 * an `Infinity` that would silently poison a payslip.
 *
 * Grammar (lowest precedence first):
 *   expression := term  (('+' | '-') term)*
 *   term       := factor (('*' | '/') factor)*
 *   factor     := ('-' factor) | '(' expression ')' | number | variable
 */

/** The only variables a formula may reference, with human descriptions. */
export const PAYROLL_VARIABLES: Record<string, string> = {
  BASIC: 'Basic salary for the period',
  GROSS: 'Gross salary (basic + earnings that count toward gross)',
  WORKING_DAYS: 'Total working days in the period',
  PRESENT_DAYS: 'Days the employee was present',
  ABSENT_DAYS: 'Unpaid absent days',
  PAID_LEAVE: 'Paid leave days',
  UNPAID_LEAVE: 'Unpaid leave days',
  OT_HOURS: 'Overtime hours worked',
  OT_AMOUNT: 'Overtime amount already computed',
  LATE_MINUTES: 'Total late minutes in the period',
  HOURLY_RATE: 'Basic-derived hourly rate',
  DAILY_RATE: 'Basic-derived daily rate (BASIC / WORKING_DAYS)',
  BONUS: 'Bonus amount for the period',
  TAX: 'Tax amount for the period',
  LOAN_DEDUCTION: 'Loan/advance installment due this period',
};

export const PAYROLL_VARIABLE_NAMES = Object.keys(PAYROLL_VARIABLES);

/** A set of variable name -> value used to evaluate a formula. */
export type FormulaScope = Record<string, number>;

/** Raised for any malformed or unsafe formula. Carries a client-safe message. */
export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaError';
  }
}

type TokenType = 'number' | 'ident' | 'op' | 'lparen' | 'rparen';

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

const OPERATORS = new Set(['+', '-', '*', '/']);

/** Splits a formula string into tokens, rejecting any unexpected character. */
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    // Whitespace is insignificant.
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen', value: ch, position: i });
      i += 1;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ch, position: i });
      i += 1;
      continue;
    }

    if (OPERATORS.has(ch)) {
      tokens.push({ type: 'op', value: ch, position: i });
      i += 1;
      continue;
    }

    // Number: one or more digits, an optional single decimal point, more digits.
    if (ch >= '0' && ch <= '9') {
      let j = i + 1;
      let seenDot = false;
      while (j < input.length) {
        const c = input[j];
        if (c >= '0' && c <= '9') {
          j += 1;
        } else if (c === '.' && !seenDot) {
          seenDot = true;
          j += 1;
        } else {
          break;
        }
      }
      tokens.push({ type: 'number', value: input.slice(i, j), position: i });
      i = j;
      continue;
    }

    // A leading '.' as in `.5`.
    if (ch === '.') {
      let j = i + 1;
      while (j < input.length && input[j] >= '0' && input[j] <= '9') j += 1;
      if (j === i + 1) {
        throw new FormulaError(`Unexpected '.' at position ${i}.`);
      }
      tokens.push({ type: 'number', value: input.slice(i, j), position: i });
      i = j;
      continue;
    }

    // Identifier: letters, digits and underscore, must start with a letter.
    if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_') {
      let j = i + 1;
      while (j < input.length) {
        const c = input[j];
        if (
          (c >= 'A' && c <= 'Z') ||
          (c >= 'a' && c <= 'z') ||
          (c >= '0' && c <= '9') ||
          c === '_'
        ) {
          j += 1;
        } else {
          break;
        }
      }
      tokens.push({ type: 'ident', value: input.slice(i, j), position: i });
      i = j;
      continue;
    }

    throw new FormulaError(`Unexpected character '${ch}' at position ${i}.`);
  }

  return tokens;
}

/**
 * Recursive-descent parser that evaluates as it parses. State is the token
 * cursor; `scope` provides variable values (absent during a pure syntax check,
 * where unknown-but-whitelisted names resolve to 0).
 */
class Parser {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly scope: FormulaScope,
  ) {}

  parse(): number {
    if (this.tokens.length === 0) {
      throw new FormulaError('Formula is empty.');
    }
    const value = this.expression();
    if (this.pos < this.tokens.length) {
      const t = this.tokens[this.pos];
      throw new FormulaError(
        `Unexpected '${t.value}' at position ${t.position}.`,
      );
    }
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private expression(): number {
    let value = this.term();
    while (
      this.peek()?.type === 'op' &&
      (this.peek()!.value === '+' || this.peek()!.value === '-')
    ) {
      const op = this.tokens[this.pos].value;
      this.pos += 1;
      const rhs = this.term();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  private term(): number {
    let value = this.factor();
    while (
      this.peek()?.type === 'op' &&
      (this.peek()!.value === '*' || this.peek()!.value === '/')
    ) {
      const op = this.tokens[this.pos].value;
      this.pos += 1;
      const rhs = this.factor();
      if (op === '*') {
        value *= rhs;
      } else {
        if (rhs === 0) {
          throw new FormulaError('Division by zero.');
        }
        value /= rhs;
      }
    }
    return value;
  }

  private factor(): number {
    const token = this.peek();
    if (!token) {
      throw new FormulaError('Unexpected end of formula.');
    }

    // Unary minus.
    if (token.type === 'op' && token.value === '-') {
      this.pos += 1;
      return -this.factor();
    }

    // Unary plus, tolerated as a no-op.
    if (token.type === 'op' && token.value === '+') {
      this.pos += 1;
      return this.factor();
    }

    if (token.type === 'lparen') {
      this.pos += 1;
      const value = this.expression();
      const closing = this.peek();
      if (closing?.type !== 'rparen') {
        throw new FormulaError('Missing closing parenthesis.');
      }
      this.pos += 1;
      return value;
    }

    if (token.type === 'number') {
      this.pos += 1;
      return Number(token.value);
    }

    if (token.type === 'ident') {
      this.pos += 1;
      const name = token.value;
      if (!PAYROLL_VARIABLE_NAMES.includes(name)) {
        throw new FormulaError(
          `Unknown variable '${name}'. Allowed: ${PAYROLL_VARIABLE_NAMES.join(', ')}.`,
        );
      }
      const value = this.scope[name];
      return value === undefined ? 0 : value;
    }

    throw new FormulaError(
      `Unexpected '${token.value}' at position ${token.position}.`,
    );
  }
}

/**
 * Evaluate a formula against a scope of variable values. Throws `FormulaError`
 * for any syntax problem, unknown variable, or division by zero.
 */
export function evaluateFormula(formula: string, scope: FormulaScope): number {
  const tokens = tokenize(formula);
  const result = new Parser(tokens, scope).parse();
  if (!Number.isFinite(result)) {
    throw new FormulaError('Formula did not evaluate to a finite number.');
  }
  return result;
}

/**
 * Validate a formula's syntax and variable references without needing real
 * values — every whitelisted variable resolves to 0. Returns null when valid,
 * or the error message when not. Used by the "Test Rule" endpoint and by
 * component create/update validation.
 */
export function validateFormula(formula: string): string | null {
  try {
    const scope: FormulaScope = {};
    for (const name of PAYROLL_VARIABLE_NAMES) scope[name] = 0;
    evaluateFormula(formula, scope);
    return null;
  } catch (err) {
    return err instanceof FormulaError ? err.message : 'Invalid formula.';
  }
}
