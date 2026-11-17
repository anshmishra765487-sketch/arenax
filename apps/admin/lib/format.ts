const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Deterministic UTC formatting so server and browser render identical HTML. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${pad(date.getUTCDate())} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()} · ${pad(
    date.getUTCHours(),
  )}:${pad(date.getUTCMinutes())} UTC`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${pad(date.getUTCDate())} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function toLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export const STATUS_STYLES: Record<string, string> = {
  upcoming: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  live: "border-red-500/40 bg-red-500/10 text-red-300",
  completed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  cancelled: "border-slate-600/40 bg-slate-600/10 text-slate-400",
  confirmed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  waitlisted: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  approved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  rejected: "border-red-500/40 bg-red-500/10 text-red-300",
  flagged: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  open: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  resolved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  dismissed: "border-slate-600/40 bg-slate-600/10 text-slate-400",
  under_review: "border-amber-500/40 bg-amber-500/10 text-amber-300",
};

export function statusClass(status: string | null | undefined): string {
  return STATUS_STYLES[status ?? ""] ?? "border-slate-600/40 bg-slate-600/10 text-slate-300";
}
