export const formatRand = (cents: number) =>
  `R${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export const formatTime = (d: Date) =>
  d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });

export const formatDayLabel = (d: Date) =>
  d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });

export const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const startOfWeek = (d: Date) => {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return x;
};

export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const pointsToRand = (pts: number) => (pts / 100) * 10 * 100; // returns cents
