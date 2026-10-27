/**
 * Country & Regional Localization Registry for Sensible AI CRM
 * Defines vendor-agnostic configurations for currencies, tax systems, workforce compliance,
 * telephony rails, and administrative divisions across operating countries.
 *
 * Designed with a pluggable adapter architecture to eliminate vendor lock-in.
 */

export interface AdministrativeArea {
  code: string;
  name: string;
  extraInfo?: string;
}

export interface TaxJurisdictionConfig {
  code: string;
  name: string;
  taxIdLabel: string;
  taxIdFormat: string;
  standardRates: string;
}

export interface WorkforceJurisdictionConfig {
  code: string;
  name: string;
  complianceLabel: string;
}

export interface VoiceAIPersonaConfig {
  language: string;
  accent: string;
  description: string;
}

export interface CountryConfig {
  code: string;
  name: string;
  flag: string;
  phoneCode: string;
  phoneMask: string;
  currency: string;
  currencySymbol: string;
  numberFormat: "lakhs" | "millions";
  defaultTimezone: string;
  timezones: string[];
  administrativeAreaType: "State" | "Emirate" | "Province" | "County" | "Region" | "Prefecture" | "Land";
  administrativeAreas: AdministrativeArea[];
  taxJurisdiction: TaxJurisdictionConfig;
  workforceJurisdiction: WorkforceJurisdictionConfig;
  telephonyRail: "cloud_pbx" | "streaming_sip";
  telephonyReason: string;
  voiceAIPersona: VoiceAIPersonaConfig;
  capabilitiesSummary: string[];
}

export const COUNTRIES: CountryConfig[] = [
  {
    code: "IN",
    name: "India",
    flag: "🇮🇳",
    phoneCode: "+91",
    phoneMask: "98765 43210",
    currency: "INR",
    currencySymbol: "₹",
    numberFormat: "lakhs",
    defaultTimezone: "Asia/Kolkata",
    timezones: ["Asia/Kolkata"],
    administrativeAreaType: "State",
    administrativeAreas: [
      { code: "27", name: "Maharashtra", extraInfo: "GST Code: 27" },
      { code: "29", name: "Karnataka", extraInfo: "GST Code: 29" },
      { code: "24", name: "Gujarat", extraInfo: "GST Code: 24" },
      { code: "07", name: "Delhi", extraInfo: "GST Code: 07" },
      { code: "33", name: "Tamil Nadu", extraInfo: "GST Code: 33" },
      { code: "36", name: "Telangana", extraInfo: "GST Code: 36" },
      { code: "09", name: "Uttar Pradesh", extraInfo: "GST Code: 09" },
      { code: "19", name: "West Bengal", extraInfo: "GST Code: 19" },
      { code: "08", name: "Rajasthan", extraInfo: "GST Code: 08" },
      { code: "23", name: "Madhya Pradesh", extraInfo: "GST Code: 23" },
      { code: "32", name: "Kerala", extraInfo: "GST Code: 32" },
      { code: "06", name: "Haryana", extraInfo: "GST Code: 06" },
      { code: "03", name: "Punjab", extraInfo: "GST Code: 03" },
      { code: "37", name: "Andhra Pradesh", extraInfo: "GST Code: 37" },
      { code: "21", name: "Odisha", extraInfo: "GST Code: 21" },
      { code: "10", name: "Bihar", extraInfo: "GST Code: 10" },
      { code: "20", name: "Jharkhand", extraInfo: "GST Code: 20" },
      { code: "22", name: "Chhattisgarh", extraInfo: "GST Code: 22" },
      { code: "02", name: "Himachal Pradesh", extraInfo: "GST Code: 02" },
      { code: "05", name: "Uttarakhand", extraInfo: "GST Code: 05" },
      { code: "30", name: "Goa", extraInfo: "GST Code: 30" },
      { code: "18", name: "Assam", extraInfo: "GST Code: 18" },
      { code: "01", name: "Jammu and Kashmir", extraInfo: "GST Code: 01" },
      { code: "04", name: "Chandigarh", extraInfo: "GST Code: 04" },
      { code: "11", name: "Sikkim", extraInfo: "GST Code: 11" },
      { code: "12", name: "Arunachal Pradesh", extraInfo: "GST Code: 12" },
      { code: "13", name: "Nagaland", extraInfo: "GST Code: 13" },
      { code: "14", name: "Manipur", extraInfo: "GST Code: 14" },
      { code: "15", name: "Mizoram", extraInfo: "GST Code: 15" },
      { code: "16", name: "Tripura", extraInfo: "GST Code: 16" },
      { code: "17", name: "Meghalaya", extraInfo: "GST Code: 17" },
      { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu", extraInfo: "GST Code: 26" },
      { code: "31", name: "Lakshadweep", extraInfo: "GST Code: 31" },
      { code: "34", name: "Puducherry", extraInfo: "GST Code: 34" },
      { code: "35", name: "Andaman and Nicobar Islands", extraInfo: "GST Code: 35" },
      { code: "38", name: "Ladakh", extraInfo: "GST Code: 38" },
    ],
    taxJurisdiction: {
      code: "IN-GST",
      name: "Goods & Services Tax (GST)",
      taxIdLabel: "GSTIN",
      taxIdFormat: "15 alphanumeric (e.g. 27AAAAA0000A1Z5)",
      standardRates: "0%, 5%, 12%, 18%, 28% (CGST + SGST or IGST)",
    },
    workforceJurisdiction: {
      code: "IN-EPFO/ESIC",
      name: "Ministry of Labour & Employment",
      complianceLabel: "EPF (12%), ESIC (0.75%/3.25%), State Professional Tax (PT), Gratuity",
    },
    telephonyRail: "streaming_sip",
    telephonyReason: "Low-latency 16kHz WebSocket audio stream with TRAI DLT regulatory compliance",
    voiceAIPersona: {
      language: "Indian English, Hindi, Hinglish, Marathi, Tamil, Telugu",
      accent: "Indian Accent with polite, collaborative corporate cadence",
      description: "Gemini 3.8 Live localized for Indian commerce, multi-language lead qualification and negotiation",
    },
    capabilitiesSummary: [
      "Dynamic GSTIN verification with auto-detection of Inter-state (IGST) vs Intra-state (CGST+SGST)",
      "High-fidelity 16kHz streaming Voice AI rail (Gemini 3.8 Live integration)",
      "Carrier-grade regulatory SMS with DLT compliance & official WhatsApp Business gateway",
      "Pluggable telephony adapter: Zero vendor lock-in (hot-switch carriers anytime)",
      "Indian numbering system (Lakhs & Crores) and DD/MM/YYYY formatting",
      "Field sales PIN code geocoding via Google Maps Platform",
    ],
  },
  {
    code: "AE",
    name: "United Arab Emirates",
    flag: "🇦🇪",
    phoneCode: "+971",
    phoneMask: "50 123 4567",
    currency: "AED",
    currencySymbol: "د.إ",
    numberFormat: "millions",
    defaultTimezone: "Asia/Dubai",
    timezones: ["Asia/Dubai"],
    administrativeAreaType: "Emirate",
    administrativeAreas: [
      { code: "DXB", name: "Dubai", extraInfo: "Commercial & Logistics Hub" },
      { code: "AUH", name: "Abu Dhabi", extraInfo: "Capital Emirate" },
      { code: "SHJ", name: "Sharjah", extraInfo: "Industrial Hub" },
      { code: "AJM", name: "Ajman" },
      { code: "RAK", name: "Ras Al Khaimah" },
      { code: "FUJ", name: "Fujairah", extraInfo: "Bunkering & Sea Port" },
      { code: "UAQ", name: "Umm Al Quwain" },
    ],
    taxJurisdiction: {
      code: "AE-VAT",
      name: "UAE Federal Tax Authority (FTA)",
      taxIdLabel: "TRN (Tax Registration Number)",
      taxIdFormat: "15 digits (e.g. 100000000000003)",
      standardRates: "Standard 5%, Zero-rated 0% for Exports",
    },
    workforceJurisdiction: {
      code: "AE-WPS/MOHRE",
      name: "MOHRE & UAE Central Bank",
      complianceLabel: "Wages Protection System (WPS) SIF generation, End of Service Gratuity (EOSG)",
    },
    telephonyRail: "cloud_pbx",
    telephonyReason: "Cloud PBX & regional SIP gateway with multi-channel messaging",
    voiceAIPersona: {
      language: "Gulf Arabic (Khaleeji), Modern Standard Arabic, Middle Eastern English",
      accent: "Warm, respectful Gulf business tone with bilingual switching",
      description: "Gemini 3.8 Live Arabic/English executive assistant for relationship management",
    },
    capabilitiesSummary: [
      "Bilingual Tax Invoices (Arabic & English) with FTA QR codes and Emirate tagging",
      "WhatsApp-first CRM workflows with official multi-provider cloud messaging gateway",
      "WPS (Wages Protection System) payroll export and End-of-Service Gratuity calculations",
      "Pluggable telephony adapter: Zero vendor lock-in (hot-switch carriers anytime)",
      "Free Zone vs Mainland corporate entity management (DED, DMCC, JAFZA, ADGM)",
    ],
  },
  {
    code: "SA",
    name: "Saudi Arabia",
    flag: "🇸🇦",
    phoneCode: "+966",
    phoneMask: "50 123 4567",
    currency: "SAR",
    currencySymbol: "ر.س",
    numberFormat: "millions",
    defaultTimezone: "Asia/Riyadh",
    timezones: ["Asia/Riyadh"],
    administrativeAreaType: "Province",
    administrativeAreas: [
      { code: "RIY", name: "Riyadh", extraInfo: "Capital Region" },
      { code: "MAK", name: "Makkah (Jeddah)", extraInfo: "Red Sea Commercial Hub" },
      { code: "EAS", name: "Eastern Province (Dammam / Khobar)", extraInfo: "Industrial & Energy Hub" },
      { code: "MAD", name: "Madinah" },
      { code: "ASI", name: "Asir (Abha)" },
      { code: "TAB", name: "Tabuk (NEOM)" },
      { code: "QAS", name: "Al-Qassim" },
      { code: "HAI", name: "Hail" },
      { code: "JAZ", name: "Jazan" },
      { code: "NAJ", name: "Najran" },
      { code: "BAH", name: "Al Bahah" },
      { code: "JOW", name: "Al Jawf" },
      { code: "NOR", name: "Northern Borders" },
    ],
    taxJurisdiction: {
      code: "SA-VAT",
      name: "Zakat, Tax and Customs Authority (ZATCA)",
      taxIdLabel: "CR & ZATCA VAT Number",
      taxIdFormat: "10 digits Commercial Reg (CR) / 15 digits VAT",
      standardRates: "Standard 15%, Zakat compliance",
    },
    workforceJurisdiction: {
      code: "SA-GOSI",
      name: "Ministry of Human Resources (MHRSD) & GOSI",
      complianceLabel: "GOSI contributions, Saudization (Nitaqat) targets, Mudad wage protection",
    },
    telephonyRail: "cloud_pbx",
    telephonyReason: "Cloud PBX & regional SIP gateway with CITC regulatory compliance",
    voiceAIPersona: {
      language: "Saudi Arabic (Najdi, Hejazi), Modern Standard Arabic, English",
      accent: "Formal and courteous Saudi business dialect",
      description: "Gemini 3.8 Live Arabic voice agent attuned to Saudi commercial protocols",
    },
    capabilitiesSummary: [
      "ZATCA Fatoora Phase 2 e-Invoicing compliance with Base64 TLV QR codes and XML UBL 2.1",
      "Dual Commercial Registration (CR) and National Address validation",
      "Hijri & Gregorian calendar dual date support for contracts and delivery schedules",
      "Pluggable telephony adapter: Zero vendor lock-in (hot-switch carriers anytime)",
      "Saudization (Nitaqat) tier tracking in workforce allocation",
    ],
  },
  {
    code: "US",
    name: "United States",
    flag: "🇺🇸",
    phoneCode: "+1",
    phoneMask: "(555) 123-4567",
    currency: "USD",
    currencySymbol: "$",
    numberFormat: "millions",
    defaultTimezone: "America/New_York",
    timezones: ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"],
    administrativeAreaType: "State",
    administrativeAreas: [
      { code: "CA", name: "California" },
      { code: "TX", name: "Texas" },
      { code: "NY", name: "New York" },
      { code: "FL", name: "Florida" },
      { code: "IL", name: "Illinois" },
      { code: "PA", name: "Pennsylvania" },
      { code: "OH", name: "Ohio" },
      { code: "GA", name: "Georgia" },
      { code: "NC", name: "North Carolina" },
      { code: "MI", name: "Michigan" },
      { code: "NJ", name: "New Jersey" },
      { code: "VA", name: "Virginia" },
      { code: "WA", name: "Washington" },
      { code: "AZ", name: "Arizona" },
      { code: "MA", name: "Massachusetts" },
      { code: "CO", name: "Colorado" },
      { code: "MD", name: "Maryland" },
      { code: "MO", name: "Missouri" },
      { code: "MN", name: "Minnesota" },
      { code: "WI", name: "Wisconsin" },
      { code: "IN", name: "Indiana" },
      { code: "TN", name: "Tennessee" },
      { code: "CT", name: "Connecticut" },
      { code: "DC", name: "District of Columbia" },
    ],
    taxJurisdiction: {
      code: "US-SALES-TAX",
      name: "State & Local Sales Tax",
      taxIdLabel: "EIN / Federal Tax ID",
      taxIdFormat: "9 digits (XX-XXXXXXX)",
      standardRates: "State + County destination/origin based sales tax",
    },
    workforceJurisdiction: {
      code: "US-IRS/DOL",
      name: "Department of Labor & Internal Revenue Service (IRS)",
      complianceLabel: "W-2 / 1099-NEC contractor distinction, FICA, State withholding, FLSA Overtime",
    },
    telephonyRail: "cloud_pbx",
    telephonyReason: "Cloud PBX with A2P 10DLC campaign registration and TCPA compliance",
    voiceAIPersona: {
      language: "North American English, US Spanish",
      accent: "Professional, energetic, articulate American business cadence",
      description: "Gemini 3.8 Live consultative sales SDR and account manager persona",
    },
    capabilitiesSummary: [
      "State-by-state Sales & Use Tax exemption certificate tracking (Reseller Form ST-120)",
      "A2P 10DLC compliance with automated opt-out and TCPA calling hour guards",
      "Pluggable telephony adapter: Zero vendor lock-in (hot-switch carriers anytime)",
      "US ZIP Code auto-resolution and mileage reimbursement calculations ($/mile)",
      "W-2 vs 1099 contractor commission accounting",
    ],
  },
  {
    code: "GB",
    name: "United Kingdom",
    flag: "🇬🇧",
    phoneCode: "+44",
    phoneMask: "7700 900123",
    currency: "GBP",
    currencySymbol: "£",
    numberFormat: "millions",
    defaultTimezone: "Europe/London",
    timezones: ["Europe/London"],
    administrativeAreaType: "Region",
    administrativeAreas: [
      { code: "LDN", name: "Greater London" },
      { code: "SE", name: "South East England" },
      { code: "NW", name: "North West England (Manchester/Liverpool)" },
      { code: "WM", name: "West Midlands (Birmingham)" },
      { code: "SW", name: "South West England" },
      { code: "YH", name: "Yorkshire and the Humber (Leeds/Sheffield)" },
      { code: "EM", name: "East Midlands" },
      { code: "EE", name: "East of England" },
      { code: "NE", name: "North East England (Newcastle)" },
      { code: "SCT", name: "Scotland (Edinburgh/Glasgow)" },
      { code: "WLS", name: "Wales (Cardiff)" },
      { code: "NIR", name: "Northern Ireland (Belfast)" },
    ],
    taxJurisdiction: {
      code: "GB-VAT",
      name: "HM Revenue & Customs (HMRC)",
      taxIdLabel: "UK VAT Number / CRN",
      taxIdFormat: "GB + 9 digits (or 8-digit Companies House CRN)",
      standardRates: "Standard 20%, Reduced 5%, Zero 0%",
    },
    workforceJurisdiction: {
      code: "GB-HMRC/PAYE",
      name: "HMRC & The Pensions Regulator",
      complianceLabel: "PAYE, National Insurance (NIC Class 1), Workplace Pension auto-enrolment",
    },
    telephonyRail: "cloud_pbx",
    telephonyReason: "Cloud PBX & SIP interconnect with GDPR consent logging & TPS/CTPS screening",
    voiceAIPersona: {
      language: "British English (Received Pronunciation / Modern British)",
      accent: "Polite, structured, consultative British corporate tone",
      description: "Gemini 3.8 Live account executive for UK enterprise and SME discovery",
    },
    capabilitiesSummary: [
      "HMRC Making Tax Digital (MTD) compliant VAT invoice breakdowns",
      "Strict GDPR consent logging and right-to-be-forgotten lifecycle triggers",
      "Pluggable telephony adapter: Zero vendor lock-in (hot-switch carriers anytime)",
      "UK alphanumeric Postcode address validation via Google Maps Platform",
      "Domestic reverse-charge VAT support for construction and technology supplies",
    ],
  },
  {
    code: "SG",
    name: "Singapore",
    flag: "🇸🇬",
    phoneCode: "+65",
    phoneMask: "9123 4567",
    currency: "SGD",
    currencySymbol: "S$",
    numberFormat: "millions",
    defaultTimezone: "Asia/Singapore",
    timezones: ["Asia/Singapore"],
    administrativeAreaType: "Region",
    administrativeAreas: [
      { code: "CEN", name: "Central Region (CBD / Marina Bay / Orchard)" },
      { code: "EST", name: "East Region (Changi / Tampines / Bedok)" },
      { code: "WST", name: "West Region (Jurong / Tuas / Clementi)" },
      { code: "NTH", name: "North Region (Woodlands / Sembawang)" },
      { code: "NEA", name: "North-East Region (Seletar / Sengkang)" },
    ],
    taxJurisdiction: {
      code: "SG-GST",
      name: "Inland Revenue Authority of Singapore (IRAS)",
      taxIdLabel: "UEN (Unique Entity Number) / GST Reg",
      taxIdFormat: "9-10 alphanumeric characters (e.g. 201812345A)",
      standardRates: "Standard 9% GST, Zero-rated for international exports",
    },
    workforceJurisdiction: {
      code: "SG-MOM/CPF",
      name: "Ministry of Manpower (MOM) & Central Provident Fund (CPF)",
      complianceLabel: "CPF contributions (up to 37% total), Employment Act provisions",
    },
    telephonyRail: "cloud_pbx",
    telephonyReason: "Cloud PBX with PDPA (Personal Data Protection Act) DNC Registry screening",
    voiceAIPersona: {
      language: "Singaporean English, Mandarin, Malay, Tamil",
      accent: "Clear, efficient Singapore business cadence with multilingual comprehension",
      description: "Gemini 3.8 Live APAC regional coordinator persona",
    },
    capabilitiesSummary: [
      "InvoiceNow (Peppol E-Invoicing) network integration via IRAS",
      "ACRA Unique Entity Number (UEN) lookup and client credentialing",
      "Pluggable telephony adapter: Zero vendor lock-in (hot-switch carriers anytime)",
      "ASEAN cross-border supply chain hub routing and multi-currency pricing",
      "Singapore DNC (Do Not Call) registry compliance checks",
    ],
  },
  {
    code: "AU",
    name: "Australia",
    flag: "🇦🇺",
    phoneCode: "+61",
    phoneMask: "0412 345 678",
    currency: "AUD",
    currencySymbol: "A$",
    numberFormat: "millions",
    defaultTimezone: "Australia/Sydney",
    timezones: ["Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Perth", "Australia/Adelaide"],
    administrativeAreaType: "State",
    administrativeAreas: [
      { code: "NSW", name: "New South Wales (Sydney)" },
      { code: "VIC", name: "Victoria (Melbourne)" },
      { code: "QLD", name: "Queensland (Brisbane)" },
      { code: "WA", name: "Western Australia (Perth)" },
      { code: "SA", name: "South Australia (Adelaide)" },
      { code: "TAS", name: "Tasmania (Hobart)" },
      { code: "ACT", name: "Australian Capital Territory (Canberra)" },
      { code: "NT", name: "Northern Territory (Darwin)" },
    ],
    taxJurisdiction: {
      code: "AU-GST",
      name: "Australian Taxation Office (ATO)",
      taxIdLabel: "ABN (Australian Business Number)",
      taxIdFormat: "11 digits (e.g. 51 824 753 556)",
      standardRates: "Standard 10% GST",
    },
    workforceJurisdiction: {
      code: "AU-ATO/FAIRWORK",
      name: "Fair Work Ombudsman & Australian Taxation Office",
      complianceLabel: "Superannuation Guarantee (11.5%), PAYG Withholding, Modern Awards",
    },
    telephonyRail: "cloud_pbx",
    telephonyReason: "Cloud PBX & SIP interconnect with ACMA Spam Act 2003 compliance",
    voiceAIPersona: {
      language: "Australian English",
      accent: "Friendly, direct, trustworthy Australian commercial tone",
      description: "Gemini 3.8 Live sales and service representative for ANZ markets",
    },
    capabilitiesSummary: [
      "Automated Australian Business Register (ABR) ABN verification",
      "ATO Peppol e-Invoicing network connectivity",
      "Pluggable telephony adapter: Zero vendor lock-in (hot-switch carriers anytime)",
      "Superannuation Guarantee ledger calculation (11.5% statutory contribution)",
      "Australian 4-digit Postcode routing and territory mapping",
    ],
  },
  {
    code: "DE",
    name: "Germany (European Union)",
    flag: "🇩🇪",
    phoneCode: "+49",
    phoneMask: "0151 12345678",
    currency: "EUR",
    currencySymbol: "€",
    numberFormat: "millions",
    defaultTimezone: "Europe/Berlin",
    timezones: ["Europe/Berlin"],
    administrativeAreaType: "Land",
    administrativeAreas: [
      { code: "BY", name: "Bayern (Munich)" },
      { code: "BW", name: "Baden-Württemberg (Stuttgart)" },
      { code: "NW", name: "Nordrhein-Westfalen (Düsseldorf/Cologne)" },
      { code: "HE", name: "Hessen (Frankfurt)" },
      { code: "BE", name: "Berlin" },
      { code: "HH", name: "Hamburg" },
      { code: "NI", name: "Niedersachsen (Hannover)" },
      { code: "SN", name: "Sachsen (Dresden/Leipzig)" },
      { code: "RP", name: "Rheinland-Pfalz" },
      { code: "SH", name: "Schleswig-Holstein" },
      { code: "BB", name: "Brandenburg" },
      { code: "ST", name: "Sachsen-Anhalt" },
      { code: "TH", name: "Thüringen" },
      { code: "MV", name: "Mecklenburg-Vorpommern" },
      { code: "SL", name: "Saarland" },
      { code: "HB", name: "Bremen" },
    ],
    taxJurisdiction: {
      code: "DE-VAT",
      name: "Bundeszentralamt für Steuern (BZSt)",
      taxIdLabel: "USt-IdNr (VAT ID) / Steuernummer",
      taxIdFormat: "DE + 9 digits (e.g. DE123456789)",
      standardRates: "Standard 19%, Reduced 7%, Intra-EU reverse charge",
    },
    workforceJurisdiction: {
      code: "DE-SOZIALVERSICHERUNG",
      name: "Deutsche Rentenversicherung & Krankenkassen",
      complianceLabel: "Gesetzliche Kranken-, Renten-, Arbeitslosen- und Pflegeversicherung",
    },
    telephonyRail: "cloud_pbx",
    telephonyReason: "Cloud PBX & SIP interconnect with strict DSGVO (GDPR) data residency and consent recording",
    voiceAIPersona: {
      language: "German (Deutsch), European English",
      accent: "Professional, structured, precise Hochdeutsch business tone",
      description: "Gemini 3.8 Live bilingual industrial sales and technical qualifier",
    },
    capabilitiesSummary: [
      "XRechnung and ZUGFeRD 2.0 electronic invoicing standard for B2B & public authorities",
      "VIES EU VAT number validation and reverse charge handling for intra-community supplies",
      "Pluggable telephony adapter: Zero vendor lock-in (hot-switch carriers anytime)",
      "Strict DSGVO (GDPR) consent logging and communication privacy safeguards",
      "German DIN 5008 letter and invoice layout formatting with comma decimals (1.234,56 €)",
    ],
  },
  {
    code: "CA",
    name: "Canada",
    flag: "🇨🇦",
    phoneCode: "+1",
    phoneMask: "(555) 123-4567",
    currency: "CAD",
    currencySymbol: "C$",
    numberFormat: "millions",
    defaultTimezone: "America/Toronto",
    timezones: ["America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Halifax"],
    administrativeAreaType: "Province",
    administrativeAreas: [
      { code: "ON", name: "Ontario (Toronto/Ottawa)" },
      { code: "QC", name: "Quebec (Montreal)" },
      { code: "BC", name: "British Columbia (Vancouver)" },
      { code: "AB", name: "Alberta (Calgary/Edmonton)" },
      { code: "MB", name: "Manitoba (Winnipeg)" },
      { code: "SK", name: "Saskatchewan" },
      { code: "NS", name: "Nova Scotia (Halifax)" },
      { code: "NB", name: "New Brunswick" },
      { code: "NL", name: "Newfoundland and Labrador" },
      { code: "PE", name: "Prince Edward Island" },
      { code: "NT", name: "Northwest Territories" },
      { code: "YT", name: "Yukon" },
      { code: "NU", name: "Nunavut" },
    ],
    taxJurisdiction: {
      code: "CA-GST-HST",
      name: "Canada Revenue Agency (CRA)",
      taxIdLabel: "CRA Business Number / GST-HST Reg",
      taxIdFormat: "9 digits BN (e.g. 123456789 RT 0001)",
      standardRates: "GST 5% + Provincial PST/QST (or combined HST 13-15%)",
    },
    workforceJurisdiction: {
      code: "CA-CRA/ESDC",
      name: "Employment and Social Development Canada (ESDC) & CRA",
      complianceLabel: "CPP (Canada Pension Plan), EI (Employment Insurance), Provincial Workers Comp",
    },
    telephonyRail: "cloud_pbx",
    telephonyReason: "Cloud PBX & SIP interconnect with CASL (Canada Anti-Spam Legislation) compliance",
    voiceAIPersona: {
      language: "Canadian English, Canadian French",
      accent: "Polite, neutral Canadian bilingual commercial tone",
      description: "Gemini 3.8 Live bilingual discovery agent for Canadian cross-provincial trade",
    },
    capabilitiesSummary: [
      "Provincial Tax Rules: GST (5%), HST (13-15%), and PST/QST dual-rate calculations",
      "CRA 9-digit Business Number format validation",
      "Pluggable telephony adapter: Zero vendor lock-in (hot-switch carriers anytime)",
      "CASL (Canadian Anti-Spam Law) automated opt-in record management",
    ],
  },
  {
    code: "OTHER",
    name: "Other Country / Global",
    flag: "🌍",
    phoneCode: "+",
    phoneMask: "123 456 7890",
    currency: "USD",
    currencySymbol: "$",
    numberFormat: "millions",
    defaultTimezone: "UTC",
    timezones: ["UTC", "America/New_York", "Europe/London", "Asia/Dubai", "Asia/Singapore", "Asia/Kolkata", "Asia/Tokyo", "Africa/Nairobi", "Australia/Sydney"],
    administrativeAreaType: "Region",
    administrativeAreas: [],
    taxJurisdiction: {
      code: "GLOBAL-TAX",
      name: "National Tax & Customs Authority",
      taxIdLabel: "Tax Identification Number (TIN / VAT)",
      taxIdFormat: "National Corporate Tax ID",
      standardRates: "Standard national rate / Zero-rated exports",
    },
    workforceJurisdiction: {
      code: "GLOBAL-LABOUR",
      name: "National Labour & Social Security Authority",
      complianceLabel: "Standard statutory employment & payroll contributions",
    },
    telephonyRail: "cloud_pbx",
    telephonyReason: "Carrier-agnostic Cloud PBX and SIP Gateway",
    voiceAIPersona: {
      language: "International English and Regional Languages",
      accent: "Clear, neutral international commercial tone",
      description: "Gemini 3.8 Live universal multilingual sales qualifier",
    },
    capabilitiesSummary: [
      "Universal multi-currency support with custom exchange rates",
      "Carrier-agnostic pluggable telephony & messaging adapter (zero vendor lock-in)",
      "Customizable national tax rules, invoices, and business identifier labels",
      "Global Google Maps Places address autocompletion and geocoding",
    ],
  },
];

const COUNTRY_MAP = new Map<string, CountryConfig>(
  COUNTRIES.map((country) => [country.code, country]),
);

/**
 * Returns configuration for a given country code (defaults to India if not found)
 */
export function getCountryConfig(countryCode?: string): CountryConfig {
  if (!countryCode) return COUNTRIES[0];
  const upper = countryCode.trim().toUpperCase();
  return COUNTRY_MAP.get(upper) ?? COUNTRIES.find((c) => c.code === "OTHER") ?? COUNTRIES[0];
}

/**
 * Returns the list of administrative areas (states, emirates, provinces) for a country code
 */
export function getAdministrativeAreas(countryCode: string): AdministrativeArea[] {
  return getCountryConfig(countryCode).administrativeAreas;
}

/**
 * Formats monetary amounts according to the country's numbering system and currency symbol
 */
export function formatLocalizedCurrency(
  amount: number,
  countryCode: string,
  overrideCurrency?: string,
): string {
  const config = getCountryConfig(countryCode);
  const currency = overrideCurrency || config.currency;

  if (config.numberFormat === "lakhs" && currency === "INR") {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(amount);
  }

  const locale = countryCode === "DE" ? "de-DE" : countryCode === "AE" ? "en-AE" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}
