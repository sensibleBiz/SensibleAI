import { useEffect, useState, useMemo, useRef } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  LoaderCircle,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { setBusinessConfiguration } from "@/app/store/appStateSlice";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { RootState } from "@/app/store";
import { ROUTES_PATHS } from "@/shared/lib/constants";
import { resolveCrmVertical } from "@/shared/hooks";
import { VERTICAL_TERMINOLOGY } from "@/features/leads";
import { businessConfigurationApi, type BusinessConfigurationStatus } from "../api/businessConfigurationApi";
import { finishWorkspaceSetup, shouldSkipSetup } from "../setupNavigation";
import { COUNTRIES, getCountryConfig } from "@/shared/lib/localization";

const BUSINESS_MODELS = [
  { value: "b2b", label: "Business to business (B2B)", description: "Sell products or services to companies. Deals, RFQs, account hierarchy." },
  { value: "b2c", label: "Business to consumer (B2C)", description: "Sell directly to consumers. High volume, retail inquiries, instant deals." },
  { value: "hybrid", label: "Hybrid (B2B + B2C)", description: "Unified wholesale distribution and direct consumer engagement." },
] as const;

const VERTICALS = [
  { value: "exports", label: "Exports & Global Trade", icon: "🚢", description: "Incoterms, container logistics, foreign currencies, EXIM OS." },
  { value: "manufacturing", label: "Manufacturing & B2B", icon: "🏭", description: "Dealer networks, custom quotes, bill of materials, RFQs." },
  { value: "retail", label: "Retail & Distribution", icon: "🏪", description: "Products, stores, dealer networks and distributors." },
  { value: "real_estate", label: "Real Estate", icon: "🏢", description: "Property enquiries, project launches and site visits." },
  { value: "automotive", label: "Automotive", icon: "🚗", description: "Vehicle inventory, service bookings and test drives." },
  { value: "education", label: "Education & Admissions", icon: "🎓", description: "Course enquiries, admissions, counseling and batches." },
  { value: "healthcare", label: "Healthcare & Clinics", icon: "🏥", description: "Patient enquiries, clinic appointments and care plans." },
  { value: "professional_services", label: "Professional Services", icon: "💼", description: "Client retainers, project scopes and consulting." },
  { value: "other", label: "General Purpose CRM", icon: "⚡", description: "Clean, flexible starting template for any industry." },
] as const;

const SALES_FOOTPRINTS = [
  { value: "domestic", label: "Domestic Sales", description: "Sell locally within your operating country with domestic tax and logistics." },
  { value: "exports", label: "Exports (EXIM OS)", description: "Sell into international markets with Incoterms, container logistics and foreign currencies." },
  { value: "both", label: "Domestic & Exports (Dual Mode)", description: "Simultaneously operate local retail/distribution and global export trade pipelines." },
] as const;

const QUICK_COUNTRIES = [
  { code: "IN", label: "India", flag: "🇮🇳" },
  { code: "AE", label: "UAE", flag: "🇦🇪" },
  { code: "SA", label: "Saudi Arabia", flag: "🇸🇦" },
  { code: "US", label: "USA", flag: "🇺🇸" },
  { code: "GB", label: "UK", flag: "🇬🇧" },
  { code: "CA", label: "Canada", flag: "🇨🇦" },
  { code: "SG", label: "Singapore", flag: "🇸🇬" },
  { code: "AU", label: "Australia", flag: "🇦🇺" },
  { code: "DE", label: "Germany", flag: "🇩🇪" },
  { code: "OTHER", label: "Other / Global", flag: "🌐" },
];

const STEP_TITLES = [
  "Operating country",
  "Business footprint",
  "Business model",
  "Industry template",
  "Review setup",
];

const WorkspaceSetupWizard = () => {
  const dispatch = useDispatch();
  const outletId = useSelector((state: RootState) =>
    state.appState.outletInfo?.id ?? state.auth.postgresAccess?.outlets[0]?.id,
  );
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reconfigure = searchParams.get("reconfigure") === "true";

  const [step, setStep] = useState(0);
  const [businessModel, setBusinessModel] = useState<string>("b2b");
  const [vertical, setVertical] = useState<string>("exports");
  const [currency, setCurrency] = useState("INR");
  const [operatingCountry, setOperatingCountry] = useState("IN");
  const [customCountryName, setCustomCountryName] = useState("");
  const [administrativeArea, setAdministrativeArea] = useState("");
  const [salesFootprint, setSalesFootprint] = useState("both");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [taxJurisdiction, setTaxJurisdiction] = useState("IN-GST");
  const [workforceJurisdiction, setWorkforceJurisdiction] = useState("IN-EPFO/ESIC");
  const [portfolioMode, setPortfolioMode] = useState("single");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [existingSettings, setExistingSettings] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState<BusinessConfigurationStatus | null>(null);

  // Country Query & Autocomplete
  const [countryQuery, setCountryQuery] = useState("");
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [autoDetectBanner, setAutoDetectBanner] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeCountry = getCountryConfig(operatingCountry);
  const availableAreas = activeCountry.administrativeAreas;
  const displayName = operatingCountry === "OTHER" && customCountryName.trim() ? customCountryName.trim() : activeCountry.name;

  const filteredCountries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.currency.toLowerCase().includes(q) ||
        c.phoneCode.includes(q) ||
        c.taxJurisdiction.taxIdLabel.toLowerCase().includes(q),
    );
  }, [countryQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsCountryDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!outletId) {
      setError("Your workspace could not be found. Please sign in again.");
      setLoading(false);
      return;
    }

    let active = true;
    void businessConfigurationApi.get(outletId).then((configuration) => {
      if (!active) return;
      setCurrency(configuration.currency);
      const savedSettings = configuration.settings ?? {};
      setExistingSettings(savedSettings);

      const targetCountry = typeof savedSettings.operatingCountry === "string" ? savedSettings.operatingCountry : "IN";
      setOperatingCountry(targetCountry);
      const targetConfig = getCountryConfig(targetCountry);

      if (typeof savedSettings.customCountryName === "string") {
        setCustomCountryName(savedSettings.customCountryName);
      }

      if (typeof savedSettings.administrativeArea === "string" && savedSettings.administrativeArea) {
        setAdministrativeArea(savedSettings.administrativeArea);
      } else if (targetConfig.administrativeAreas.length > 0) {
        setAdministrativeArea(targetConfig.administrativeAreas[0].name);
      }

      if (typeof savedSettings.salesFootprint === "string") setSalesFootprint(savedSettings.salesFootprint);
      if (typeof savedSettings.timezone === "string") setTimezone(savedSettings.timezone);
      else setTimezone(targetConfig.defaultTimezone);

      if (typeof savedSettings.taxJurisdiction === "string") setTaxJurisdiction(savedSettings.taxJurisdiction);
      else setTaxJurisdiction(targetConfig.taxJurisdiction.code);

      if (typeof savedSettings.workforceJurisdiction === "string") setWorkforceJurisdiction(savedSettings.workforceJurisdiction);
      else setWorkforceJurisdiction(targetConfig.workforceJurisdiction.code);

      if (typeof savedSettings.portfolioMode === "string") setPortfolioMode(savedSettings.portfolioMode);

      if (BUSINESS_MODELS.some((model) => model.value === configuration.businessModel)) {
        setBusinessModel(configuration.businessModel);
      }
      if (VERTICALS.some((item) => item.value === configuration.vertical)) {
        setVertical(configuration.vertical);
      }

      if (shouldSkipSetup(configuration.isConfigured, reconfigure)) {
        navigate(ROUTES_PATHS.DASHBOARD, { replace: true });
        return;
      }
    }).catch((loadError: unknown) => {
      if (active) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load your workspace setup.");
      }
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [navigate, outletId, reconfigure]);

  const handleCountryChange = (countryCode: string) => {
    const config = getCountryConfig(countryCode);
    setOperatingCountry(countryCode);
    setCurrency(config.currency);
    setTimezone(config.defaultTimezone);
    setTaxJurisdiction(config.taxJurisdiction.code);
    setWorkforceJurisdiction(config.workforceJurisdiction.code);
    const areas = config.administrativeAreas;
    setAdministrativeArea(areas.length > 0 ? areas[0].name : "");
    if (countryCode !== "OTHER") {
      setCustomCountryName("");
    }
  };

  const selectCountry = (code: string) => {
    handleCountryChange(code);
    setIsCountryDropdownOpen(false);
    setCountryQuery("");
  };

  const handleAutoDetect = () => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      let detected = "IN";
      if (tz.includes("Kolkata") || tz.includes("Calcutta")) detected = "IN";
      else if (tz.includes("Toronto") || tz.includes("Vancouver") || tz.includes("Montreal") || tz.includes("Edmonton")) detected = "CA";
      else if (tz.includes("New_York") || tz.includes("Chicago") || tz.includes("Los_Angeles") || tz.includes("Denver") || tz.includes("Phoenix")) detected = "US";
      else if (tz.includes("Dubai")) detected = "AE";
      else if (tz.includes("Riyadh")) detected = "SA";
      else if (tz.includes("London")) detected = "GB";
      else if (tz.includes("Singapore")) detected = "SG";
      else if (tz.includes("Sydney") || tz.includes("Melbourne") || tz.includes("Perth") || tz.includes("Brisbane")) detected = "AU";
      else if (tz.includes("Berlin") || tz.includes("Frankfurt")) detected = "DE";

      selectCountry(detected);
      const cfg = getCountryConfig(detected);
      setAutoDetectBanner(`✨ AI auto-detected system timezone (${tz || "detected"}) → ${cfg.name} (${cfg.currency} • ${cfg.taxJurisdiction.taxIdLabel})`);
      setTimeout(() => setAutoDetectBanner(null), 7000);
    } catch {
      selectCountry("IN");
      setAutoDetectBanner("✨ Defaulted to India (INR • GST)");
      setTimeout(() => setAutoDetectBanner(null), 5000);
    }
  };

  const completeSetup = async () => {
    if (!outletId) {
      setError("Your workspace could not be found. Please sign in again.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await finishWorkspaceSetup(() => businessConfigurationApi.save(outletId, {
        businessModel,
        vertical,
        templateVersion: "1.0.0",
        currency,
        terminologyOverrides: {},
        settings: {
          ...existingSettings,
          operatingCountry,
          customCountryName: operatingCountry === "OTHER" ? customCountryName.trim() : undefined,
          administrativeArea: administrativeArea.trim(),
          salesFootprint,
          timezone,
          taxJurisdiction,
          workforceJurisdiction,
          portfolioMode,
          telephonyArchitecture: "pluggable_cloud_pbx",
          numberFormat: activeCountry.numberFormat,
        },
      }), (configuration) => {
        dispatch(setBusinessConfiguration({ outletId, configuration }));
        setCompleted(configuration);
        setStep(STEP_TITLES.length);
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save your workspace setup.");
    } finally {
      setSaving(false);
    }
  };

  const selectedModel = BUSINESS_MODELS.find((model) => model.value === businessModel);
  const selectedVertical = VERTICALS.find((item) => item.value === vertical);
  const selectedSalesFootprint = SALES_FOOTPRINTS.find((item) => item.value === salesFootprint);
  const terminology = VERTICAL_TERMINOLOGY[resolveCrmVertical(completed?.vertical ?? vertical)];
  const completedStages = [...(completed?.pipelineStages ?? [])].sort((a, b) => a.stageOrder - b.stageOrder);
  const completedFields = completed?.customFields ?? [];

  // Percentage completion
  const progressPercent = completed ? 100 : Math.min(100, Math.round(((step + 1) / STEP_TITLES.length) * 100));

  return (
    <main className="workspace-setup-page">
      <section className="workspace-setup-shell" aria-labelledby="workspace-setup-title">
        <header className="workspace-setup-header">
          <span className="workspace-setup-logo"><Building2 size={18} /> Sensible CRM</span>
          <span className="workspace-setup-mode-tag">
            <Sparkles size={13} /> AI Assisted Setup
          </span>
        </header>

        <div className="workspace-setup-card">
          {/* Sidebar */}
          <aside className="workspace-setup-progress">
            <div className="workspace-sidebar-top">
              <span className="login-eyebrow">WORKSPACE SETUP</span>
              <h1 id="workspace-setup-title">Let’s set up your CRM</h1>
              <p>Sensible AI is configuring your localized workspace in real time.</p>

              {/* Progress Ring Card */}
              <div className="workspace-progress-box">
                <div className="workspace-progress-ring-wrap">
                  <svg width="44" height="44" viewBox="0 0 44 44" className="workspace-progress-ring">
                    <circle cx="22" cy="22" r="18" fill="none" stroke="#f1d0d2" strokeWidth="4" />
                    <circle
                      cx="22"
                      cy="22"
                      r="18"
                      fill="none"
                      stroke="#d91f26"
                      strokeWidth="4"
                      strokeDasharray="113.1"
                      strokeDashoffset={113.1 - (113.1 * progressPercent) / 100}
                      strokeLinecap="round"
                      style={{ transition: "stroke-dashoffset 400ms ease" }}
                    />
                  </svg>
                  <span className="workspace-progress-percent">{progressPercent}%</span>
                </div>
                <div className="workspace-progress-meta">
                  <span className="workspace-progress-title">
                    {progressPercent === 100 ? "Ready to launch" : `Step ${step + 1} of ${STEP_TITLES.length}`}
                  </span>
                  <span className="workspace-progress-badge">
                    {progressPercent === 100 ? "Complete" : "In Progress"}
                  </span>
                </div>
              </div>

              {/* Step Navigation List */}
              <ol aria-label="Setup steps" className="workspace-steps-list">
                {STEP_TITLES.map((title, index) => {
                  const isComplete = completed !== null || step > index;
                  const isActive = step === index && !completed;
                  return (
                    <li className={isActive ? "active" : isComplete ? "complete" : ""} key={title}>
                      <span className="step-bullet">
                        {isComplete ? <Check size={13} /> : index + 1}
                      </span>
                      <div className="step-label-group">
                        <span className="step-title">{title}</span>
                        <span className="step-sub">
                          {index === 0 && "Localization & tax rails"}
                          {index === 1 && "Entity & sales scope"}
                          {index === 2 && "B2B / B2C / Hybrid"}
                          {index === 3 && "Industry workflow"}
                          {index === 4 && "Verify & launch"}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* AI Copilot Card */}
            <div className="workspace-ai-copilot-card">
              <div className="workspace-ai-copilot-header">
                <div className="workspace-ai-title">
                  <Sparkles size={14} className="workspace-ai-icon" />
                  <span>Sensible AI Copilot</span>
                </div>
                <span className="workspace-ai-pulse">Active</span>
              </div>
              <p className="workspace-ai-copilot-text">
                {step === 0 && `Auto-configuring statutory tax rails (${activeCountry.taxJurisdiction.taxIdLabel}), zero-lockin PBX adapter, and ${activeCountry.numberFormat === "lakhs" ? "Lakhs/Crores" : "Millions"} formatting for ${displayName}.`}
                {step === 1 && `Structuring ${portfolioMode === "multiple" ? "multi-entity hierarchy" : "single business entity"} with ${salesFootprint === "both" ? "dual domestic & international EXIM container rails" : salesFootprint === "exports" ? "dedicated EXIM trade pipelines" : "domestic sales workflows"}.`}
                {step === 2 && `Tuning ${selectedModel?.label} engine with account hierarchies, contact roles, and quote approval gates.`}
                {step === 3 && `Generating ${selectedVertical?.label} template with tailored stages and automated SLA tracking.`}
                {step === 4 && "All localized engines and PostgreSQL schemas verified. Ready to launch."}
              </p>
              <div className="workspace-ai-pill-row">
                <span className="workspace-ai-pill">ISO: {activeCountry.code}</span>
                <span className="workspace-ai-pill">Curr: {currency}</span>
                <span className="workspace-ai-pill">{activeCountry.taxJurisdiction.code}</span>
              </div>
            </div>
          </aside>

          {/* Main Wizard Content */}
          <div className="workspace-setup-content" aria-live="polite">
            {loading ? (
              <div className="workspace-setup-loading">
                <LoaderCircle className="workspace-setup-spinner" size={24} /> Loading your setup…
              </div>
            ) : completed ? (
              <section className="workspace-step-section">
                <div>
                  <span className="login-eyebrow">SETUP COMPLETE</span>
                  <h2>Your workspace is ready</h2>
                  <p className="workspace-setup-description">
                    Here’s what we applied. You’ll see these in your {terminology.leadsLabel.toLowerCase()} pipeline.
                  </p>
                </div>

                <div className="workspace-review-grid">
                  <div><span>Business model</span><strong>{selectedModel?.label}</strong></div>
                  <div><span>Industry template</span><strong>{selectedVertical?.label}</strong></div>
                  <div><span>Operating country</span><strong>{activeCountry.flag} {displayName} ({activeCountry.code})</strong></div>
                  <div><span>{activeCountry.administrativeAreaType} / Region</span><strong>{administrativeArea || "Not specified"}</strong></div>
                  <div><span>Sales footprint</span><strong>{selectedSalesFootprint?.label}</strong></div>
                  <div><span>Business portfolio</span><strong>{portfolioMode === "multiple" ? "Multiple businesses" : "Single business"}</strong></div>
                  <div><span>Tax jurisdiction</span><strong>{taxJurisdiction} ({activeCountry.taxJurisdiction.taxIdLabel})</strong></div>
                  <div><span>Workforce jurisdiction</span><strong>{workforceJurisdiction}</strong></div>
                  <div><span>Telephony architecture</span><strong>Pluggable Cloud PBX (Zero vendor lock-in)</strong></div>
                  <div><span>Time zone</span><strong>{timezone}</strong></div>
                  <div><span>Default currency</span><strong>{completed.currency} ({activeCountry.currencySymbol})</strong></div>
                  <div><span>Leads are called</span><strong>{terminology.leadsLabel}</strong></div>
                  <div><span>Customers are called</span><strong>{terminology.customerLabel}</strong></div>
                  <div><span>Add button</span><strong>{terminology.newLeadAction}</strong></div>
                  {completedStages.length > 0 && (
                    <div className="full-width"><span>Pipeline stages</span><strong>{completedStages.map((stage) => stage.displayName).join(" → ")}</strong></div>
                  )}
                  {completedFields.length > 0 && (
                    <div className="full-width"><span>Custom fields</span><strong>{completedFields.map((field) => field.fieldName).join(", ")}</strong></div>
                  )}
                </div>

                <footer className="workspace-setup-actions">
                  <button className="workspace-setup-back" onClick={() => navigate(ROUTES_PATHS.DASHBOARD, { replace: true })} type="button">
                    Go to dashboard
                  </button>
                  <button className="workspace-setup-next" onClick={() => navigate(ROUTES_PATHS.LEADS_MANAGEMENT, { replace: true })} type="button">
                    Open {terminology.leadsLabel} <ChevronRight size={17} />
                  </button>
                </footer>
              </section>
            ) : (
              <>
                {/* Step 0: Operating Country & Localization */}
                {step === 0 && (
                  <section className="workspace-step-section">
                    <div>
                      <span className="login-eyebrow">STEP 1 OF 5 • REGIONAL FOUNDATION</span>
                      <h2>Where does this business operate?</h2>
                      <p className="workspace-setup-description">
                        Select your operating country. Sensible AI configures tax rules, statutory compliance, telephony rails, and localized formatting.
                      </p>
                    </div>

                    {autoDetectBanner && (
                      <div className="workspace-auto-detect-banner">
                        <span>{autoDetectBanner}</span>
                      </div>
                    )}

                    {/* Search Query Field for Country */}
                    <div className="country-query-container" ref={dropdownRef}>
                      <div className="country-query-bar">
                        <div className="country-query-input-wrap">
                          <Search size={16} className="country-query-search-icon" />
                          <input
                            type="text"
                            className="country-query-input"
                            placeholder="Search country by name, code or currency (e.g. India, Canada, US, UAE...)"
                            value={countryQuery || (isCountryDropdownOpen ? "" : `${activeCountry.flag}  ${displayName} (${activeCountry.code} • ${activeCountry.currency})`)}
                            onFocus={() => {
                              setIsCountryDropdownOpen(true);
                              setCountryQuery("");
                            }}
                            onChange={(e) => {
                              setCountryQuery(e.target.value);
                              setIsCountryDropdownOpen(true);
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          className="country-autodetect-btn"
                          onClick={handleAutoDetect}
                          title="Auto-detect location from browser timezone"
                        >
                          <Zap size={14} /> Auto-detect
                        </button>
                      </div>

                      {isCountryDropdownOpen && (
                        <div className="country-dropdown-menu" role="listbox">
                          {filteredCountries.map((c) => {
                            const isSelected = operatingCountry === c.code;
                            return (
                              <button
                                key={c.code}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                className={`country-dropdown-item ${isSelected ? "selected" : ""}`}
                                onClick={() => selectCountry(c.code)}
                              >
                                <span className="country-item-flag">{c.flag}</span>
                                <div className="country-item-info">
                                  <span className="country-item-name">{c.name}</span>
                                  <span className="country-item-sub">{c.currency} • {c.taxJurisdiction.taxIdLabel} ({c.code})</span>
                                </div>
                                {isSelected && <Check size={15} className="country-item-check" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Quick Selection Chips */}
                    <div className="country-quick-chips">
                      <span className="country-chips-label">Quick select:</span>
                      {QUICK_COUNTRIES.map((qc) => {
                        const isSelected = operatingCountry === qc.code;
                        return (
                          <button
                            key={qc.code}
                            type="button"
                            className={`country-chip ${isSelected ? "active" : ""}`}
                            onClick={() => selectCountry(qc.code)}
                          >
                            <span>{qc.flag}</span> {qc.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Compact AI Localized Rails banner */}
                    <div className="localization-capability-box compact">
                      <div className="localization-capability-header">
                        <Sparkles size={15} />
                        <span>Sensible AI Localized Rails for {displayName}</span>
                      </div>
                      <div className="localization-pills-row">
                        {activeCountry.capabilitiesSummary.map((item, idx) => (
                          <span key={idx} className="localization-feature-pill">
                            <Check size={12} /> {item}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Province / Region and Currency in single compact row */}
                    <div className="workspace-form-grid">
                      {operatingCountry === "OTHER" && (
                        <div className="workspace-field-group full-width">
                          <label htmlFor="setup-custom-country-name">Country Name</label>
                          <input
                            id="setup-custom-country-name"
                            value={customCountryName}
                            onChange={(event) => setCustomCountryName(event.target.value)}
                            placeholder="e.g. Canada, Kenya, Japan, Brazil, France..."
                            autoFocus
                          />
                        </div>
                      )}

                      <div className="workspace-field-group">
                        <label htmlFor="setup-region">{activeCountry.administrativeAreaType} / Region</label>
                        {availableAreas.length > 0 ? (
                          <select
                            id="setup-region"
                            value={administrativeArea}
                            onChange={(event) => setAdministrativeArea(event.target.value)}
                          >
                            {availableAreas.map((area) => (
                              <option key={area.code} value={area.name}>
                                {area.name} {area.extraInfo ? `(${area.extraInfo})` : ""}
                              </option>
                            ))}
                            <option value="Other / Special Economic Zone">Other / Special Economic Zone</option>
                          </select>
                        ) : (
                          <input
                            id="setup-region"
                            value={administrativeArea}
                            onChange={(event) => setAdministrativeArea(event.target.value)}
                            placeholder={`Enter ${activeCountry.administrativeAreaType} (e.g. Province / State)`}
                          />
                        )}
                      </div>

                      <div className="workspace-field-group">
                        <label htmlFor="setup-currency-selector">Base Currency & Numbering</label>
                        {operatingCountry === "OTHER" ? (
                          <select
                            id="setup-currency-selector"
                            value={currency}
                            onChange={(event) => setCurrency(event.target.value)}
                          >
                            {["USD", "EUR", "GBP", "INR", "AED", "SAR", "CAD", "AUD", "SGD", "JPY", "KES", "ZAR", "BRL", "CHF", "NZD"].map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            id="setup-currency-display"
                            value={`${currency} (${activeCountry.currencySymbol}) — ${activeCountry.numberFormat === "lakhs" ? "Lakhs & Crores" : "Millions"}`}
                            disabled
                            readOnly
                          />
                        )}
                      </div>
                    </div>

                    {/* Advanced Jurisdiction Accordion */}
                    <button
                      type="button"
                      className="workspace-setup-overrides-toggle"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                    >
                      {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      {showAdvanced ? "Hide advanced jurisdiction settings" : "Advanced settings (Timezone, Tax Authority, Workforce compliance)"}
                    </button>

                    {showAdvanced && (
                      <div className="workspace-form-grid workspace-advanced-grid">
                        <div className="workspace-field-group">
                          <label htmlFor="setup-timezone">Time zone</label>
                          {activeCountry.timezones.length > 1 ? (
                            <select
                              id="setup-timezone"
                              value={timezone}
                              onChange={(event) => setTimezone(event.target.value)}
                            >
                              {activeCountry.timezones.map((tz) => (
                                <option key={tz} value={tz}>{tz}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              id="setup-timezone"
                              value={timezone}
                              onChange={(event) => setTimezone(event.target.value)}
                              placeholder="e.g. Asia/Kolkata"
                            />
                          )}
                        </div>
                        <div className="workspace-field-group">
                          <label htmlFor="setup-tax-jurisdiction">Tax Jurisdiction</label>
                          <input
                            id="setup-tax-jurisdiction"
                            value={taxJurisdiction}
                            onChange={(event) => setTaxJurisdiction(event.target.value.toUpperCase())}
                            placeholder="Authority code (e.g. IN-GST, VAT)"
                          />
                        </div>
                        <div className="workspace-field-group">
                          <label htmlFor="setup-workforce-jurisdiction">Workforce Compliance</label>
                          <input
                            id="setup-workforce-jurisdiction"
                            value={workforceJurisdiction}
                            onChange={(event) => setWorkforceJurisdiction(event.target.value.toUpperCase())}
                            placeholder="Authority code (e.g. LABOUR-DEPT, EPFO)"
                          />
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {/* Step 1: Business Footprint & Portfolio */}
                {step === 1 && (
                  <section className="workspace-step-section">
                    <div>
                      <span className="login-eyebrow">STEP 2 OF 5 • BUSINESS STRUCTURE</span>
                      <h2>Entity architecture & sales footprint</h2>
                      <p className="workspace-setup-description">
                        Configure your operational business hierarchy and geographic sales scope.
                      </p>
                    </div>

                    <div className="workspace-step-subgroup">
                      <span className="workspace-subgroup-title">Owner portfolio</span>
                      <div className="workspace-setup-options">
                        {[
                          { value: "single", label: "Single business", description: "One business entity with one or more operational outlets." },
                          { value: "multiple", label: "Multiple businesses", description: "Several business entities, each with isolated outlets and workflows." },
                        ].map((item) => (
                          <button
                            aria-pressed={portfolioMode === item.value}
                            className={`workspace-setup-option${portfolioMode === item.value ? " selected" : ""}`}
                            key={item.value}
                            onClick={() => setPortfolioMode(item.value)}
                            type="button"
                          >
                            <span className="workspace-setup-option-check">{portfolioMode === item.value && <Check size={15} />}</span>
                            <strong>{item.label}</strong>
                            <span>{item.description}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="workspace-step-subgroup">
                      <span className="workspace-subgroup-title">How does this business sell?</span>
                      <div className="workspace-setup-options">
                        {SALES_FOOTPRINTS.map((item) => (
                          <button
                            aria-pressed={salesFootprint === item.value}
                            className={`workspace-setup-option${salesFootprint === item.value ? " selected" : ""}`}
                            key={item.value}
                            onClick={() => setSalesFootprint(item.value)}
                            type="button"
                          >
                            <span className="workspace-setup-option-check">{salesFootprint === item.value && <Check size={15} />}</span>
                            <strong>{item.label}</strong>
                            <span>{item.description}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>
                )}

                {/* Step 2: Business Model */}
                {step === 2 && (
                  <section className="workspace-step-section">
                    <div>
                      <span className="login-eyebrow">STEP 3 OF 5 • SALES ENGINE</span>
                      <h2>How does your business sell to customers?</h2>
                      <p className="workspace-setup-description">
                        This helps Sensible AI configure customer accounts, quoting workflows, and pipeline stages.
                      </p>
                    </div>

                    <div className="workspace-setup-options">
                      {BUSINESS_MODELS.map((model) => (
                        <button
                          aria-pressed={businessModel === model.value}
                          className={`workspace-setup-option${businessModel === model.value ? " selected" : ""}`}
                          key={model.value}
                          onClick={() => setBusinessModel(model.value)}
                          type="button"
                        >
                          <span className="workspace-setup-option-check">{businessModel === model.value && <Check size={15} />}</span>
                          <strong>{model.label}</strong>
                          <span>{model.description}</span>
                        </button>
                      ))}
                    </div>

                    <div className="workspace-ai-tip-box">
                      <Sparkles size={15} />
                      <span>
                        <strong>AI Recommendation:</strong> B2B and Hybrid models automatically activate multi-contact accounts, deal stages, and proforma quote generators.
                      </span>
                    </div>
                  </section>
                )}

                {/* Step 3: Industry Template */}
                {step === 3 && (
                  <section className="workspace-step-section">
                    <div>
                      <span className="login-eyebrow">STEP 4 OF 5 • INDUSTRY BLUEPRINT</span>
                      <h2>Choose your industry template</h2>
                      <p className="workspace-setup-description">
                        Start with relevant lead stages and terminology. You can customize these later.
                      </p>
                    </div>

                    <div className="workspace-verticals-grid">
                      {VERTICALS.map((item) => {
                        const isSelected = vertical === item.value;
                        return (
                          <button
                            aria-pressed={isSelected}
                            className={`workspace-vertical-card${isSelected ? " selected" : ""}`}
                            key={item.value}
                            onClick={() => setVertical(item.value)}
                            type="button"
                          >
                            <div className="vertical-card-header">
                              <span className="vertical-card-icon">{item.icon}</span>
                              <span className="workspace-setup-option-check">{isSelected && <Check size={13} />}</span>
                            </div>
                            <strong>{item.label}</strong>
                            <span>{item.description}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="workspace-pipeline-preview-pill">
                      <span className="preview-label"><Sparkles size={13} /> AI Pipeline Stages:</span>
                      <span className="preview-stages">
                        {vertical === "exports"
                          ? "Trade Inquiry → KYC / Assigned → RFQ Review → Proforma / Quote → Won / Lost"
                          : "New Lead → Contacted → Qualified → Proposal / Quote → Negotiation → Won / Lost"}
                      </span>
                    </div>
                  </section>
                )}

                {/* Step 4: Review Setup */}
                {step === 4 && (
                  <section className="workspace-step-section">
                    <div>
                      <span className="login-eyebrow">STEP 5 OF 5 • VERIFY & LAUNCH</span>
                      <h2>Review your workspace</h2>
                      <p className="workspace-setup-description">
                        Sensible AI will initialize your localized CRM with these settings.
                      </p>
                    </div>

                    <div className="workspace-review-grid">
                      <div><span>Business model</span><strong>{selectedModel?.label}</strong></div>
                      <div><span>Industry template</span><strong>{selectedVertical?.label}</strong></div>
                      <div><span>Operating country</span><strong>{activeCountry.flag} {displayName} ({activeCountry.code})</strong></div>
                      <div><span>{activeCountry.administrativeAreaType} / Region</span><strong>{administrativeArea || "Not specified"}</strong></div>
                      <div><span>Sales footprint</span><strong>{selectedSalesFootprint?.label}</strong></div>
                      <div><span>Business portfolio</span><strong>{portfolioMode === "multiple" ? "Multiple businesses" : "Single business"}</strong></div>
                      <div><span>Tax jurisdiction</span><strong>{taxJurisdiction} ({activeCountry.taxJurisdiction.taxIdLabel})</strong></div>
                      <div><span>Telephony rail</span><strong>Pluggable Cloud PBX (Zero lock-in)</strong></div>
                      <div><span>Time zone</span><strong>{timezone}</strong></div>
                      <div>
                        <span>Default currency</span>
                        <strong>{currency} ({activeCountry.currencySymbol})</strong>
                      </div>
                    </div>

                    <div className="workspace-launch-banner">
                      <Sparkles size={16} />
                      <span>Ready to initialize PostgreSQL tables, RLS security policies, and team permissions.</span>
                    </div>
                  </section>
                )}

                {error && <p className="workspace-setup-error" role="alert">{error}</p>}

                {/* Pinned Bottom Actions */}
                <footer className="workspace-setup-actions">
                  <button
                    className="workspace-setup-back"
                    disabled={step === 0 || saving}
                    onClick={() => setStep((current) => Math.max(0, current - 1))}
                    type="button"
                  >
                    <ChevronLeft size={16} /> Back
                  </button>
                  {step < STEP_TITLES.length - 1 ? (
                    <button className="workspace-setup-next" onClick={() => setStep((current) => current + 1)} type="button">
                      Continue <ChevronRight size={16} />
                    </button>
                  ) : (
                    <button className="workspace-setup-next" disabled={saving} onClick={() => void completeSetup()} type="button">
                      {saving ? "Initializing CRM…" : "Finish setup & Launch"} {!saving && <Sparkles size={16} />}
                    </button>
                  )}
                </footer>
              </>
            )}
          </div>
        </div>

        <p className="workspace-setup-footer">You can customize all settings anytime from workspace administration.</p>
      </section>
    </main>
  );
};

export default WorkspaceSetupWizard;
