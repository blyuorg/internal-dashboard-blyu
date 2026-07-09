import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { DayDetailPanel } from "./DayDetailPanel";

// Nothing in time_logs is ever deleted (see supabase/migrations/0001_init_schema.sql),
// so every week a person has ever logged hours stays fully visible here —
// this offset just controls which 7-day window is currently on screen.
function weekDays(weekOffset: number) {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i + weekOffset * 7);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function formatDayLabel(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

export function MyHoursChart() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [chartType, setChartType] = useState<"bar" | "curve">("bar");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const days = useMemo(() => weekDays(weekOffset), [weekOffset]);

  const hoursQuery = useQuery({
    queryKey: ["my-daily-hours", userId, days[0], days[6]],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_logs")
        .select("log_date, hours")
        .eq("user_id", userId!)
        .gte("log_date", days[0])
        .lte("log_date", days[6]);
      if (error) throw error;
      return data;
    },
  });

  const chartData = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const day of days) byDay.set(day, 0);
    for (const row of hoursQuery.data ?? []) {
      byDay.set(row.log_date, (byDay.get(row.log_date) ?? 0) + Number(row.hours));
    }
    return days.map((day) => ({
      date: day,
      day: formatDayLabel(day),
      hours: Number((byDay.get(day) ?? 0).toFixed(2)),
    }));
  }, [days, hoursQuery.data]);

  const rangeLabel =
    weekOffset === 0
      ? "This week"
      : `${new Date(days[0] + "T00:00:00").toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })} – ${new Date(days[6] + "T00:00:00").toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })}`;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">My hours</h2>
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            aria-label="Previous week"
            className="rounded p-1 hover:bg-[var(--color-bg)]"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-32 text-center text-sm text-[var(--color-text-muted)]">{rangeLabel}</span>
          <button
            onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}
            disabled={weekOffset === 0}
            aria-label="Next week"
            className="rounded p-1 hover:bg-[var(--color-bg)] disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="rounded border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]"
            >
              Today
            </button>
          )}
        </div>
        <div className="flex overflow-hidden rounded-md border border-[var(--color-border)] text-xs">
          <button
            onClick={() => setChartType("bar")}
            className={`px-2.5 py-1 ${
              chartType === "bar" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : ""
            }`}
          >
            Bar
          </button>
          <button
            onClick={() => setChartType("curve")}
            className={`px-2.5 py-1 ${
              chartType === "curve" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : ""
            }`}
          >
            Curve
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <ResponsiveContainer width="100%" height={220}>
          {chartType === "bar" ? (
            <BarChart
              data={chartData}
              onClick={(state) => {
                const index = typeof state?.activeTooltipIndex === "number" ? state.activeTooltipIndex : undefined;
                if (index !== undefined) setSelectedDate(chartData[index]?.date ?? null);
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="day" tick={{ fill: "var(--color-text-muted)", fontSize: 12 }} />
              <YAxis tick={{ fill: "var(--color-text-muted)", fontSize: 12 }} unit="h" />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                }}
                formatter={(value) => [`${value}h`, "Hours"] as [string, string]}
              />
              <Bar dataKey="hours" fill="var(--color-accent)" radius={[4, 4, 0, 0]} cursor="pointer" />
            </BarChart>
          ) : (
            <LineChart
              data={chartData}
              onClick={(state) => {
                const index = typeof state?.activeTooltipIndex === "number" ? state.activeTooltipIndex : undefined;
                if (index !== undefined) setSelectedDate(chartData[index]?.date ?? null);
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="day" tick={{ fill: "var(--color-text-muted)", fontSize: 12 }} />
              <YAxis tick={{ fill: "var(--color-text-muted)", fontSize: 12 }} unit="h" />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                }}
                formatter={(value) => [`${value}h`, "Hours"] as [string, string]}
              />
              <Line
                type="monotone"
                dataKey="hours"
                stroke="var(--color-accent)"
                strokeWidth={2}
                dot={{ r: 4, cursor: "pointer" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>

        <div className="mt-2 flex flex-wrap gap-1">
          {chartData.map((d) => (
            <button
              key={d.date}
              onClick={() => setSelectedDate(d.date)}
              className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]"
            >
              {d.day}
            </button>
          ))}
        </div>
      </div>

      {selectedDate && <DayDetailPanel date={selectedDate} onClose={() => setSelectedDate(null)} />}
    </section>
  );
}
