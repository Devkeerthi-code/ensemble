/**
 * Arithmetic only: numbers, + - * / % ^, parentheses and a few functions. A hand-written parser,
 * never eval(), so a prompt-injected expression can't run code.
 */
const FUNCS: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d,
  min: Math.min,
  max: Math.max,
  log: Math.log10,
  ln: Math.log,
};

export function calculate(expression: string): number {
  const src = expression.replace(/\s+/g, "");
  if (src.length === 0 || src.length > 200) throw new Error("Expression must be 1-200 characters");
  let i = 0;
  const peek = () => src[i];
  const eat = (c: string) => {
    if (src[i] !== c) throw new Error(`Expected "${c}" at position ${i + 1}`);
    i++;
  };

  function primary(): number {
    if (peek() === "(") {
      eat("(");
      const v = expr();
      eat(")");
      return v;
    }
    if (peek() === "-") {
      i++;
      return -primary();
    }
    const num = src.slice(i).match(/^\d+(\.\d+)?(e[+-]?\d+)?/i);
    if (num) {
      i += num[0].length;
      return Number(num[0]);
    }
    const name = src.slice(i).match(/^[a-z]+/i)?.[0];
    if (name && FUNCS[name.toLowerCase()]) {
      i += name.length;
      eat("(");
      const args = [expr()];
      while (peek() === ",") {
        i++;
        args.push(expr());
      }
      eat(")");
      return FUNCS[name.toLowerCase()]!(...args);
    }
    if (name === "pi") {
      i += 2;
      return Math.PI;
    }
    throw new Error(`Unexpected "${peek() ?? "end"}" at position ${i + 1}`);
  }
  function power(): number {
    const base = primary();
    if (peek() === "^") {
      i++;
      return base ** power();
    }
    return base;
  }
  function term(): number {
    let v = power();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = src[i++];
      const r = power();
      v = op === "*" ? v * r : op === "/" ? v / r : v % r;
    }
    return v;
  }
  function expr(): number {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = src[i++];
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }

  const value = expr();
  if (i !== src.length) throw new Error(`Unexpected "${src[i]}" at position ${i + 1}`);
  if (!Number.isFinite(value)) throw new Error("Result is not a finite number");
  return value;
}
