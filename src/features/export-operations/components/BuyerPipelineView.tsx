import React, { useState } from 'react';
import { 
  Filter, Plus, Mail, Sparkles, Building2, MapPin, 
  Check, Copy, Phone, Calendar, Upload, RotateCcw, Bell
} from 'lucide-react';
import { INITIAL_BUYERS } from '../data/exportSampleData';
import type { BuyerLead } from '../data/exportSampleData';

interface BuyerPipelineViewProps {
  onNavigateToCosting: (productName: string) => void;
  currency: 'USD' | 'EUR' | 'INR';
  currencyRate: { USD: number; EUR: number; INR: number };
}

export const BuyerPipelineView: React.FC<BuyerPipelineViewProps> = ({ 
  onNavigateToCosting, 
  currency, 
  currencyRate 
}) => {
  const [buyers, setBuyers] = useState<BuyerLead[]>(INITIAL_BUYERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState<string>('All');
  const [activeStageTab, setActiveStageTab] = useState<string>('New');
  const [qualifiedStage, setQualifiedStage] = useState<boolean>(true);
  const [selectedBuyer, setSelectedBuyer] = useState<BuyerLead | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);

  const formatMoney = (valUSD: number) => {
    if (currency === 'USD') return `$${valUSD.toLocaleString()}`;
    if (currency === 'EUR') return `€${Math.round(valUSD * currencyRate.EUR).toLocaleString()}`;
    return `₹${Math.round(valUSD * currencyRate.INR).toLocaleString()}`;
  };

  const filteredBuyers = buyers.filter(b => {
    const matchesSearch = 
      b.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.productInterest.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.contactPerson.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSource = selectedSource === 'All' || b.source === selectedSource;
    return matchesSearch && matchesSource;
  });

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const stageTabs = [
    { name: 'New', count: 3 },
    { name: 'Unassigned', count: 58 },
    { name: 'Assigned', count: 28 },
    { name: 'Follow Up', count: 2 },
    { name: 'Won', count: 2 },
    { name: 'Lost', count: 0 },
    { name: 'Disqualified', count: 25 },
  ];

  const generateOutreachTemplate = (buyer: BuyerLead) => {
    return `Subject: Sourcing Partnership: Premium Quality ${buyer.productInterest} from Sensible Impex, India

Dear ${buyer.contactPerson},

I noticed ${buyer.companyName}'s regular imports of agricultural commodities at ${buyer.port}. 

At Sensible Impex (APEDA & Spices Board registered), we specialize in direct-origin sourcing of ${buyer.productInterest} from Salem and Unjha processing hubs.

Key export parameters:
• Lab Certified (Purity & Moisture specifications tailored for ${buyer.country})
• Container stuffing in 20ft & 40ft HC with desiccants & phytosanitary sealing
• Fast transit from Nhava Sheva / Mundra with competitive CIF ${buyer.port} pricing

May I send you our latest export grade specification sheet and sample lot analysis?

Best regards,
Rohit Tamkar
Export Business Director | Sensible Impex
exports@harimmaimpex.com | +91 98765 43210`;
  };

  return (
    <div className="module-container">
      {/* 1. Deep Navy Hero Banner (#0b2545) */}
      <section className="hero-banner-navy">
        <div className="hero-banner-left">
          <h1>Lead Pipeline</h1>
          <p>Track and manage your leads through the export sales pipeline</p>
        </div>

        <div className="hero-banner-controls">
          <div className="stage-toggle-pill">
            <span>Qualified stage</span>
            <div className="toggle-switch-ui" onClick={() => setQualifiedStage(!qualifiedStage)}>
              <span className={`toggle-opt ${!qualifiedStage ? 'active' : ''}`}>Off</span>
              <span className={`toggle-opt ${qualifiedStage ? 'active' : ''}`}>On</span>
            </div>
          </div>

          <div className="date-range-pill">
            <Calendar size={14} />
            <span>24 Sep, 2026 → 30 Sep, 2026</span>
          </div>

          <button className="btn-banner-outline" onClick={() => alert('Bulk Upload CSV ready: Supports Volza customs trade records & Apollo CSV formats')}>
            <Upload size={14} /> Bulk Upload
          </button>

          <button className="btn-coral-cta" onClick={() => {
            const newBuyer: BuyerLead = {
              id: `BY-${Date.now().toString().slice(-3)}`,
              companyName: 'Nusantara Spices Berhad',
              country: 'Malaysia',
              flag: '🇲🇾',
              port: 'Penang Port',
              source: 'Volza Trade Data',
              productInterest: 'Turmeric Salem Finger',
              hsCode: '09103020',
              annualImportVolume: '60 MT / year',
              contactPerson: 'Mr Vijay',
              designation: 'Managing Director',
              email: 'vijay@nusantaraspices.my',
              emailStatus: 'Verified (MillionVerifier)',
              phone: '9886613050',
              pipelineStage: 'Discovered',
              estimatedValueUSD: 38000,
              lastContact: 'Just now',
              notes: 'Added from Volza customs feed.'
            };
            setBuyers([newBuyer, ...buyers]);
          }}>
            <Plus size={16} /> + New Enquiry
          </button>
        </div>
      </section>

      {/* 2. Filter Strip */}
      <section className="filter-strip-card">
        <div className="filter-tag-title">
          <Filter size={15} /> Filters
        </div>

        <select className="filter-select">
          <option>Assigned To</option>
          <option>Rohit Tamkar (Admin)</option>
          <option>Export Desk</option>
        </select>

        <select 
          className="filter-select"
          value={selectedSource}
          onChange={e => setSelectedSource(e.target.value)}
        >
          <option value="All">Source: All</option>
          <option value="Volza Trade Data">Volza Customs Data</option>
          <option value="Apollo.io">Apollo.io</option>
          <option value="Trade Fair">Trade Fairs</option>
        </select>

        <select className="filter-select">
          <option>Enquiry Type</option>
          <option>FOB Nhava Sheva</option>
          <option>CIF Port Klang</option>
          <option>CIF Melbourne</option>
        </select>

        <div className="filter-search-input">
          <input 
            type="text" 
            placeholder="Search name, mobile, business or commodity..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <button className="btn-filter-reset" onClick={() => {
          setSearchQuery('');
          setSelectedSource('All');
        }}>
          <RotateCcw size={13} /> Reset
        </button>
      </section>

      {/* 3. Horizontal Colored-Border KPI Cards */}
      <section className="kpi-cards-strip">
        <div className="sensible-kpi-card kpi-total">
          <div className="kpi-top-row">
            <span className="kpi-title-label">TOTAL LEADS</span>
            <div className="kpi-icon-pill"><Building2 size={16} /></div>
          </div>
          <div className="kpi-big-number">118</div>
          <span className="kpi-sub-trend">Global Importers in DB</span>
        </div>

        <div className="sensible-kpi-card kpi-new">
          <div className="kpi-top-row">
            <span className="kpi-title-label">NEW LEADS</span>
            <div className="kpi-icon-pill"><Sparkles size={16} /></div>
          </div>
          <div className="kpi-big-number">3</div>
          <span className="kpi-sub-trend">Volza Trade Matches</span>
        </div>

        <div className="sensible-kpi-card kpi-followup">
          <div className="kpi-top-row">
            <span className="kpi-title-label">FOLLOW UP</span>
            <div className="kpi-icon-pill"><Bell size={16} /></div>
          </div>
          <div className="kpi-big-number">2</div>
          <span className="kpi-sub-trend">Sample Inquiries</span>
        </div>

        <div className="sensible-kpi-card kpi-won">
          <div className="kpi-top-row">
            <span className="kpi-title-label">WON</span>
            <div className="kpi-icon-pill"><Check size={16} /></div>
          </div>
          <div className="kpi-big-number">2</div>
          <span className="kpi-sub-trend">Confirmed Export PI</span>
        </div>

        <div className="sensible-kpi-card kpi-lost">
          <div className="kpi-top-row">
            <span className="kpi-title-label">LOST</span>
            <div className="kpi-icon-pill"><RotateCcw size={16} /></div>
          </div>
          <div className="kpi-big-number">0</div>
          <span className="kpi-sub-trend">0% Churn Rate</span>
        </div>
      </section>

      {/* 4. Stage Tabs with Red Notification Badges */}
      <section className="stage-tabs-row">
        {stageTabs.map(tab => (
          <button 
            key={tab.name}
            className={`stage-tab-btn ${activeStageTab === tab.name ? 'active' : ''}`}
            onClick={() => setActiveStageTab(tab.name)}
          >
            <span>{tab.name}</span>
            <span className="stage-badge-count">{tab.count}</span>
          </button>
        ))}
      </section>

      {/* 5. Lead Cards Grid (Replicating exact card style) */}
      <section className="leads-cards-grid">
        {filteredBuyers.map(b => (
          <div 
            key={b.id} 
            className="lead-saas-card"
            onClick={() => setSelectedBuyer(b)}
          >
            {/* Top row: Avatar + Name + Ringing badge */}
            <div className="lead-card-head">
              <div className="lead-card-profile">
                <div className="lead-avatar-circle">
                  {getInitials(b.contactPerson)}
                </div>
                <div className="lead-name-col">
                  <strong>{b.contactPerson}</strong>
                  <span className="lead-source-sub">
                    <span className="source-micro-tag volza">{b.source.split(' ')[0]}</span>
                    <span>{b.companyName}</span>
                  </span>
                </div>
              </div>
              <span className="lead-status-pill amber">
                <Bell size={11} /> Ringing
              </span>
            </div>

            {/* Badges */}
            <div className="lead-badges-row">
              <span className="micro-chip-outline">Prospect</span>
              <span className="micro-chip-outline">New Lead</span>
              <span className="micro-chip-outline">{b.country}</span>
            </div>

            {/* Phone */}
            <div className="lead-contact-line phone">
              <Phone size={13} />
              <span>{b.phone}</span>
            </div>

            {/* Location */}
            <div className="lead-contact-line location">
              <MapPin size={13} />
              <span>{b.port}, {b.country}</span>
            </div>

            {/* Bottom strip: Date, WhatsApp, Product Pill */}
            <div className="lead-card-bottom-strip">
              <div className="bottom-date-chip">
                <Calendar size={12} />
                <span>30-09-2026</span>
              </div>
              <span className="bottom-whatsapp-icon" title="WhatsApp connected">💬</span>
              <span className="bottom-tag-pill">
                {b.productInterest.split(' ')[0]} {b.productInterest.split(' ')[1] || ''} ...
              </span>
            </div>
          </div>
        ))}
      </section>

      {/* Buyer Details Modal */}
      {selectedBuyer && !emailModalOpen && (
        <div className="modal-backdrop" onClick={() => setSelectedBuyer(null)}>
          <div className="modal-card wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="lead-status-pill green">
                  <Check size={12} /> {selectedBuyer.source}
                </span>
                <h3>{selectedBuyer.flag} {selectedBuyer.companyName}</h3>
                <p className="modal-sub">{selectedBuyer.port}, {selectedBuyer.country}</p>
              </div>
              <button className="close-btn" onClick={() => setSelectedBuyer(null)}>×</button>
            </div>

            <div className="modal-body-grid">
              <div className="modal-section">
                <h4>Customs & Import Intelligence (Volza)</h4>
                <div className="info-list">
                  <div className="info-item">
                    <span className="lbl">Target Commodity:</span>
                    <strong>{selectedBuyer.productInterest} (HS: {selectedBuyer.hsCode})</strong>
                  </div>
                  <div className="info-item">
                    <span className="lbl">Annual Volume:</span>
                    <strong>{selectedBuyer.annualImportVolume}</strong>
                  </div>
                  <div className="info-item">
                    <span className="lbl">Discharge Port:</span>
                    <strong>{selectedBuyer.port}</strong>
                  </div>
                  <div className="info-item">
                    <span className="lbl">Estimated Order Value:</span>
                    <strong>{formatMoney(selectedBuyer.estimatedValueUSD)}</strong>
                  </div>
                </div>
              </div>

              <div className="modal-section">
                <h4>Decision-Maker Profile (Apollo.io)</h4>
                <div className="info-list">
                  <div className="info-item">
                    <span className="lbl">Contact Name:</span>
                    <strong>{selectedBuyer.contactPerson}</strong>
                  </div>
                  <div className="info-item">
                    <span className="lbl">Designation:</span>
                    <span>{selectedBuyer.designation}</span>
                  </div>
                  <div className="info-item">
                    <span className="lbl">Corporate Email:</span>
                    <span className="email-highlight">
                      {selectedBuyer.email} <span className="lead-status-pill green"><Check size={10} /> Verified</span>
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="lbl">Phone / Mobile:</span>
                    <span>{selectedBuyer.phone}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-notes-box">
              <strong>Buyer Commercial Notes:</strong>
              <p>{selectedBuyer.notes}</p>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setEmailModalOpen(true)}>
                <Mail size={15} /> Draft Outreach (Instantly)
              </button>
              <button 
                className="btn-primary" 
                onClick={() => {
                  const prod = selectedBuyer.productInterest;
                  setSelectedBuyer(null);
                  onNavigateToCosting(prod);
                }}
              >
                <Sparkles size={15} /> Calculate FOB/CIF Quotation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instantly Email Modal */}
      {selectedBuyer && emailModalOpen && (
        <div className="modal-backdrop" onClick={() => setEmailModalOpen(false)}>
          <div className="modal-card wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="lead-status-pill green">Instantly + AI Co-Pilot</span>
                <h3>Automated Cold Email Sequence</h3>
                <p className="modal-sub">To: {selectedBuyer.contactPerson} at {selectedBuyer.companyName}</p>
              </div>
              <button className="close-btn" onClick={() => setEmailModalOpen(false)}>×</button>
            </div>

            <div className="email-preview-box">
              <pre>{generateOutreachTemplate(selectedBuyer)}</pre>
            </div>

            <div className="modal-footer">
              <button 
                className="btn-secondary" 
                onClick={() => {
                  navigator.clipboard.writeText(generateOutreachTemplate(selectedBuyer));
                  setEmailCopied(true);
                  setTimeout(() => setEmailCopied(false), 2000);
                }}
              >
                {emailCopied ? <Check size={14} /> : <Copy size={14} />} 
                {emailCopied ? 'Copied!' : 'Copy Email'}
              </button>
              <button className="btn-primary" onClick={() => {
                alert(`Outreach campaign scheduled in Instantly for ${selectedBuyer.email}.`);
                setEmailModalOpen(false);
              }}>
                <Mail size={14} /> Launch Outreach
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

