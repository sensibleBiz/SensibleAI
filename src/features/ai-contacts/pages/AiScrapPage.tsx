import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Building2,
  Check,
  Database,
  Download,
  Hash,
  LoaderCircle,
  Pencil,
  Play,
  RefreshCw,
  Search,
  Terminal,
  Trash2,
  X,
  AlertCircle,
  MapPin,
  Tag,
} from "lucide-react";
import type { RootState } from "@/app/store";
import { useMessageApi } from "@/shared/hooks";
import {
  contactService,
  type OutletContactKeyword,
} from "@/features/customers";
import { exportToExcel, type TableColumn } from "@/shared/utils/fileExport";
import "./AiScrapPage.css";

const contactExportColumns: TableColumn<OutletContactKeyword>[] = [
  { title: "Keyword", dataIndex: "keyword", width: 30 },
  { title: "Category", dataIndex: "category", width: 20 },
  { title: "City", dataIndex: "city", width: 18 },
  { title: "Contact Limit", dataIndex: "contactLimit", width: 14 },
  {
    title: "Status",
    dataIndex: "status",
    width: 14,
    formatter: (val) => (val ? String(val).toUpperCase() : "PENDING"),
  },
  {
    title: "Contacts Received",
    dataIndex: "contactsCount",
    width: 18,
    formatter: (val) => String(Number(val) || 0),
  },
  {
    title: "Created At",
    dataIndex: "createdAt",
    width: 24,
    formatter: (val) => (val ? new Date(Number(val)).toLocaleString() : "-"),
  },
  {
    title: "Updated At",
    dataIndex: "updatedAt",
    width: 24,
    formatter: (val) => (val ? new Date(Number(val)).toLocaleString() : "-"),
  },
];

const ROWS_PER_PAGE = 10;
const PRESET_LIMITS = [100, 200, 500];

const parseKeywordsFromInput = (raw: string): string[] => {
  return raw
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

export default function AiScrapPage() {
  const outletInfo = useSelector(
    (state: RootState) => state?.appState?.outletInfo
  );
  const outletId = outletInfo?.id || "";
  const outletName = outletInfo?.name || "";
  const messageApi = useMessageApi();

  // Form State
  const [city, setCity] = useState(outletInfo?.city || "");
  const [category, setCategory] = useState(outletInfo?.branch || "");
  const [contactLimit, setContactLimit] = useState<number>(100);
  const [keywordsInput, setKeywordsInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState("");

  // Firestore Contact Keywords Data
  const [keywordsList, setKeywordsList] = useState<OutletContactKeyword[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Table Search and Pagination
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);

  // Inline Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editKeyword, setEditKeyword] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editContactLimit, setEditContactLimit] = useState<number>(100);
  const [isUpdating, setIsUpdating] = useState(false);

  // Activity Run Logs
  const [runLogs, setRunLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setRunLogs((prev) => [`[${timestamp}] ${msg}`, ...prev.slice(0, 49)]);
  };

  // Keep city in sync with selected outlet if not customized
  useEffect(() => {
    if (outletInfo?.city && !city) {
      setCity(outletInfo.city);
    }
  }, [outletInfo?.city, city]);

  // Real-time Firestore subscription for the currently selected outlet
  useEffect(() => {
    if (!outletId) {
      setKeywordsList([]);
      setIsLoading(false);
      addLog("No active outlet selected. Please select an outlet to view contacts.");
      return;
    }

    setIsLoading(true);
    addLog(`Subscribing to OUTLET/${outletId}/ContactKeyword in Firestore...`);

    const unsubscribe = contactService.subscribeToOutletKeywords(
      outletId,
      (data) => {
        setKeywordsList(data);
        setIsLoading(false);
        addLog(`Loaded ${data.length} contact keyword(s) for outlet: ${outletName || outletId}`);
      },
      (error) => {
        setIsLoading(false);
        addLog(`Firestore subscription error: ${error}`);
        messageApi.error("Failed to load contacts for this outlet");
      }
    );

    return () => {
      unsubscribe();
    };
  }, [outletId, outletName, messageApi]);

  // Parsed keywords for submission
  const parsedKeywords = useMemo(
    () => parseKeywordsFromInput(keywordsInput),
    [keywordsInput]
  );

  // Submit Handler: Saves keywords in a dynamic loop into OUTLET/{outletId}/ContactKeyword
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!outletId) {
      messageApi.error("Please select an active outlet first.");
      setFormMessage("Error: No active outlet selected.");
      return;
    }

    if (parsedKeywords.length === 0) {
      messageApi.warning("Please enter at least one keyword to generate contacts.");
      setFormMessage("Please enter at least one keyword.");
      return;
    }

    setIsSubmitting(true);
    setFormMessage(`Storing ${parsedKeywords.length} keyword(s) with limit ${contactLimit}...`);
    addLog(
      `Saving ${parsedKeywords.length} keyword(s) (limit: ${contactLimit}) in single document for outlet "${outletName}"...`
    );

    try {
      const result = await contactService.addKeywordsInLoop(
        outletId,
        parsedKeywords,
        {
          city: city.trim(),
          category: category.trim(),
          contactLimit: contactLimit > 0 ? contactLimit : 100,
          outletName,
        }
      );

      const savedCount = result.saved.length;
      const errorCount = result.errors.length;

      let msg = "";
      if (savedCount > 0) {
        msg += `Saved ${savedCount} contact keyword(s) in document. `;
        messageApi.success(
          `Successfully saved ${savedCount} keyword(s) in document for ${outletName || "outlet"}. Ready to receive and send contacts.`
        );
        addLog(`Stored ${savedCount} keyword(s) in document (array & map): ${result.saved.join(", ")}`);
        setKeywordsInput("");
      }

      if (errorCount > 0) {
        msg += `Failed: ${errorCount}. `;
        messageApi.error(`Error saving keywords: ${result.errors.join("; ")}`);
        addLog(`Errors encountered: ${result.errors.join("; ")}`);
      }

      setFormMessage(msg.trim());
    } catch (err) {
      const errorText = err instanceof Error ? err.message : "Unknown error";
      messageApi.error(`Failed to save contacts: ${errorText}`);
      setFormMessage(`Error: ${errorText}`);
      addLog(`Save contacts failed: ${errorText}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Inline Edit Handlers
  const handleStartEdit = (item: OutletContactKeyword) => {
    setEditingId(item.id || null);
    setEditKeyword(
      item.keywordList && item.keywordList.length > 0
        ? item.keywordList.join("\n")
        : item.keyword || Object.values(item.keywords || {}).join("\n")
    );
    setEditCategory(item.category || "");
    setEditCity(item.city || "");
    setEditContactLimit(item.contactLimit || 100);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditKeyword("");
    setEditCategory("");
    setEditCity("");
    setEditContactLimit(100);
  };

  const handleSaveEdit = async (contactId: string) => {
    if (!outletId || !contactId) return;

    const trimmed = editKeyword.trim();
    if (!trimmed) {
      messageApi.warning("Keyword cannot be empty.");
      return;
    }

    setIsUpdating(true);
    try {
      const res = await contactService.updateKeyword(
        outletId,
        contactId,
        trimmed,
        {
          city: editCity.trim(),
          category: editCategory.trim(),
          contactLimit: editContactLimit > 0 ? editContactLimit : 100,
        }
      );

      if (res.data) {
        messageApi.success(`Keyword updated to "${trimmed}".`);
        addLog(`Updated keyword ${contactId} to "${trimmed}"`);
        handleCancelEdit();
      } else if (res.error) {
        messageApi.error(res.error);
        addLog(`Update failed: ${res.error}`);
      }
    } catch (err) {
      const errorText = err instanceof Error ? err.message : "Unknown error";
      messageApi.error(`Update failed: ${errorText}`);
    } finally {
      setIsUpdating(false);
    }
  };

  // Delete Handler
  const handleDelete = async (item: OutletContactKeyword) => {
    if (!outletId || !item.id) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete this keyword batch ("${item.keyword}") from this outlet?`
    );
    if (!confirmed) return;

    try {
      const res = await contactService.deleteKeyword(outletId, item.id);
      if (res.data) {
        messageApi.success(`Keyword "${item.keyword}" deleted successfully.`);
        addLog(`Deleted keyword "${item.keyword}" from outlet ${outletName}`);
      } else if (res.error) {
        messageApi.error(res.error);
      }
    } catch (err) {
      const errorText = err instanceof Error ? err.message : "Unknown error";
      messageApi.error(`Failed to delete keyword: ${errorText}`);
    }
  };

  // Excel Download Handler
  const handleDownloadExcel = () => {
    if (filteredRows.length === 0) {
      messageApi.warning("No contact keywords available to export.");
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const safeOutlet = (outletName || "outlet").replace(/[^a-zA-Z0-9_-]/g, "_");
    exportToExcel(
      filteredRows,
      contactExportColumns,
      `${safeOutlet}_contact_keywords_${today}.xlsx`,
      "Contact Keywords"
    );
    addLog(`Exported ${filteredRows.length} contact keyword(s) to Excel.`);
    messageApi.success(`Exported ${filteredRows.length} contact keyword(s) to Excel.`);
  };

  // Filtered rows by search term
  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return keywordsList;

    return keywordsList.filter((item) => {
      const matchKeyword = item.keyword?.toLowerCase().includes(query);
      const matchCity = item.city?.toLowerCase().includes(query);
      const matchCategory = item.category?.toLowerCase().includes(query);
      const matchStatus = String(item.status || "").toLowerCase().includes(query);
      return matchKeyword || matchCity || matchCategory || matchStatus;
    });
  }, [keywordsList, searchTerm]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const visibleRows = filteredRows.slice(
    (safePage - 1) * ROWS_PER_PAGE,
    safePage * ROWS_PER_PAGE
  );

  return (
    <div className="ai-scrap-page">
      {/* Left Configuration Sidebar */}
      <aside className="ai-scrap-config">
        <div className="ai-scrap-brand">
          <div className="ai-scrap-brand-mark" aria-hidden="true">
            <Bot size={22} />
          </div>
          <div>
            <span>Workspace</span>
            <strong>AI Contact Generator</strong>
          </div>
        </div>

        <div className="ai-scrap-sidebar-heading">
          <div>
            <span className="ai-scrap-kicker">Outlet Storage</span>
            <h2>Generate Contacts</h2>
          </div>
          {outletId && (
            <span className="ai-scrap-outlet-indicator" title={`Outlet ID: ${outletId}`}>
              <Building2 size={13} />
              {outletName || "Active Outlet"}
            </span>
          )}
        </div>

        {!outletId && (
          <div className="ai-scrap-outlet-warning" role="alert">
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>No Outlet Selected</strong>
              <p style={{ margin: "4px 0 0", fontSize: 12 }}>
                Please select an outlet from the top navigation bar. Contacts will be stored under <code>OUTLET/&#123;outletId&#125;/ContactKeyword</code>.
              </p>
            </div>
          </div>
        )}

        <form className="ai-scrap-form" onSubmit={handleSubmit}>
          <label className="ai-scrap-field">
            <span>City (Optional)</span>
            <input
              maxLength={100}
              placeholder="e.g. Bengaluru, Mumbai"
              type="text"
              value={city}
              onChange={(event) => setCity(event.target.value)}
            />
          </label>

          <label className="ai-scrap-field">
            <span>Category (Optional)</span>
            <input
              maxLength={100}
              placeholder="e.g. Retail, Restaurant, IT Service"
              type="text"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />
          </label>

          {/* Contact Limit Input with 100, 200, or any option */}
          <label className="ai-scrap-field">
            <span>Contact Limit</span>
            <input
              max={50000}
              min={1}
              placeholder="Enter limit e.g. 100, 200, 500"
              required
              type="number"
              value={contactLimit || ""}
              onChange={(event) =>
                setContactLimit(Math.max(1, Number(event.target.value) || 1))
              }
            />
            <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
              {PRESET_LIMITS.map((preset) => (
                <button
                  key={preset}
                  className={`ai-scrap-limit-chip ${contactLimit === preset ? "active" : ""}`}
                  type="button"
                  onClick={() => setContactLimit(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
            <small>Choose 100, 200, 500, or type any custom limit</small>
          </label>

          <label className="ai-scrap-field">
            <span>Keywords</span>
            <small>One keyword per line or comma-separated. Stored in one document in array and map.</small>
            <textarea
              placeholder="retail billing software&#10;pos machine dealers&#10;barcode scanner shops"
              required
              rows={5}
              value={keywordsInput}
              onChange={(event) => setKeywordsInput(event.target.value)}
            />
          </label>

          <div className="ai-scrap-run-summary">
            <span>Keywords count</span>
            <strong>{parsedKeywords.length}</strong>
          </div>

          <button
            className="ai-scrap-primary-button"
            disabled={isSubmitting || !outletId || parsedKeywords.length === 0}
            type="submit"
          >
            {isSubmitting ? (
              <LoaderCircle className="ai-scrap-spin" size={17} />
            ) : (
              <Play size={17} fill="currentColor" />
            )}
            <span>
              {isSubmitting ? "Generating contacts..." : "Generate Contact"}
            </span>
          </button>

          {formMessage && (
            <p className="ai-scrap-form-message" role="alert">
              {formMessage}
            </p>
          )}
        </form>

        {/* Quick Outlet Contacts Summary in Sidebar */}
        <div className="ai-scrap-keywords-card" style={{ marginTop: 16 }}>
          <div className="ai-scrap-keywords-header">
            <span>Generated Contacts</span>
            <span className="ai-scrap-keywords-count">{keywordsList.length}</span>
          </div>
          <div className="ai-scrap-keywords-list">
            {keywordsList.length === 0 ? (
              <small style={{ color: "#7a879b", padding: "8px 0" }}>
                {isLoading ? "Loading contacts..." : "No contacts generated yet."}
              </small>
            ) : (
              keywordsList.slice(0, 5).map((item) => (
                <div key={item.id} className="ai-scrap-keyword-item">
                  <span className="ai-scrap-keyword-text" title={item.keyword}>
                    {item.keyword}
                  </span>
                  <span className="ai-scrap-keyword-meta">
                    {item.contactLimit ? `${item.contactLimit} limit` : item.city || ""}
                  </span>
                </div>
              ))
            )}
            {keywordsList.length > 5 && (
              <small style={{ color: "#2354a6", textAlign: "center" }}>
                +{keywordsList.length - 5} more in table
              </small>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="ai-scrap-main">
        <header className="ai-scrap-topbar">
          <div>
            <span className="ai-scrap-kicker">AI Contact Engine</span>
            <h1>Outlet Contacts Overview</h1>
            <p>
              Contacts stored dynamically in Firestore under{" "}
              <code>OUTLET/{outletId || "outletId"}/ContactKeyword</code>.
            </p>
          </div>
          <div
            className="ai-scrap-status-pill"
            data-state={isLoading ? "running" : "complete"}
          >
            <span aria-hidden="true" />
            <strong>
              {isLoading ? "Syncing..." : `${keywordsList.length} Synced`}
            </strong>
          </div>
        </header>

        {/* Outlet Status Panel */}
        <section className="ai-scrap-run-panel" aria-labelledby="outlet-panel-title">
          <div className="ai-scrap-run-copy">
            <div className="ai-scrap-run-icon" aria-hidden="true">
              {isLoading ? (
                <LoaderCircle className="ai-scrap-spin" size={28} />
              ) : (
                <Database size={28} />
              )}
            </div>
            <div>
              <span className="ai-scrap-kicker">Active Outlet Context</span>
              <h2 id="outlet-panel-title">
                {outletName || "No Outlet Selected"}
              </h2>
              <p>
                {outletId
                  ? `Outlet ID: ${outletId} · Subcollection: OUTLET/${outletId}/ContactKeyword · Batches: ${keywordsList.length}`
                  : "Please select an outlet from the top header to manage contacts."}
              </p>
            </div>
          </div>
          <div className="ai-scrap-progress-wrap">
            <div className="ai-scrap-progress-labels">
              <span>Firestore Sync</span>
              <strong>{isLoading ? "Syncing" : "Connected"}</strong>
            </div>
            <progress
              max={100}
              value={isLoading ? 50 : 100}
            >
              {isLoading ? "Syncing" : "100%"}
            </progress>
          </div>
        </section>

        {/* Dataset Summary Cards */}
        <section className="ai-scrap-dataset-section">
          <div className="ai-scrap-section-title-row">
            <div>
              <span className="ai-scrap-kicker">Data Breakdown</span>
              <h2>Outlet Collection Metrics</h2>
            </div>
            <button
              className="ai-scrap-secondary-button"
              type="button"
              onClick={() => {
                addLog("Refreshed outlet contacts view.");
                messageApi.info("Contacts are synchronized in real-time.");
              }}
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>

          <div className="ai-scrap-dataset-cards">
            <div className="ai-scrap-dataset-card active">
              <span className="ai-scrap-file-icon latest" aria-hidden="true">
                DB
              </span>
              <span className="ai-scrap-dataset-copy">
                <span>Keyword Batches</span>
                <strong>{keywordsList.length} Documents</strong>
                <small>Collection: OUTLET/{outletId || "outletId"}/ContactKeyword</small>
              </span>
              <span className="ai-scrap-new-badge">Live</span>
            </div>

            <div className="ai-scrap-dataset-card">
              <span className="ai-scrap-file-icon previous" aria-hidden="true">
                XLS
              </span>
              <span className="ai-scrap-dataset-copy">
                <span>Search / Filtered</span>
                <strong>{filteredRows.length} Matches</strong>
                <small>{searchTerm ? `Filter: "${searchTerm}"` : "Showing all"}</small>
              </span>
            </div>
          </div>
        </section>

        {/* Table Panel */}
        <section className="ai-scrap-table-panel">
          <div className="ai-scrap-table-toolbar">
            <div>
              <div className="ai-scrap-table-title-line">
                <h2>Generated Contacts</h2>
                <span>{filteredRows.length} records</span>
              </div>
              <p>
                Search, filter, view limit, edit, or delete contact records for this outlet
              </p>
            </div>
            <div className="ai-scrap-toolbar-actions">
              <label className="ai-scrap-search-box">
                <Search size={16} />
                <span className="ai-scrap-sr-only">Search contacts</span>
                <input
                  placeholder="Search keyword, category, city..."
                  type="search"
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <button
                className="ai-scrap-download-button"
                disabled={filteredRows.length === 0}
                type="button"
                onClick={handleDownloadExcel}
              >
                <Download size={16} />
                Download Excel
              </button>
            </div>
          </div>

          <div className="ai-scrap-table-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "26%" }}>Keyword</th>
                  <th style={{ width: "14%" }}>Category</th>
                  <th style={{ width: "14%" }}>City</th>
                  <th style={{ width: "10%" }}>Limit</th>
                  <th style={{ width: "16%" }}>Status</th>
                  <th style={{ width: "12%" }}>Created Date</th>
                  <th style={{ width: "8%", textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td className="ai-scrap-empty-cell" colSpan={7}>
                      <span className="ai-scrap-table-loader">
                        <LoaderCircle className="ai-scrap-spin" size={22} />
                        Loading contacts for {outletName || "outlet"} from Firestore...
                      </span>
                    </td>
                  </tr>
                ) : !outletId ? (
                  <tr>
                    <td className="ai-scrap-empty-cell" colSpan={7}>
                      Please select an outlet from the top header to view its contacts.
                    </td>
                  </tr>
                ) : visibleRows.length > 0 ? (
                  visibleRows.map((row) => {
                    const isEditing = editingId === row.id;

                    return (
                      <tr key={row.id || row.keyword}>
                        <td>
                          {isEditing ? (
                            <textarea
                              className="ai-scrap-table-input"
                              placeholder="One keyword per line or comma-separated"
                              rows={Math.min(
                                5,
                                Math.max(2, editKeyword.split("\n").length)
                              )}
                              value={editKeyword}
                              onChange={(e) => setEditKeyword(e.target.value)}
                            />
                          ) : (
                            <span className="ai-scrap-company-cell">
                              <Database size={15} color="#2354a6" />
                              <span className="ai-scrap-keyword-map">
                                {row.keywordList && row.keywordList.length > 0
                                  ? row.keywordList.join(", ")
                                  : row.keyword || Object.values(row.keywords || {}).join(", ")}
                              </span>
                            </span>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              className="ai-scrap-table-input"
                              placeholder="Category..."
                              type="text"
                              value={editCategory}
                              onChange={(e) => setEditCategory(e.target.value)}
                            />
                          ) : row.category ? (
                            <span className="ai-scrap-badge-category">
                              <Tag size={11} style={{ marginRight: 4, display: "inline" }} />
                              {row.category}
                            </span>
                          ) : (
                            <span style={{ color: "#a0aec0" }}>—</span>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              className="ai-scrap-table-input"
                              placeholder="City..."
                              type="text"
                              value={editCity}
                              onChange={(e) => setEditCity(e.target.value)}
                            />
                          ) : row.city ? (
                            <span className="ai-scrap-badge-city">
                              <MapPin size={11} />
                              {row.city}
                            </span>
                          ) : (
                            <span style={{ color: "#a0aec0" }}>—</span>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              className="ai-scrap-table-input"
                              max={50000}
                              min={1}
                              placeholder="Limit..."
                              style={{ width: 80 }}
                              type="number"
                              value={editContactLimit}
                              onChange={(e) =>
                                setEditContactLimit(Math.max(1, Number(e.target.value) || 1))
                              }
                            />
                          ) : (
                            <span className="ai-scrap-badge-limit">
                              <Hash size={11} />
                              {row.contactLimit || 100}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`ai-scrap-badge-status ${row.status || "pending"}`}>
                            <span className="status-dot" />
                            {row.status === "completed"
                              ? `Completed (${row.contactsCount || 0})`
                              : row.status === "processing"
                              ? "Processing..."
                              : row.status === "failed"
                              ? "Failed"
                              : "Pending"}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: 12, color: "#607089" }}>
                            {row.createdAt
                              ? new Date(row.createdAt).toLocaleDateString(undefined, {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <div className="ai-scrap-actions-cell" style={{ justifyContent: "center" }}>
                            {isEditing ? (
                              <>
                                <button
                                  className="ai-scrap-icon-button"
                                  disabled={isUpdating}
                                  title="Save Changes"
                                  type="button"
                                  onClick={() => handleSaveEdit(row.id!)}
                                >
                                  {isUpdating ? (
                                    <LoaderCircle className="ai-scrap-spin" size={14} />
                                  ) : (
                                    <Check size={14} color="#16a34a" />
                                  )}
                                </button>
                                <button
                                  className="ai-scrap-icon-button danger"
                                  disabled={isUpdating}
                                  title="Cancel Edit"
                                  type="button"
                                  onClick={handleCancelEdit}
                                >
                                  <X size={14} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  className="ai-scrap-icon-button"
                                  title="Edit Record"
                                  type="button"
                                  onClick={() => handleStartEdit(row)}
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  className="ai-scrap-icon-button danger"
                                  title="Delete Record"
                                  type="button"
                                  onClick={() => handleDelete(row)}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="ai-scrap-empty-cell" colSpan={7}>
                      {keywordsList.length === 0
                        ? `No contact records stored for "${outletName}". Enter keywords and click Generate Contact on the left.`
                        : "No records match the current search filter."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="ai-scrap-table-footer">
            <span>
              Showing {visibleRows.length} of {filteredRows.length} records
            </span>
            <div className="ai-scrap-pagination">
              <button
                aria-label="Previous page"
                disabled={safePage <= 1}
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ArrowLeft size={16} />
              </button>
              <span>
                Page {safePage} of {totalPages}
              </span>
              <button
                aria-label="Next page"
                disabled={safePage >= totalPages}
                type="button"
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
              >
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </section>

        {/* Activity Run Log Panel */}
        <details className="ai-scrap-log-panel">
          <summary>
            <span>
              <Terminal size={16} />
              Live Activity Log
            </span>
            <span>{runLogs.length} events</span>
          </summary>
          <div className="ai-scrap-log-output">
            {runLogs.length > 0 ? (
              runLogs.map((log, index) => <div key={index}>{log}</div>)
            ) : (
              <div>No activity logged yet.</div>
            )}
          </div>
        </details>
      </main>

      {/* Submitting Toast Indicator */}
      {isSubmitting && (
        <div className="ai-scrap-toast" role="status" aria-live="polite">
          <LoaderCircle className="ai-scrap-spin" size={16} />
          Saving keyword map to Firestore...
        </div>
      )}
    </div>
  );
}
