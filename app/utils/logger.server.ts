const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";

function timestamp() {
  return new Date().toISOString().replace("T", " ").slice(0, 23);
}

function tag(name: string, color: string) {
  return `${BOLD}${color}[${name}]${RESET}`;
}

export function createLogger(prefix: string) {
  const t = tag(prefix, CYAN);
  const wt = tag(prefix, YELLOW);
  const et = tag(prefix, RED);

  return {
    info: (msg: string, ...args: unknown[]) =>
      console.log(`${DIM}${timestamp()}${RESET} ${t} ${msg}`, ...args),

    warn: (msg: string, ...args: unknown[]) =>
      console.warn(`${DIM}${timestamp()}${RESET} ${wt} ${YELLOW}${msg}${RESET}`, ...args),

    error: (msg: string, ...args: unknown[]) =>
      console.error(`${DIM}${timestamp()}${RESET} ${et} ${RED}${msg}${RESET}`, ...args),

    success: (msg: string, ...args: unknown[]) =>
      console.log(`${DIM}${timestamp()}${RESET} ${tag(prefix, GREEN)} ${GREEN}${msg}${RESET}`, ...args),

    /** Log an incoming request and return a timer function */
    request: (method: string, params: Record<string, unknown> = {}) => {
      const start = Date.now();
      const paramStr = Object.entries(params)
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");
      console.log(
        `${DIM}${timestamp()}${RESET} ${tag(prefix, MAGENTA)} ${BOLD}${method}${RESET}${paramStr ? ` ${DIM}${paramStr}${RESET}` : ""}`
      );
      return (status: number, detail?: string) => {
        const ms = Date.now() - start;
        const statusColor = status >= 400 ? RED : status >= 300 ? YELLOW : GREEN;
        console.log(
          `${DIM}${timestamp()}${RESET} ${tag(prefix, MAGENTA)} ${statusColor}${status}${RESET} ${DIM}(${ms}ms)${detail ? ` — ${detail}` : ""}${RESET}`
        );
      };
    },
  };
}
