import { ReactNode, useMemo, useState } from "react";

export type DataTableColumn<T> = {
  key: string;
  label: string;
  /** Raw value used for sort/filter. Defaults to row[key]. */
  value?: (row: T) => any;
  /** Display override. Defaults to String(value). */
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  filterable?: boolean;
  align?: "left" | "right" | "center";
};

type Props<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
  defaultSortKey?: string;
  defaultSortDir?: "asc" | "desc";
  /** Rendered as a footer row below the table body, given the currently filtered+sorted rows. */
  footer?: (rows: T[]) => ReactNode;
};

function normalize(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function rawValue<T>(col: DataTableColumn<T>, row: T): any {
  if (col.value) return col.value(row);
  return (row as any)[col.key];
}

function displayText<T>(col: DataTableColumn<T>, row: T): string {
  const v = rawValue(col, row);
  if (v == null) return "";
  if (v instanceof Date) return v.toLocaleString("pt-BR");
  return String(v);
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = "Nenhum registro encontrado.",
  defaultSortKey,
  defaultSortDir = "asc",
  footer,
}: Props<T>) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSortDir);
  const [search, setSearch] = useState("");

  const filterableColumns = useMemo(() => columns.filter((c) => c.filterable !== false), [columns]);

  const filtered = useMemo(() => {
    const needle = normalize(search.trim());
    if (!needle) return rows;
    return rows.filter((row) => filterableColumns.some((col) => normalize(displayText(col, row)).includes(needle)));
  }, [rows, search, filterableColumns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = rawValue(col, a);
      const bv = rawValue(col, b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else if (av instanceof Date && bv instanceof Date) cmp = av.getTime() - bv.getTime();
      else cmp = String(av).localeCompare(String(bv), "pt-BR", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir, columns]);

  function toggleSort(col: DataTableColumn<T>) {
    if (col.sortable === false) return;
    if (sortKey !== col.key) {
      setSortKey(col.key);
      setSortDir("asc");
    } else {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    }
  }

  return (
    <div>
      {filterableColumns.length > 0 && (
        <div className="table-search">
          <input
            type="text"
            className="table-search-input"
            placeholder="Filtrar…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}
      <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={{ textAlign: col.align || "left" }}>
                {col.sortable === false ? (
                  col.label
                ) : (
                  <button type="button" className="th-sort" onClick={() => toggleSort(col)}>
                    {col.label}
                    <span className="sort-arrow">{sortKey === col.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}</span>
                  </button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="muted">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sorted.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((col) => (
                  <td key={col.key} style={{ textAlign: col.align || "left" }}>
                    {col.render ? col.render(row) : displayText(col, row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {footer && sorted.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={columns.length}>{footer(sorted)}</td>
            </tr>
          </tfoot>
        )}
      </table>
      </div>
    </div>
  );
}
