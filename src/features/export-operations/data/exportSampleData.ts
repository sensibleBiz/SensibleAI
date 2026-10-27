// Export Software Sample Data - Sensible Impex Global Export Office
export interface BuyerLead {
  id: string;
  companyName: string;
  country: string;
  flag: string;
  port: string;
  source: 'Volza Trade Data' | 'Apollo.io' | 'Trade Fair' | 'Inbound Inquiry';
  productInterest: string;
  hsCode: string;
  annualImportVolume: string;
  contactPerson: string;
  designation: string;
  email: string;
  emailStatus: 'Verified (MillionVerifier)' | 'Catch-All' | 'Pending';
  phone: string;
  pipelineStage: 'Discovered' | 'Outreach Sent' | 'Inquiry / Specs' | 'Sample Dispatched' | 'Quotation (PI)' | 'Order Confirmed';
  estimatedValueUSD: number;
  lastContact: string;
  notes: string;
}

export interface SupplierRecord {
  id: string;
  name: string;
  location: string;
  state: string;
  products: string[];
  gstNo: string;
  fssaiNo: string;
  iecNo?: string;
  ratingScore: number; // 0 - 100
  ratingBreakdown: {
    price: number; // 30%
    quality: number; // 25%
    delivery: number; // 20%
    documentation: number; // 10%
    communication: number; // 10%
    complaints: number; // 5%
  };
  certifications: string[];
  capacityPerMonthMT: number;
  paymentTerms: string;
  contactPerson: string;
  phone: string;
}

export interface ProductCostingItem {
  id: string;
  name: string;
  hsCode: string;
  grade: string;
  specifications: string;
  standardPackaging: string;
  moqMT: number;
  basePurchaseInrKg: number;
  cleaningSortingInrKg: number;
  packagingInrKg: number;
  inlandFreightInrKg: number;
  chaPortChargesInrKg: number;
  seaFreightUsdMT: number;
  transitDays: number;
  typicalMarginPct: number;
}

export interface ContainerShipment {
  id: string;
  containerNo: string;
  bookingRef: string;
  buyerName: string;
  destinationCountry: string;
  destinationPort: string;
  loadingPort: string;
  shippingLine: string;
  vesselName: string;
  voyageNo: string;
  cargoDescription: string;
  containerType: '20ft Standard (GP)' | '40ft High Cube (HC)';
  totalWeightMT: number;
  totalBagsOrCartons: number;
  cbm: number;
  etd: string;
  eta: string;
  currentMilestone: 'Booking Confirmed' | 'Container Stuffed' | 'Customs Cleared' | 'Vessel Departed' | 'Transshipment' | 'Vessel Arrived' | 'Delivered';
  progressPct: number;
  milestones: {
    name: string;
    date: string;
    location: string;
    status: 'completed' | 'in-progress' | 'pending';
  }[];
}

export const INITIAL_BUYERS: BuyerLead[] = [
  {
    id: 'BY-101',
    companyName: 'Asia Agri Commodities Sdn Bhd',
    country: 'Malaysia',
    flag: '🇲🇾',
    port: 'Port Klang',
    source: 'Volza Trade Data',
    productInterest: 'Turmeric Salem Finger (Double Polished)',
    hsCode: '09103020',
    annualImportVolume: '180 MT / year',
    contactPerson: 'Tan Sri Daniel Lim',
    designation: 'Head of Global Procurement',
    email: 'daniel.lim@asiaagricomm.my',
    emailStatus: 'Verified (MillionVerifier)',
    phone: '+60 3-8941 2288',
    pipelineStage: 'Quotation (PI)',
    estimatedValueUSD: 52400,
    lastContact: 'Yesterday at 3:15 PM',
    notes: 'Requested CIF Port Klang quotation for 2 x 20ft FCL (36 MT). High priority.'
  },
  {
    id: 'BY-102',
    companyName: 'Southern Cross Spices Pty Ltd',
    country: 'Australia',
    flag: '🇦🇺',
    port: 'Melbourne Port',
    source: 'Volza Trade Data',
    productInterest: 'Black Pepper Malabar 550 GL (Garbled)',
    hsCode: '09041130',
    annualImportVolume: '95 MT / year',
    contactPerson: 'David Hemsworth',
    designation: 'Managing Director & Buyer',
    email: 'd.hemsworth@southerncrossspices.com.au',
    emailStatus: 'Verified (MillionVerifier)',
    phone: '+61 3 9820 4110',
    pipelineStage: 'Sample Dispatched',
    estimatedValueUSD: 41000,
    lastContact: '2 days ago',
    notes: 'Sample courier sent via DHL (Airway Bill #74819203). Needs microbial lab certificate.'
  },
  {
    id: 'BY-103',
    companyName: 'Maple Leaf Foods Trading Inc',
    country: 'Canada',
    flag: '🇨🇦',
    port: 'Montreal Port',
    source: 'Apollo.io',
    productInterest: 'Cumin Seeds (Jeera) Singapore 99% Clean',
    hsCode: '09093129',
    annualImportVolume: '120 MT / year',
    contactPerson: 'Marc Tremblay',
    designation: 'Category Purchase Manager',
    email: 'm.tremblay@mapleleafimport.ca',
    emailStatus: 'Verified (MillionVerifier)',
    phone: '+1 514 620 9940',
    pipelineStage: 'Inquiry / Specs',
    estimatedValueUSD: 68500,
    lastContact: '3 days ago',
    notes: 'Discussing pesticide residue compliance under CFIA regulations.'
  },
  {
    id: 'BY-104',
    companyName: 'Gulf Spices & Pulses LLC',
    country: 'United Arab Emirates',
    flag: '🇦🇪',
    port: 'Jebel Ali, Dubai',
    source: 'Trade Fair',
    productInterest: '1121 XXL Steam Basmati Rice',
    hsCode: '10063020',
    annualImportVolume: '500 MT / year',
    contactPerson: 'Rashid Al Nuaimi',
    designation: 'Supply Chain Director',
    email: 'rashid@gulfspices.ae',
    emailStatus: 'Verified (MillionVerifier)',
    phone: '+971 4 332 9800',
    pipelineStage: 'Order Confirmed',
    estimatedValueUSD: 118000,
    lastContact: 'Today at 11:20 AM',
    notes: 'LC opened at Emirates NBD. Stuffing scheduled for 4 x 40ft containers next Monday.'
  },
  {
    id: 'BY-105',
    companyName: 'Nippon Orient Trading Co.',
    country: 'Japan',
    flag: '🇯🇵',
    port: 'Yokohama Port',
    source: 'Volza Trade Data',
    productInterest: 'Organic Turmeric Powder (Curcumin 4.5%+)',
    hsCode: '09103030',
    annualImportVolume: '60 MT / year',
    contactPerson: 'Kenji Sato',
    designation: 'Senior Import Executive',
    email: 'k.sato@nippon-orient.jp',
    emailStatus: 'Verified (MillionVerifier)',
    phone: '+81 3 5500 1200',
    pipelineStage: 'Outreach Sent',
    estimatedValueUSD: 36000,
    lastContact: '4 days ago',
    notes: 'Cold outreach sequence Step 2 delivered via Instantly. Japanese brochure attached.'
  },
  {
    id: 'BY-106',
    companyName: 'Bavaria Spice Merchants GmbH',
    country: 'Germany',
    flag: '🇩🇪',
    port: 'Hamburg Port',
    source: 'Apollo.io',
    productInterest: 'Green Cardamom (Alleppey Bold 8mm)',
    hsCode: '09083110',
    annualImportVolume: '45 MT / year',
    contactPerson: 'Stefan Richter',
    designation: 'VP Sourcing',
    email: 's.richter@bavaria-spices.de',
    emailStatus: 'Verified (MillionVerifier)',
    phone: '+49 89 2311 00',
    pipelineStage: 'Discovered',
    estimatedValueUSD: 72000,
    lastContact: 'Discovered today via Volza',
    notes: 'Active importer from India. Previous shipments recorded with Cochin port.'
  }
];

export const INITIAL_SUPPLIERS: SupplierRecord[] = [
  {
    id: 'SUP-01',
    name: 'Sri Balaji Agro Processing Mills',
    location: 'Salem, Tamil Nadu',
    state: 'Tamil Nadu',
    products: ['Salem Turmeric Finger', 'Nizamabad Bulb', 'Curcumin Turmeric Powder'],
    gstNo: '33AABCS1294F1Z3',
    fssaiNo: '12419008000341',
    iecNo: '3318029141',
    ratingScore: 92,
    ratingBreakdown: {
      price: 28, // out of 30
      quality: 24, // out of 25
      delivery: 18, // out of 20
      documentation: 9, // out of 10
      communication: 9, // out of 10
      complaints: 4 // out of 5
    },
    certifications: ['FSSAI Exporter', 'Spices Board RCMC', 'APEDA Registered', 'ISO 22000:2018'],
    capacityPerMonthMT: 250,
    paymentTerms: '20% Advance, 80% on Dispatch / Weighment Slip',
    contactPerson: 'K. Senthil Kumar (Managing Partner)',
    phone: '+91 94432 10982'
  },
  {
    id: 'SUP-02',
    name: 'Unjha Commodity Mandi Syndicate',
    location: 'Unjha, Mehsana District',
    state: 'Gujarat',
    products: ['Cumin Seeds (Jeera)', 'Fennel Seeds (Saunf)', 'Coriander Seeds'],
    gstNo: '24AAJFU4812K1Z8',
    fssaiNo: '10720014000192',
    iecNo: '2416003290',
    ratingScore: 89,
    ratingBreakdown: {
      price: 27,
      quality: 23,
      delivery: 19,
      documentation: 8,
      communication: 8,
      complaints: 4
    },
    certifications: ['FSSAI', 'Spices Board India', 'AGMARK Special Grade'],
    capacityPerMonthMT: 400,
    paymentTerms: 'Against Warehouse Goods Receipt (Mandi Delivery)',
    contactPerson: 'Bhavin Patel',
    phone: '+91 98251 44810'
  },
  {
    id: 'SUP-03',
    name: 'Highland Spices & Plantations Co.',
    location: 'Kumily, Idukki District',
    state: 'Kerala',
    products: ['Malabar Black Pepper (550 GL)', 'Green Cardamom (8mm Bold)', 'Cloves'],
    gstNo: '32AADCH5510Q1ZY',
    fssaiNo: '11318002000889',
    ratingScore: 94,
    ratingBreakdown: {
      price: 26,
      quality: 25,
      delivery: 19,
      documentation: 10,
      communication: 9,
      complaints: 5
    },
    certifications: ['Rainforest Alliance', 'FSSAI', 'Organic India NPOP', 'Spices Board'],
    capacityPerMonthMT: 90,
    paymentTerms: 'Immediate RTGS on Quality Inspection',
    contactPerson: 'Mathew George',
    phone: '+91 94470 33219'
  },
  {
    id: 'SUP-04',
    name: 'Heritage Basmati Rice Exporters Ltd',
    location: 'Tarn Taran, Amritsar',
    state: 'Punjab',
    products: ['1121 XXL Steam Basmati', 'Traditional Basmati', 'Sugandha Parboiled'],
    gstNo: '03AAACH9918M1ZF',
    fssaiNo: '12117001000450',
    iecNo: '0310009210',
    ratingScore: 87,
    ratingBreakdown: {
      price: 25,
      quality: 24,
      delivery: 17,
      documentation: 9,
      communication: 8,
      complaints: 4
    },
    certifications: ['BRC Global Standards', 'FSSAI', 'USFDA Registered', 'HALAL Certified'],
    capacityPerMonthMT: 1200,
    paymentTerms: '25% Advance, balance against Draft BL scan',
    contactPerson: 'Gurpreet Singh',
    phone: '+91 98140 77123'
  }
];

export const INITIAL_PRODUCTS: ProductCostingItem[] = [
  {
    id: 'PROD-01',
    name: 'Salem Turmeric Finger (Double Polished)',
    hsCode: '09103020',
    grade: 'Salem Super Grade A',
    specifications: 'Curcumin: 3.2% min, Moisture: 9.5% max, Total Ash: 7% max, Foreign matter: 0.5% max',
    standardPackaging: '25 kg or 50 kg Double-stitched Jute / PP Bags with inner poly liner',
    moqMT: 18, // 1 x 20ft container
    basePurchaseInrKg: 148,
    cleaningSortingInrKg: 4.5,
    packagingInrKg: 3.0,
    inlandFreightInrKg: 4.2, // to Nhava Sheva or Chennai
    chaPortChargesInrKg: 2.8,
    seaFreightUsdMT: 45, // to Southeast Asia / Port Klang
    transitDays: 9,
    typicalMarginPct: 14
  },
  {
    id: 'PROD-02',
    name: 'Unjha Cumin Seeds (Jeera)',
    hsCode: '09093129',
    grade: 'Machine Cleaned 99% Pure (Singapore Quality)',
    specifications: 'Purity: 99.0% min, Moisture: 8.5% max, Volatile Oil: 2.5% min, Pesticides: EU/US compliant',
    standardPackaging: '25 kg Paper bags / PP woven bags',
    moqMT: 14,
    basePurchaseInrKg: 275,
    cleaningSortingInrKg: 6.0,
    packagingInrKg: 4.0,
    inlandFreightInrKg: 3.5, // to Mundra Port
    chaPortChargesInrKg: 3.0,
    seaFreightUsdMT: 65,
    transitDays: 14,
    typicalMarginPct: 12
  },
  {
    id: 'PROD-03',
    name: 'Malabar Black Pepper 550 GL',
    hsCode: '09041130',
    grade: 'Garbled Extra Bold (Tellicherry / Malabar)',
    specifications: 'Bulk Density: 550 g/L, Moisture: 11% max, Piperine content: 4.5% min, Foreign Matter: 0.5% max',
    standardPackaging: '25 kg multi-wall craft paper bags with PE inner liner',
    moqMT: 15,
    basePurchaseInrKg: 640,
    cleaningSortingInrKg: 8.0,
    packagingInrKg: 5.5,
    inlandFreightInrKg: 4.0, // to Cochin Port
    chaPortChargesInrKg: 3.5,
    seaFreightUsdMT: 110,
    transitDays: 21,
    typicalMarginPct: 15
  },
  {
    id: 'PROD-04',
    name: '1121 XXL Steam Basmati Rice',
    hsCode: '10063020',
    grade: 'Extra Long Grain (8.35mm+ Avg Grain Length)',
    specifications: 'Elongation ratio: 2.5x, Moisture: 12.0% max, Broken grain: 1.0% max, Chalky: Nil',
    standardPackaging: '10 kg / 20 kg / 25 kg Non-woven fabric or BoPP packaging bags',
    moqMT: 25, // 1 x 40ft HC
    basePurchaseInrKg: 94,
    cleaningSortingInrKg: 2.5,
    packagingInrKg: 3.8,
    inlandFreightInrKg: 3.2,
    chaPortChargesInrKg: 2.2,
    seaFreightUsdMT: 40,
    transitDays: 7,
    typicalMarginPct: 10
  }
];

export const INITIAL_SHIPMENTS: ContainerShipment[] = [
  {
    id: 'SH-8901',
    containerNo: 'MSKU9482103',
    bookingRef: 'BKG-MAERSK-9811',
    buyerName: 'Asia Agri Commodities Sdn Bhd',
    destinationCountry: 'Malaysia 🇲🇾',
    destinationPort: 'Port Klang',
    loadingPort: 'Nhava Sheva (JNPT), India',
    shippingLine: 'Maersk Line',
    vesselName: 'MAERSK KALAMATA',
    voyageNo: '2408E',
    cargoDescription: '720 Bags (18 MT) Salem Turmeric Finger',
    containerType: '20ft Standard (GP)',
    totalWeightMT: 18.45,
    totalBagsOrCartons: 720,
    cbm: 29.5,
    etd: '24 Sep 2026',
    eta: '04 Oct 2026',
    currentMilestone: 'Vessel Departed',
    progressPct: 65,
    milestones: [
      { name: 'Empty Container Released & Stuffed', date: '21 Sep 2026', location: 'Navi Mumbai CFS', status: 'completed' },
      { name: 'Customs & Port Gate-In (LEO Received)', date: '22 Sep 2026', location: 'JNPT Port Gate', status: 'completed' },
      { name: 'Loaded on Vessel & Departed', date: '24 Sep 2026', location: 'Nhava Sheva Terminal 4', status: 'completed' },
      { name: 'Ocean Transit & Malacca Strait', date: '29 Sep 2026', location: 'En Route to Port Klang', status: 'in-progress' },
      { name: 'Discharge & Final Customs Delivery', date: '04 Oct 2026 (ETA)', location: 'Westports, Port Klang', status: 'pending' }
    ]
  },
  {
    id: 'SH-8902',
    containerNo: 'CMAU6193021',
    bookingRef: 'BKG-CMA-4402',
    buyerName: 'Southern Cross Spices Pty Ltd',
    destinationCountry: 'Australia 🇦🇺',
    destinationPort: 'Melbourne Port',
    loadingPort: 'Cochin Port (ICTT Vallarpadam)',
    shippingLine: 'CMA CGM',
    vesselName: 'CMA CGM BIANCA',
    voyageNo: '0912S',
    cargoDescription: '600 Bags (15 MT) Malabar Black Pepper 550GL',
    containerType: '20ft Standard (GP)',
    totalWeightMT: 15.3,
    totalBagsOrCartons: 600,
    cbm: 26.8,
    etd: '18 Sep 2026',
    eta: '09 Oct 2026',
    currentMilestone: 'Transshipment',
    progressPct: 52,
    milestones: [
      { name: 'Stuffed & Phytosanitary Sealed', date: '15 Sep 2026', location: 'Cochin CFS', status: 'completed' },
      { name: 'Port Clearance & Loaded', date: '18 Sep 2026', location: 'Cochin Port', status: 'completed' },
      { name: 'Transshipment Port Call', date: '28 Sep 2026', location: 'Singapore Port PSA', status: 'completed' },
      { name: 'Ocean Leg to Melbourne', date: '01 Oct 2026', location: 'Southern Ocean', status: 'in-progress' },
      { name: 'Arrival & Biosecurity Australia Clearance', date: '09 Oct 2026 (ETA)', location: 'Melbourne Terminal', status: 'pending' }
    ]
  },
  {
    id: 'SH-8903',
    containerNo: 'HLCU9018442',
    bookingRef: 'BKG-HAPAG-7719',
    buyerName: 'Gulf Spices & Pulses LLC',
    destinationCountry: 'UAE 🇦🇪',
    destinationPort: 'Jebel Ali, Dubai',
    loadingPort: 'Mundra Port, Gujarat',
    shippingLine: 'Hapag-Lloyd',
    vesselName: 'AL DHAEN EXPRESS',
    voyageNo: '110W',
    cargoDescription: '1000 Bags (25 MT) 1121 Basmati Rice',
    containerType: '40ft High Cube (HC)',
    totalWeightMT: 25.5,
    totalBagsOrCartons: 1000,
    cbm: 42.0,
    etd: '02 Oct 2026',
    eta: '07 Oct 2026',
    currentMilestone: 'Container Stuffed',
    progressPct: 25,
    milestones: [
      { name: 'Cargo Quality Inspection & Weighment', date: '28 Sep 2026', location: 'Mundra Warehouse 3', status: 'completed' },
      { name: 'Container Stuffing & Seal Affixed', date: '30 Sep 2026', location: 'Mundra CFS', status: 'completed' },
      { name: 'Customs LEO & Port Berth Loading', date: '01 Oct 2026', location: 'Mundra Port MICT', status: 'in-progress' },
      { name: 'Vessel Sailing (Arabian Sea)', date: '02 Oct 2026', location: 'Mundra -> Jebel Ali', status: 'pending' },
      { name: 'Vessel Arrival & Delivery against LC', date: '07 Oct 2026', location: 'Jebel Ali Port Terminal 2', status: 'pending' }
    ]
  }
];

