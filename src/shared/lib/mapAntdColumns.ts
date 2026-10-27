// utils/mapAntdColumns.ts

import { isValidElement, type ReactNode } from "react";
import { TableColumn } from "@/shared/utils/fileExport";

interface ExportableAntdColumn<T extends object> {
  dataIndex?: keyof T | string | string[];
  title?: ReactNode;
  render?: (value: unknown, record: T, index?: number) => ReactNode;
}

function reactNodeToExportValue(value: ReactNode, fallback: unknown): string | number {
  if (typeof value === "string" || typeof value === "number") return value;
  if (isValidElement<{ children?: ReactNode }>(value)) {
    const { children } = value.props;
    if (typeof children === "string" || typeof children === "number") {
      return children;
    }
  }
  return String(fallback ?? "");
}

export function mapAntdToExportColumns<T extends object = Record<string, unknown>>(
  antdColumns: ExportableAntdColumn<T>[]
): TableColumn<T>[] {
  return antdColumns
    .filter((col) => col.dataIndex) // keep only real data cols
    .map((col) => {
      const dataKey = Array.isArray(col.dataIndex)
        ? col.dataIndex.join(".") // convert nested array to "a.b.c"
        : col.dataIndex;

      return {
        title: String(col.title ?? ""),
        dataIndex: dataKey,
        formatter: col.render
          ? (val: unknown, row?: T) => {
              try {
                // Run original render but extract text from JSX
                const rendered = row ? col.render?.(val, row) : undefined;
                return reactNodeToExportValue(rendered, val);
              } catch {
                return String(val ?? "");
              }
            }
          : undefined,
      };
    });
}
