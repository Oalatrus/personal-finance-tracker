'use client';

import { useEffect, useRef } from 'react';
import { Chart, DoughnutController, ArcElement, Tooltip } from 'chart.js';
import { formatUsd } from '@/lib/finance/money';

Chart.register(DoughnutController, ArcElement, Tooltip);
const colors = [
  '#3044cc',
  '#087f8c',
  '#b54708',
  '#8753a1',
  '#217a45',
  '#b42365',
  '#496578',
];
type Spending = {
  categoryId: string;
  name: string;
  archived: boolean;
  amountCents: number;
};

export function SpendingChart({ spending }: { spending: Spending[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current) return;
    const chart = new Chart(canvas.current, {
      type: 'doughnut',
      data: {
        labels: spending.map((c) => c.name),
        datasets: [
          {
            data: spending.map((c) => c.amountCents),
            backgroundColor: spending.map((_, i) => colors[i % colors.length]!),
            borderWidth: 2,
            borderColor: '#fff',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        cutout: '65%',
        plugins: {
          tooltip: {
            callbacks: {
              label: (item) =>
                `${item.label}: ${formatUsd(spending[item.dataIndex]!.amountCents)}`,
            },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [spending]);
  return (
    <div className="row g-4 align-items-center">
      <div className="col-12 col-md-5">
        <div style={{ height: 260, position: 'relative' }}>
          <canvas
            ref={canvas}
            role="img"
            aria-label="Spending by category. Exact amounts are in the adjacent table."
          />
        </div>
      </div>
      <div className="col-12 col-md-7">
        <table className="table align-middle mb-0">
          <caption className="visually-hidden">
            Spending by category in USD for the selected dates
          </caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col" className="text-end">
                Spent
              </th>
            </tr>
          </thead>
          <tbody>
            {spending.map((c, i) => (
              <tr key={c.categoryId}>
                <th scope="row" className="fw-normal text-break">
                  <span
                    aria-hidden="true"
                    className="d-inline-block rounded-circle me-2"
                    style={{
                      width: 10,
                      height: 10,
                      backgroundColor: colors[i % colors.length],
                    }}
                  />
                  {c.name}
                  {c.archived && (
                    <span className="small text-secondary"> (archived)</span>
                  )}
                </th>
                <td className="text-end text-break">
                  {formatUsd(c.amountCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
