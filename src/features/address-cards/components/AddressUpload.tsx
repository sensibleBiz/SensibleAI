import { FileSpreadsheet, LoaderCircle, UploadCloud } from "lucide-react";

interface AddressUploadProps {
  fileName?: string;
  isImporting: boolean;
  onFileSelected: (file: File) => void;
}

export default function AddressUpload({
  fileName,
  isImporting,
  onFileSelected,
}: AddressUploadProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <label
        htmlFor="address-excel-upload"
        className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-within:ring-2 focus-within:ring-blue-300 ${
          isImporting ? "cursor-wait opacity-70" : ""
        }`}
      >
        {isImporting ? (
          <LoaderCircle className="animate-spin" size={17} />
        ) : (
          <UploadCloud size={17} />
        )}
        {isImporting ? "Importing..." : "Import Excel"}
      </label>
      {fileName && (
        <span className="inline-flex min-w-0 items-center gap-2 text-sm text-slate-600">
          <FileSpreadsheet className="shrink-0 text-emerald-600" size={17} />
          <span className="max-w-64 truncate" title={fileName}>
            {fileName}
          </span>
        </span>
      )}
      <input
        id="address-excel-upload"
        type="file"
        className="sr-only"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        disabled={isImporting}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFileSelected(file);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
