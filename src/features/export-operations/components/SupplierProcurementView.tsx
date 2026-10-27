import React, { useState } from 'react';
import { 
  ShieldCheck, Clock, ArrowRight, Search, Filter, Send, FileCheck
} from 'lucide-react';
import { INITIAL_SUPPLIERS } from '../data/exportSampleData';
import type { SupplierRecord } from '../data/exportSampleData';

interface SupplierProcurementViewProps {
  currency: 'USD' | 'EUR' | 'INR';
}

export const SupplierProcurementView: React.FC<SupplierProcurementViewProps> = () => {
  const [suppliers] = useState<SupplierRecord[]>(INITIAL_SUPPLIERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProductFilter, setSelectedProductFilter] = useState('All');
  const [activeTab, setActiveTab] = useState<'directory' | 'rfq'>('directory');
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierRecord | null>(null);

  // Sample RFQ Comparison Data for Turmeric Salem Finger (36 MT)
  const [rfqQuotes, setRfqQuotes] = useState([
    {
      supplierId: 'SUP-01',
      supplierName: 'Sri Balaji Agro Processing Mills (Salem)',
      pricePerKgINR: 148.0,
      leadTimeDays: 5,
      curcuminPct: '3.4%',
      moisturePct: '9.2%',
      paymentTerms: '20% Adv, 80% on Dispatch',
      ratingScore: 92,
      recommendation: 'Best Quality & Lead Time (Recommended)',
      selected: true
    },
    {
      supplierId: 'SUP-02',
      supplierName: 'Erode Turmeric Mandi Corp (Erode)',
      pricePerKgINR: 145.5,
      leadTimeDays: 9,
      curcuminPct: '3.1%',
      moisturePct: '10.0%',
      paymentTerms: '100% Against Mandi Delivery',
      ratingScore: 86,
      recommendation: 'Lowest Price (Slightly slower dispatch)',
      selected: false
    },
    {
      supplierId: 'SUP-03',
      supplierName: 'Nizamabad Spices Syndicate (Telangana)',
      pricePerKgINR: 147.0,
      leadTimeDays: 7,
      curcuminPct: '3.2%',
      moisturePct: '9.6%',
      paymentTerms: '30% Adv, 70% LC',
      ratingScore: 88,
      recommendation: 'Balanced Option',
      selected: false
    }
  ]);

  const filteredSuppliers = suppliers.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          s.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesProduct = selectedProductFilter === 'All' || s.products.some(p => p.includes(selectedProductFilter));
    return matchesSearch && matchesProduct;
  });

  return (
    <div className="module-container">
      {/* Module Header */}
      <div className="module-header">
        <div>
          <h2>Procurement & Supplier Network Engine</h2>
          <p className="subtitle">
            Source directly from certified farmers, mills & mandis. Compare RFQs objectively using the <strong>Supplier Rating Matrix</strong>.
          </p>
        </div>

        <div className="header-actions">
          <div className="view-toggle">
            <button 
              className={activeTab === 'directory' ? 'active' : ''} 
              onClick={() => setActiveTab('directory')}
            >
              Supplier Directory
            </button>
            <button 
              className={activeTab === 'rfq' ? 'active' : ''} 
              onClick={() => setActiveTab('rfq')}
            >
              Multi-Vendor RFQ Matrix
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'directory' ? (
        <>
          {/* Filter Bar */}
          <div className="filter-bar">
            <div className="search-box">
              <Search size={18} />
              <input 
                type="text" 
                placeholder="Search mills, mandi traders, or location (Salem, Unjha, Kerala)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="filter-dropdown">
              <Filter size={16} />
              <span>Commodity:</span>
              <select value={selectedProductFilter} onChange={e => setSelectedProductFilter(e.target.value)}>
                <option value="All">All Commodities</option>
                <option value="Turmeric">Turmeric</option>
                <option value="Cumin">Cumin Seeds</option>
                <option value="Pepper">Black Pepper</option>
                <option value="Basmati">Basmati Rice</option>
              </select>
            </div>
          </div>

          {/* Supplier Grid */}
          <div className="supplier-cards-grid">
            {filteredSuppliers.map(s => (
              <div key={s.id} className="supplier-card card-panel" onClick={() => setSelectedSupplier(s)}>
                <div className="supplier-card-header">
                  <div>
                    <h3 className="supplier-title">{s.name}</h3>
                    <span className="supplier-loc">{s.location}</span>
                  </div>
                  <div className="rating-badge">
                    <span className="rating-num">{s.ratingScore}</span>
                    <span className="rating-scale">/100</span>
                  </div>
                </div>

                <div className="product-tags-wrap">
                  {s.products.map((p, idx) => (
                    <span key={idx} className="prod-chip">{p}</span>
                  ))}
                </div>

                <div className="compliance-row">
                  {s.certifications.map((cert, idx) => (
                    <span key={idx} className="cert-pill">
                      <ShieldCheck size={12} /> {cert}
                    </span>
                  ))}
                </div>

                <div className="rating-progress-block">
                  <div className="score-item">
                    <span>Price (30%)</span>
                    <strong>{s.ratingBreakdown.price}/30</strong>
                  </div>
                  <div className="score-item">
                    <span>Quality (25%)</span>
                    <strong>{s.ratingBreakdown.quality}/25</strong>
                  </div>
                  <div className="score-item">
                    <span>Delivery (20%)</span>
                    <strong>{s.ratingBreakdown.delivery}/20</strong>
                  </div>
                  <div className="score-item">
                    <span>Documentation (10%)</span>
                    <strong>{s.ratingBreakdown.documentation}/10</strong>
                  </div>
                </div>

                <div className="supplier-card-footer">
                  <div className="capacity-stat">
                    <span>Capacity:</span> <strong>{s.capacityPerMonthMT} MT / Month</strong>
                  </div>
                  <button className="text-btn">
                    View Scorecard <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* Multi-Vendor RFQ Comparison Matrix */
        <div className="rfq-container">
          <div className="rfq-banner card-panel">
            <div className="rfq-banner-info">
              <span className="badge-tag">Active Procurement Inquiry</span>
              <h3>RFQ #2026-TUR-014: 36 Metric Tons Turmeric Salem Finger</h3>
              <p>For Export Order: Asia Agri Commodities Sdn Bhd (Discharge: Port Klang, Malaysia)</p>
            </div>
            <div className="rfq-banner-actions">
              <button className="btn-secondary">
                <Send size={15} /> Invite More Suppliers
              </button>
            </div>
          </div>

          <div className="rfq-table-wrap card-panel">
            <table className="export-table rfq-table">
              <thead>
                <tr>
                  <th>Parameters</th>
                  {rfqQuotes.map((q, idx) => (
                    <th key={idx} className={q.selected ? 'selected-column' : ''}>
                      <div className="rfq-col-head">
                        <strong>{q.supplierName}</strong>
                        {q.selected && <span className="winner-tag">Selected Vendor</span>}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Quoted Rate (Ex-Mill)</strong></td>
                  {rfqQuotes.map((q, idx) => (
                    <td key={idx} className={q.selected ? 'selected-column bold-cell' : 'bold-cell'}>
                      ₹{q.pricePerKgINR.toFixed(2)} / kg
                    </td>
                  ))}
                </tr>
                <tr>
                  <td><strong>Dispatch Lead Time</strong></td>
                  {rfqQuotes.map((q, idx) => (
                    <td key={idx} className={q.selected ? 'selected-column' : ''}>
                      <Clock size={13} /> {q.leadTimeDays} Days
                    </td>
                  ))}
                </tr>
                <tr>
                  <td><strong>Lab Specs (Curcumin Content)</strong></td>
                  {rfqQuotes.map((q, idx) => (
                    <td key={idx} className={q.selected ? 'selected-column' : ''}>
                      {q.curcuminPct} (Salem Grade A)
                    </td>
                  ))}
                </tr>
                <tr>
                  <td><strong>Moisture Content</strong></td>
                  {rfqQuotes.map((q, idx) => (
                    <td key={idx} className={q.selected ? 'selected-column' : ''}>
                      {q.moisturePct} (Max 10% permitted)
                    </td>
                  ))}
                </tr>
                <tr>
                  <td><strong>Payment Terms</strong></td>
                  {rfqQuotes.map((q, idx) => (
                    <td key={idx} className={q.selected ? 'selected-column' : ''}>
                      {q.paymentTerms}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td><strong>Weighted Rating Score</strong></td>
                  {rfqQuotes.map((q, idx) => (
                    <td key={idx} className={q.selected ? 'selected-column' : ''}>
                      <span className="rating-pill">{q.ratingScore} / 100</span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td><strong>AI Sourcing Evaluation</strong></td>
                  {rfqQuotes.map((q, idx) => (
                    <td key={idx} className={q.selected ? 'selected-column evaluation-cell' : 'evaluation-cell'}>
                      {q.recommendation}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td><strong>Action</strong></td>
                  {rfqQuotes.map((q, idx) => (
                    <td key={idx} className={q.selected ? 'selected-column' : ''}>
                      <button 
                        className={q.selected ? 'btn-primary small' : 'btn-secondary small'}
                        onClick={() => {
                          setRfqQuotes(prev => prev.map((item, i) => ({
                            ...item,
                            selected: i === idx
                          })));
                        }}
                      >
                        {q.selected ? 'Awarded PO' : 'Select Vendor'}
                      </button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Supplier Scorecard Modal */}
      {selectedSupplier && (
        <div className="modal-backdrop" onClick={() => setSelectedSupplier(null)}>
          <div className="modal-card wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="badge-tag">Supplier Master Verification</span>
                <h3>{selectedSupplier.name}</h3>
                <p className="modal-sub">{selectedSupplier.location} • Contact: {selectedSupplier.contactPerson}</p>
              </div>
              <button className="close-btn" onClick={() => setSelectedSupplier(null)}>×</button>
            </div>

            <div className="supplier-modal-grid">
              <div className="stat-box-large">
                <span className="stat-label">Composite Rating Score</span>
                <strong className="stat-number">{selectedSupplier.ratingScore} / 100</strong>
                <span className="stat-desc">Top 5% verified supplier in Salem processing cluster</span>
              </div>

              <div className="compliance-details-box">
                <h4>Government & Export Registrations</h4>
                <div className="reg-row"><span>GSTIN:</span> <strong>{selectedSupplier.gstNo}</strong></div>
                <div className="reg-row"><span>FSSAI License:</span> <strong>{selectedSupplier.fssaiNo}</strong></div>
                <div className="reg-row"><span>IEC Exporter Code:</span> <strong>{selectedSupplier.iecNo || 'Available on request'}</strong></div>
                <div className="reg-row"><span>Monthly Processing:</span> <strong>{selectedSupplier.capacityPerMonthMT} MT</strong></div>
              </div>
            </div>

            <div className="score-breakdown-panel">
              <h4>Objective Weightage Breakdown</h4>
              <div className="weightage-bars">
                <div className="w-bar-item">
                  <div className="w-label"><span>Price Competitiveness (30%)</span> <span>{selectedSupplier.ratingBreakdown.price}/30</span></div>
                  <div className="w-track"><div className="w-fill" style={{ width: `${(selectedSupplier.ratingBreakdown.price / 30) * 100}%` }} /></div>
                </div>
                <div className="w-bar-item">
                  <div className="w-label"><span>Purity & Quality Consistency (25%)</span> <span>{selectedSupplier.ratingBreakdown.quality}/25</span></div>
                  <div className="w-track"><div className="w-fill" style={{ width: `${(selectedSupplier.ratingBreakdown.quality / 25) * 100}%` }} /></div>
                </div>
                <div className="w-bar-item">
                  <div className="w-label"><span>On-Time Dispatch History (20%)</span> <span>{selectedSupplier.ratingBreakdown.delivery}/20</span></div>
                  <div className="w-track"><div className="w-fill" style={{ width: `${(selectedSupplier.ratingBreakdown.delivery / 20) * 100}%` }} /></div>
                </div>
                <div className="w-bar-item">
                  <div className="w-label"><span>Documentation & Test Lab Accuracy (10%)</span> <span>{selectedSupplier.ratingBreakdown.documentation}/10</span></div>
                  <div className="w-track"><div className="w-fill" style={{ width: `${(selectedSupplier.ratingBreakdown.documentation / 10) * 100}%` }} /></div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setSelectedSupplier(null)}>Close</button>
              <button className="btn-primary" onClick={() => {
                alert(`Direct Purchase Order drafted for ${selectedSupplier.name}. Ready for Managing Director approval.`);
                setSelectedSupplier(null);
              }}>
                <FileCheck size={16} /> Draft Purchase Order (PO)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

