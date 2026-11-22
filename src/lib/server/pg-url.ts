/** node-postgres treats sslmode=require as verify-full; saying so explicitly keeps behaviour and silences its warning. */
export function normalisePgUrl(url: string): string {
  return url.replace(/sslmode=(require|prefer|verify-ca)\b/, "sslmode=verify-full");
}
