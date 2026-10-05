'use client';

import { useEffect, useRef } from 'react';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
import type { TrendPoint } from '@/lib/finance/summary';
import { formatUsd } from '@/lib/finance/money';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
);
const series = [
  { label: 'Income', key: 'incomeCents', color: '#087f8c' },
  { label: 'Expenses', key: 'expenseCents', color: '#b54708' },
  { label: 'Balance', key: 'balanceCents', color: '#3044cc' },
] as const;

export function TrendChart({ points }: { points: TrendPoint[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current) return;
    const chart = new Chart(canvas.current, {
      type: 'line',
      data: {
        labels: points.map((p) => p.to),
        datasets: series.map((s, index) => ({
          label: s.label,
          data: points.map((p) => p[s.key]),
          borderColor: s.color,
          backgroundColor: s.color,
          borderDash: index ? [index * 4, index * 2] : [],
          pointRadius: points.length <= 62 ? 2 : 0,
          tension: 0,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          y: {
            ticks: {
              callback: (value) =>
                `$${(Number(value) / 100).toLocaleString('en-US')}`,
            },
          },
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (item) =>
                `${item.dataset.label}: ${formatUsd(points[item.dataIndex]![series[item.datasetIndex]!.key])}`,
            },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [points]);
  return (
    <>
      <div style={{ height: 300, position: 'relative' }}>
        <canvas
          ref={canvas}
          role="img"
          aria-label="Income, expenses, and balance over time. Exact values are in the table below."
        />
      </div>
      <details className="mt-3">
        <summary>View exact trend values</summary>
        <div className="table-responsive mt-3">
          <table className="table small">
            <caption className="visually-hidden">
              Income, expenses, and ending balance in USD
            </caption>
            <thead>
              <tr>
                <th scope="col">Period</th>
                <th scope="col">Income</th>
                <th scope="col">Expenses</th>
                <th scope="col">Ending balance</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.to}>
                  <th scope="row" className="fw-normal">
                    {p.from === p.to ? p.to : `${p.from} through ${p.to}`}
                  </th>
                  <td>{formatUsd(p.incomeCents)}</td>
                  <td>{formatUsd(p.expenseCents)}</td>
                  <td>{formatUsd(p.balanceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
