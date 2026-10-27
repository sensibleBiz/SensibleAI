import React, { useState } from 'react';
import { 
  FileText, CheckCircle2, Download, RefreshCw, Landmark, Eye
} from 'lucide-react';

export const ExportDocumentsView: React.FC = () => {
  const [tallySynced, setTallySynced] = useState<boolean>(true);
  const [documents] = useState([
    {
      id: 'DOC-01',
      title: 'Commercial Invoice (Export under LUT)',
      refNo: 'INV/2026/092',
      buyer: 'Asia Agri Commodities Sdn Bhd',
      status: 'Ready for Bank Dispatch',
      type: 'Financial',
      date: '28 Sep 2026'
    },
    {
      id: 'DOC-02',
      title: 'Detailed Export Packing List',
      refNo: 'PL/2026/092 (720 Bags)',
      buyer: 'Asia Agri Commodities Sdn Bhd',
      status: 'Customs Endorsed',
      type: 'Logistics',
      date: '28 Sep 2026'
    },
    {
      id: 'DOC-03',
      title: 'Ocean Bill of Lading (Clean On Board)',
      refNo: 'BL-MAERSK-9482103',
      buyer: 'Asia Agri Commodities Sdn Bhd',
      status: 'Original Issued (3/3 Set)',
      type: 'Title Document',
      date: '25 Sep 2026'
    },
    {
      id: 'DOC-04',
      title: 'Phytosanitary Health Certificate',
      refNo: 'PSC/NPPO/IN/2026/4102',
      buyer: 'Govt Plant Quarantine Dept',
      status: 'Certified Pest-Free',
      type: 'Regulatory',
      date: '23 Sep 2026'
    },
    {
      id: 'DOC-05',
      title: 'Certificate of Origin (AIFTA - ASEAN Form)',
      refNo: 'COO/EIC/2026/7821',
      buyer: 'Export Inspection Council of India',
      status: 'Preferential Tariff Approved',
      type: 'Customs Duty Benefit',
      date: '24 Sep 2026'
    },
    {
      id: 'DOC-06',
      title: 'NABL Certified Lab Test Report (Curcumin 3.4%)',
      refNo: 'SGS/LAB/CHEM/8812',
      buyer: 'SGS Analytical India',
      status: 'Pesticide & Heavy Metal Cleared',
      type: 'Quality',
      date: '22 Sep 2026'
    }
  ]);

  return (
    <div className="module-container">
      {/* Header */}
      <div className="module-header">
        <div>
          <h2>Export Documentation Vault & Compliance Desk</h2>
          <p className="subtitle">
            Manage mandatory international trade paperwork, Letter of Credit (LC) compliance, and Tally Prime finance sync.
          </p>
        </div>

        <div className="header-actions">
          <button 
            className="btn-secondary"
            onClick={() => {
              setTallySynced(false);
              setTimeout(() => setTallySynced(true), 1200);
            }}
          >
            <RefreshCw size={15} /> {tallySynced ? 'Tally Prime Synced' : 'Syncing Tally XML...'}
          </button>
          <button className="btn-primary" onClick={() => alert('Export Document Dossier downloaded as consolidated ZIP')}>
            <Download size={16} /> Download Full B/L Bank Set
          </button>
        </div>
      </div>

      {/* Compliance Overview Banners */}
      <div className="compliance-banner-grid">
        <div className="comp-card card-panel">
          <div className="comp-top">
            <span className="comp-label">Letter of Undertaking (LUT)</span>
            <span className="badge-active">ACTIVE (2026-27)</span>
          </div>
          <p className="comp-desc">Zero-rated IGST export clearance via GST Portal. ARN #AD330326001928K</p>
        </div>

        <div className="comp-card card-panel">
          <div className="comp-top">
            <span className="comp-label">Bank AD Code Registration</span>
            <span className="badge-active">REGISTERED AT JNPT & MUNDRA</span>
          </div>
          <p className="comp-desc">SBI Overseas Branch • AD Code: 0210049. Automated EDPMS / IDPMS reconciliation.</p>
        </div>

        <div className="comp-card card-panel">
          <div className="comp-top">
            <span className="comp-label">Tally Prime ERP Status</span>
            <span className="badge-active">XML CONNECTOR ACTIVE</span>
          </div>
          <p className="comp-desc">Automatic multi-currency sales voucher creation & Forex fluctuation tracking.</p>
        </div>
      </div>

      {/* Documents Grid Table */}
      <div className="card-panel">
        <div className="panel-header">
          <div>
            <h3>Consignment Document Set — HI/EXP/2026/092</h3>
            <p className="panel-sub">Buyer: Asia Agri Commodities Sdn Bhd • Port Klang, Malaysia</p>
          </div>
          <span className="badge-tag">Bank Submission Ready</span>
        </div>

        <div className="documents-list">
          {documents.map((doc) => (
            <div key={doc.id} className="document-row-card">
              <div className="doc-icon-col">
                <FileText size={22} className="doc-icon" />
              </div>

              <div className="doc-info-col">
                <h4 className="doc-title">{doc.title}</h4>
                <div className="doc-meta">
                  <span className="ref-pill">Ref: {doc.refNo}</span>
                  <span className="type-pill">{doc.type}</span>
                  <span className="date-sub">Issued: {doc.date}</span>
                </div>
              </div>

              <div className="doc-status-col">
                <span className="verified-pill">
                  <CheckCircle2 size={13} /> {doc.status}
                </span>
              </div>

              <div className="doc-actions-col">
                <button 
                  className="table-action-btn"
                  onClick={() => alert(`Previewing official ${doc.title} with digital signature!`)}
                >
                  <Eye size={14} /> View document
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Finance & Letter of Credit Section */}
      <div className="finance-sync-card card-panel">
        <div className="finance-left">
          <div className="fin-icon"><Landmark size={24} /></div>
          <div>
            <h4>Letter of Credit (LC) / Advance Payment Escrow</h4>
            <p>Order Contract #HI-2026-092 ($52,400.00 USD). 30% Advance received in SBI EEFC Account.</p>
          </div>
        </div>
        <div className="finance-right">
          <div className="fin-stat">
            <span className="lbl">Advance Received:</span>
            <strong>$15,720.00 USD (₹13,20,480)</strong>
          </div>
          <div className="fin-stat">
            <span className="lbl">Balance against B/L:</span>
            <strong>$36,680.00 USD</strong>
          </div>
        </div>
      </div>
    </div>
  );
};

