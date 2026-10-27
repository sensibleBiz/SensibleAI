import { useCallback, useMemo, useState } from "react";
import "@fontsource/montserrat/latin-600.css";
import "@fontsource/montserrat/latin-700.css";
import {
  Download,
  FileDown,
  FileSpreadsheet,
  Files,
  Printer,
  RotateCcw,
  Settings2,
} from "lucide-react";
import AddressPrintPages from "@/features/address-cards/components/AddressPrintPages";
import AddressCardEditModal from "@/features/address-cards/components/AddressCardEditModal";
import AddressImportMappingModal from "@/features/address-cards/components/AddressImportMappingModal";
import AddressUpload from "@/features/address-cards/components/AddressUpload";
import type {
  AddressCardSettings,
  AddressRecord,
} from "@/features/address-cards/components/types";
import { useMessageApi } from "@/shared/hooks";
import {
  AddressImportError,
  analyzeAddressWorkbook,
  downloadAddressExcelTemplate,
  type AddressWorkbookSession,
  type AddressWorksheetAnalysis,
} from "@/features/address-cards/utils/addressExcel";
import {
  DEFAULT_ADDRESS_CARD_SETTINGS,
  getAddressPageCount,
} from "@/features/address-cards/utils/addressCards";
import { downloadAddressCardsPdf } from "@/features/address-cards/utils/addressPdf";
import "@/features/address-cards/styles/address-print.css";

// Brand palette — kept consistent with the other CRM report pages
const BRAND_NAVY = "#0a3750";
const BRAND_RED = "#ff3228";

function ActionButton({
  children,
  disabled,
  onClick,
  primary = false,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-[#0a3750]/30 disabled:cursor-not-allowed disabled:opacity-45 ${
        primary
          ? "bg-[#ff3228] text-white hover:bg-[#e62a1f]"
          : "border border-slate-300 bg-white text-slate-700 hover:border-[#0a3750] hover:text-[#0a3750]"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 backdrop-blur-sm">
      <span className="text-red-200">{icon}</span>
      <div className="leading-tight">
        <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-300">
          {label}
        </span>
        <span className="block text-base font-bold text-white">{value}</span>
      </div>
    </div>
  );
}

export default function AddressCardPrint() {
  const messageApi = useMessageApi();
  const [addresses, setAddresses] = useState<AddressRecord[]>([]);
  const [pendingWorkbook, setPendingWorkbook] =
    useState<AddressWorkbookSession | null>(null);
  const [settings, setSettings] = useState<AddressCardSettings>(
    DEFAULT_ADDRESS_CARD_SETTINGS,
  );
  const [fileName, setFileName] = useState("");
  const [importError, setImportError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);

  const selectedAddresses = useMemo(
    () => addresses.filter((address) => address.selected),
    [addresses],
  );
  const editingAddress = useMemo(
    () => addresses.find((address) => address.id === editingAddressId) || null,
    [addresses, editingAddressId],
  );
  const totalPages = getAddressPageCount(selectedAddresses.length);

  const updateSetting = <Key extends keyof AddressCardSettings>(
    key: Key,
    value: AddressCardSettings[Key],
  ) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const handleFileSelected = useCallback(
    async (file: File) => {
      setIsImporting(true);
      setImportError("");

      try {
        const session = await analyzeAddressWorkbook(file);
        setPendingWorkbook(session);
        setFileName(file.name);
        messageApi.info("Workbook analyzed. Review the detected mapping before importing.");
      } catch (error) {
        console.error("Address Excel import failed", error);
        const message =
          error instanceof AddressImportError
            ? error.message
            : "The Excel file could not be read. Check the file and try again.";
        setImportError(message);
        messageApi.error(message);
      } finally {
        setIsImporting(false);
      }
    },
    [messageApi],
  );

  const handleMappedImport = (
    records: AddressRecord[],
    analysis: AddressWorksheetAnalysis,
  ) => {
    setAddresses(records);
    setPendingWorkbook(null);
    setEditingAddressId(null);
    setImportError("");
    const selectedCount = records.filter((record) => record.selected).length;
    messageApi.success(
      `Imported ${records.length} row${records.length === 1 ? "" : "s"} from ${analysis.worksheetName}; ${selectedCount} card${selectedCount === 1 ? "" : "s"} generated for printing.`,
    );
  };

  const clearAll = () => {
    setAddresses([]);
    setPendingWorkbook(null);
    setEditingAddressId(null);
    setFileName("");
    setImportError("");
    messageApi.success("All imported address records were cleared.");
  };

  const handleDeleteAddress = useCallback(
    (address: AddressRecord) => {
      const label = address.company || address.name || "this card";
      if (!window.confirm(`Delete the address card for ${label}?`)) return;

      setAddresses((current) =>
        current.filter((currentAddress) => currentAddress.id !== address.id),
      );
      setEditingAddressId((currentId) =>
        currentId === address.id ? null : currentId,
      );
      messageApi.success(`Deleted the address card for ${label}.`);
    },
    [messageApi],
  );

  const handleSaveAddress = useCallback(
    (updatedAddress: AddressRecord) => {
      setAddresses((current) =>
        current.map((address) =>
          address.id === updatedAddress.id ? updatedAddress : address,
        ),
      );
      setEditingAddressId(null);
      messageApi.success("Address card updated.");
    },
    [messageApi],
  );

  const handlePrint = () => {
    if (!selectedAddresses.length) {
      messageApi.warning("Select at least one address card before printing.");
      return;
    }

    window.print();
  };

  const handlePdfDownload = async () => {
    if (!selectedAddresses.length) {
      messageApi.warning("Select at least one address card before downloading a PDF.");
      return;
    }

    setIsDownloadingPdf(true);
    try {
      await Promise.resolve();
      downloadAddressCardsPdf(selectedAddresses, settings);
      messageApi.success("Address cards PDF downloaded.");
    } catch (error) {
      console.error("Address card PDF generation failed", error);
      messageApi.error("The PDF could not be generated. Please try again.");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleTemplateDownload = async () => {
    try {
      await downloadAddressExcelTemplate();
      messageApi.success("Excel template downloaded.");
    } catch (error) {
      console.error("Address Excel template generation failed", error);
      messageApi.error("The Excel template could not be generated.");
    }
  };

  return (
    <main className="address-card-print-page min-w-0 space-y-4">
      <style media="print">
        {"@page { size: A4 portrait; margin: 0; }"}
      </style>

      {/* Standard Header matching other CRM pages */}
      <header
        className="no-print overflow-hidden rounded-xl shadow-sm text-white"
        style={{ background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, #124a6b 100%)` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
            >
              <Printer size={18} style={{ color: BRAND_RED }} />
            </div>
            <div>
              <h2 className="mb-0.5 text-xl font-semibold text-white">
                Address Card Printing
              </h2>
              <p className="mb-0 text-sm text-slate-200">
                Import delivery addresses, edit and select recipients, then print cards or download an A4 PDF.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Stat icon={<Files size={16} />} label="Total cards" value={addresses.length} />
            <Stat
              icon={<FileSpreadsheet size={16} />}
              label="Selected"
              value={selectedAddresses.length}
            />
            <Stat icon={<FileDown size={16} />} label="A4 pages" value={totalPages} />
          </div>
        </div>
      </header>

      <section className="no-print space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <ActionButton
              primary
              disabled={!selectedAddresses.length}
              onClick={handlePrint}
            >
              <Printer size={17} /> Print Cards
            </ActionButton>
            <ActionButton
              disabled={!selectedAddresses.length || isDownloadingPdf}
              onClick={handlePdfDownload}
            >
              <Download size={17} />
              {isDownloadingPdf ? "Generating PDF..." : "Download PDF"}
            </ActionButton>
            <ActionButton disabled={!addresses.length} onClick={clearAll}>
              <RotateCcw size={17} /> Clear All
            </ActionButton>
          </div>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
            <AddressUpload
              fileName={fileName}
              isImporting={isImporting}
              onFileSelected={handleFileSelected}
            />
            <ActionButton onClick={handleTemplateDownload}>
              <Download size={16} /> Download Template
            </ActionButton>
            <button
              type="button"
              aria-expanded={isSettingsOpen}
              aria-controls="address-card-settings"
              onClick={() => setIsSettingsOpen((current) => !current)}
              className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-[#0a3750]/30 ${
                isSettingsOpen
                  ? "border-[#0a3750] bg-[#0a3750]/5 text-[#0a3750]"
                  : "border-slate-300 bg-white text-slate-700 hover:border-[#0a3750] hover:text-[#0a3750]"
              }`}
            >
              <Settings2 size={17} />
              Card Settings
            </button>
          </div>
          {importError && (
            <div role="alert" className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {importError}
            </div>
          )}
        </div>

        {isSettingsOpen && (
          <div
            id="address-card-settings"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
          >
          <div className="mb-5 flex items-center gap-2">
            <span className="inline-flex size-9 items-center justify-center rounded-lg bg-[#0a3750]/8 text-[#0a3750]">
              <Settings2 size={18} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Card settings</h2>
              <p className="text-sm text-slate-500">Applied to preview, print and PDF.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={settings.showMobile}
                onChange={(event) => updateSetting("showMobile", event.target.checked)}
                className="size-4 rounded border-slate-300 text-[#0a3750] focus:ring-[#0a3750]/40"
              />
              Show mobile number
            </label>
            <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={settings.showBorder}
                onChange={(event) => updateSetting("showBorder", event.target.checked)}
                className="size-4 rounded border-slate-300 text-[#0a3750] focus:ring-[#0a3750]/40"
              />
              Show cutting border
            </label>

            <label className="block text-sm font-medium text-slate-700">
              <span className="mb-2 flex justify-between gap-3">
                <span>Font size</span>
                <span className="font-semibold text-[#0a3750]">
                  {settings.fontSize} pt
                </span>
              </span>
              <input
                type="range"
                min="7"
                max="14"
                step="0.5"
                value={settings.fontSize}
                onChange={(event) =>
                  updateSetting("fontSize", Number(event.target.value))
                }
                className="w-full accent-[#0a3750]"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              <span className="mb-2 flex justify-between gap-3">
                <span>Card padding</span>
                <span className="font-semibold text-[#0a3750]">
                  {settings.paddingMm} mm
                </span>
              </span>
              <input
                type="range"
                min="2"
                max="8"
                step="0.5"
                value={settings.paddingMm}
                onChange={(event) =>
                  updateSetting("paddingMm", Number(event.target.value))
                }
                className="w-full accent-[#0a3750]"
              />
            </label>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3 rounded-xl bg-slate-50 px-4 py-4 text-xs text-slate-600">
            <span>
              <strong className="block text-slate-900">A4 Portrait</strong>
              210 × 297 mm
            </span>
            <span>
              <strong className="block text-slate-900">10 cards</strong>
              2 columns × 5 rows
            </span>
            <span>
              <strong className="block text-slate-900">92 × 52 mm</strong>
              Card size
            </span>
            <span>
              <strong className="block text-slate-900">10 mm</strong>
              Page margins
            </span>
            <span>
              <strong className="block text-slate-900">5 mm</strong>
              Grid gap
            </span>
            <span>
              <strong className="block text-slate-900">8.5 pt / 5 mm</strong>
              Default font / padding
            </span>
          </div>
        </div>
        )}
      </section>

      <section aria-labelledby="address-preview-heading">
        <div className="no-print mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="address-preview-heading" className="text-lg font-semibold text-slate-900">
              Print preview
            </h2>
            <p className="text-sm text-slate-500">
              Imported records appear directly below, with up to 10 generated cards per A4 page.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="text-sm text-slate-500">
              {selectedAddresses.length} generated {selectedAddresses.length === 1 ? "card" : "cards"} · {totalPages} A4 {totalPages === 1 ? "page" : "pages"}
            </span>
            {selectedAddresses.length > 0 && (
              <span className="rounded-full bg-[#0a3750]/8 px-3 py-1 text-xs font-semibold text-[#0a3750]">
                A4 Portrait · 2 × 5
              </span>
            )}
          </div>
        </div>
        <div className="address-preview-viewport">
          <AddressPrintPages
            addresses={selectedAddresses}
            settings={settings}
            onDeleteAddress={handleDeleteAddress}
            onEditAddress={(address) => setEditingAddressId(address.id)}
          />
        </div>
      </section>

      {editingAddress && (
        <AddressCardEditModal
          key={editingAddress.id}
          address={editingAddress}
          settings={settings}
          onCancel={() => setEditingAddressId(null)}
          onSave={handleSaveAddress}
        />
      )}

      {pendingWorkbook && (
        <AddressImportMappingModal
          key={`${pendingWorkbook.fileName}-${pendingWorkbook.suggestedWorksheetName}`}
          session={pendingWorkbook}
          open
          onCancel={() => setPendingWorkbook(null)}
          onImport={handleMappedImport}
        />
      )}
    </main>
  );
}