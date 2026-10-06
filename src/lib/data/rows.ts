import 'server-only';

export async function allRows<T extends { id: string }>(
  page: (after: string) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  let after = '';
  // Continue until empty, even if the server's row limit is smaller than our batch size.
  for (;;) {
    const { data, error } = await page(after);
    if (error || !data) throw new Error('Unable to load records.');
    if (!data.length) return rows;
    rows.push(...data);
    after = data[data.length - 1]!.id;
  }
}
