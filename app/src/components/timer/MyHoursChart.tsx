import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

function lastNDays(n: number) {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
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

  const days = useMemo(() => lastNDays(7), []);

  const hoursQuery = useQuery({
    queryKey: ["my-daily-hours", userId, days[0]],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_logs")
        .select("log_date, hours")
        .eq("user_id", userId!)
        .gte("log_date", days[0]);
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

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">My hours — last 7 days</h2>
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
