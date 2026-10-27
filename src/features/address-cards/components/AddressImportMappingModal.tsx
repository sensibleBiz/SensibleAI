import { useMemo, useState } from "react";
import { Alert, Button, Modal, Select, Tag } from "antd";
import { CheckCircle2, FileSpreadsheet, MapPin, TriangleAlert } from "lucide-react";
import type { AddressRecord } from "./types";
import {
  IMPORT_FIELD_DEFINITIONS,
  IMPORT_LOGICAL_FIELDS,
  analyzeAddressWorksheet,
  createAddressImportPreview,
  hasUsableAddressMapping,
  type AddressWorkbookSession,
  type AddressWorksheetAnalysis,
  type ExcelColumnMappings,
  type ImportLogicalField,
  type MappingConfidence,
} from "@/features/address-cards/utils/addressExcel";
import {
  DEFAULT_ADDRESS_CARD_SETTINGS,
  getAddressDisplayLines,
} from "@/features/address-cards/utils/addressCards";

interface AddressImportMappingModalProps {
  session: AddressWorkbookSession;
  open: boolean;
  onCancel: () => void;
  onImport: (
    records: AddressRecord[],
    analysis: AddressWorksheetAnalysis,
  ) => void;
}

const CONFIDENCE_COLORS: Record<MappingConfidence, string> = {
  high: "green",
  medium: "gold",
  low: "orange",
  unmapped: "default",
};

function getHeaderMode(analysis: AddressWorksheetAnalysis): string {
  return analysis.isHeaderlessLeadFormat
    ? "auto"
    : analysis.headerRowIndex === null
      ? "none"
      : `row-${analysis.headerRowIndex}`;
}

function MappingSelect({
  analysis,
  field,
  mappings,
  onChange,
}: {
  analysis: AddressWorksheetAnalysis;
  field: ImportLogicalField;
  mappings: ExcelColumnMappings;
  onChange: (field: ImportLogicalField, columnId: string | null) => void;
}) {
  const mapping = mappings[field];

  return (
    <Select
      value={mapping.columnId || "__none__"}
      className="w-full"
      showSearch
      optionFilterProp="label"
      onChange={(value) => onChange(field, value === "__none__" ? null : value)}
      options={[
        { value: "__none__", label: "Not available / Ignore" },
        ...analysis.columns.map((column) => ({
          value: column.id,
          label: `${column.label}${column.samples[0] ? ` — ${column.samples[0].slice(0, 55)}` : ""}`,
        })),
      ]}
    />
  );
}

export default function AddressImportMappingModal({
  session,
  open,
  onCancel,
  onImport,
}: AddressImportMappingModalProps) {
  const [worksheetName, setWorksheetName] = useState(
    session.suggestedWorksheetName,
  );
  const [analysis, setAnalysis] = useState(() =>
    analyzeAddressWorksheet(session, session.suggestedWorksheetName),
  );
  const [mappings, setMappings] = useState<ExcelColumnMappings>(
    analysis.mappings,
  );
  const [headerMode, setHeaderMode] = useState(getHeaderMode(analysis));
  const preview = useMemo(
    () => createAddressImportPreview(analysis, mappings),
    [analysis, mappings],
  );
  const hasAddressMapping = hasUsableAddressMapping(mappings);

  const replaceAnalysis = (
    nextWorksheetName: string,
    nextHeaderMode: string,
  ) => {
    const headerOverride = nextHeaderMode === "auto"
      ? "auto"
      : nextHeaderMode === "none"
        ? null
        : Number(nextHeaderMode.replace("row-", ""));
    const nextAnalysis = analyzeAddressWorksheet(
      session,
      nextWorksheetName,
      headerOverride,
    );

    setWorksheetName(nextWorksheetName);
    setHeaderMode(nextHeaderMode === "auto" ? getHeaderMode(nextAnalysis) : nextHeaderMode);
    setAnalysis(nextAnalysis);
    setMappings(nextAnalysis.mappings);
  };

  const handleMappingChange = (
    field: ImportLogicalField,
    columnId: string | null,
  ) => {
    setMappings((current) => ({
      ...current,
      [field]: {
        field,
        columnId,
        confidence: columnId ? "high" : "unmapped",
        reason: columnId ? "Selected manually" : "Ignored by user",
      },
    }));
  };

  const headerOptions = [
    { value: "auto", label: "Detect automatically" },
    { value: "none", label: "No header row" },
    ...Array.from(
      { length: Math.min(20, analysis.totalWorksheetRows) },
      (_, index) => ({ value: `row-${index}`, label: `Row ${index + 1}` }),
    ),
  ];

  return (
    <Modal
      open={open}
      width={1180}
      title={
        <span className="flex items-center gap-2">
          <FileSpreadsheet size={19} className="text-blue-600" />
          Review Excel column mapping
        </span>
      }
      onCancel={onCancel}
      destroyOnHidden
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-slate-500">
            {preview.stats.readyRows} rows selected by default · {preview.rows.length} rows will remain editable
          </span>
          <div className="flex gap-2">
            <Button onClick={onCancel}>Cancel</Button>
            <Button
              type="primary"
              disabled={!hasAddressMapping || !preview.rows.length}
              onClick={() =>
                onImport(
                  preview.rows.map((row) => row.record),
                  analysis,
                )
              }
            >
              Import {preview.rows.length} rows
            </Button>
          </div>
        </div>
      }
    >
      <div className="max-h-[72vh] space-y-5 overflow-y-auto pr-1">
        <Alert
          showIcon
          type={analysis.detectionConfidence === "high" ? "success" : "warning"}
          message={analysis.detectionMessage}
          description="Automatic detection is a starting point. Review the address mapping and sample output before importing."
        />

        <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            <span className="mb-2 block">Worksheet</span>
            <Select
              value={worksheetName}
              className="w-full"
              onChange={(value) => replaceAnalysis(value, "auto")}
              options={session.worksheetSummaries.map((summary) => ({
                value: summary.name,
                label: `${summary.name} (${summary.estimatedRecords} detected rows)`,
              }))}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            <span className="mb-2 block">Header row</span>
            <Select
              value={headerMode}
              className="w-full"
              onChange={(value) => replaceAnalysis(worksheetName, value)}
              options={headerOptions}
            />
          </label>
        </div>

        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">Detected mapping</h3>
              <p className="text-sm text-slate-500">
                At least one address-related field must be mapped.
              </p>
            </div>
            {!hasAddressMapping && (
              <span className="flex items-center gap-1 text-sm font-medium text-red-600">
                <TriangleAlert size={15} /> Address mapping required
              </span>
            )}
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">CRM field</th>
                  <th className="px-4 py-3">Excel column</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">Detection note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {IMPORT_LOGICAL_FIELDS.map((field) => {
                  const mapping = mappings[field];
                  return (
                    <tr key={field}>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">
                        {IMPORT_FIELD_DEFINITIONS[field].label}
                        {IMPORT_FIELD_DEFINITIONS[field].addressRelated && (
                          <MapPin size={13} className="ml-1 inline text-blue-500" />
                        )}
                      </td>
                      <td className="min-w-80 px-4 py-3">
                        <MappingSelect
                          analysis={analysis}
                          field={field}
                          mappings={mappings}
                          onChange={handleMappingChange}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Tag color={CONFIDENCE_COLORS[mapping.confidence]}>
                          {mapping.confidence.charAt(0).toUpperCase() + mapping.confidence.slice(1)}
                        </Tag>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {mapping.reason}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className="mb-3 font-semibold text-slate-900">Import summary</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Excel rows", preview.stats.totalExcelRows],
              ["Valid", preview.stats.validRows],
              ["Empty", preview.stats.emptyRows],
              ["Duplicates", preview.stats.duplicateRows],
              ["Missing address", preview.stats.missingAddressRows],
              ["Ready", preview.stats.readyRows],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <span className="block text-xs text-slate-500">{label}</span>
                <span className="text-lg font-bold text-slate-900">{value}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-3 font-semibold text-slate-900">First five card addresses</h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {preview.rows.slice(0, 5).map((row) => (
              <div key={row.record.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="text-xs font-medium text-slate-400">Excel row {row.sourceRowNumber}</span>
                  {row.statuses[0] === "Ready" ? (
                    <CheckCircle2 size={15} className="text-green-600" />
                  ) : (
                    <TriangleAlert size={15} className="text-amber-600" />
                  )}
                </div>
                <div className="min-h-28 text-sm leading-5 text-slate-800">
                  {getAddressDisplayLines(
                    row.record,
                    DEFAULT_ADDRESS_CARD_SETTINGS,
                  ).map((line) => (
                    <div
                      key={line.key}
                      className={`${line.bold ? "font-bold" : ""} ${line.spacingBeforeMm ? "mt-2" : ""}`}
                    >
                      {line.text}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {row.statuses.map((status) => (
                    <Tag key={status} color={status === "Ready" ? "green" : "gold"}>
                      {status}
                    </Tag>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}
