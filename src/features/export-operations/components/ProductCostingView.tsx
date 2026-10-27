import React, { useState } from 'react';
import { 
  FileText, RefreshCw, Printer, Download
} from 'lucide-react';
import { INITIAL_PRODUCTS } from '../data/exportSampleData';
import type { ProductCostingItem } from '../data/exportSampleData';

interface ProductCostingViewProps {
  initialProductName?: string;
  currency: 'USD' | 'EUR' | 'INR';
  currencyRate: { USD: number; EUR: number; INR: number };
}

export const ProductCostingView: React.FC<ProductCostingViewProps> = ({ 
  initialProductName, 
  currency, 
  currencyRate 
}) => {
  const [selectedProduct, setSelectedProduct] = useState<ProductCostingItem>(() => {
    if (initialProductName) {
      const match = INITIAL_PRODUCTS.find(p => initialProductName.toLowerCase().includes(p.name.toLowerCase().split(' ')[0]));
      if (match) return match;
    }
    return INITIAL_PRODUCTS[0];
  });

  // Dynamic parameters
  const [incoterm, setIncoterm] = useState<'FOB' | 'CIF' | 'CFR'>('CIF');
  const [orderQuantityMT, setOrderQuantityMT] = useState<number>(18); // standard 20ft container
  const [basePriceInrKg, setBasePriceInrKg] = useState<number>(selectedProduct.basePurchaseInrKg);
  const [cleaningInrKg, setCleaningInrKg] = useState<number>(selectedProduct.cleaningSortingInrKg);
  const [packagingInrKg, setPackagingInrKg] = useState<number>(selectedProduct.packagingInrKg);
  const [inlandTransportInrKg, setInlandTransportInrKg] = useState<number>(selectedProduct.inlandFreightInrKg);
  const [chaChargesInrKg, setChaChargesInrKg] = useState<number>(selectedProduct.chaPortChargesInrKg);
  const [seaFreightUsdMT, setSeaFreightUsdMT] = useState<number>(selectedProduct.seaFreightUsdMT);
  const [marginPct, setMarginPct] = useState<number>(selectedProduct.typicalMarginPct);
  const [destinationPort, setDestinationPort] = useState<string>('Port Klang, Malaysia');
  const [loadingPort, setLoadingPort] = useState<string>('Nhava Sheva (JNPT), Mumbai');
  const [showPiModal, setShowPiModal] = useState<boolean>(false);

  // Sync when product selector changes
  const handleProductChange = (prodId: string) => {
    const p = INITIAL_PRODUCTS.find(x => x.id === prodId);
    if (!p) return;
    setSelectedProduct(p);
    setBasePriceInrKg(p.basePurchaseInrKg);
    setCleaningInrKg(p.cleaningSortingInrKg);
    setPackagingInrKg(p.packagingInrKg);
    setInlandTransportInrKg(p.inlandFreightInrKg);
    setChaChargesInrKg(p.chaPortChargesInrKg);
    setSeaFreightUsdMT(p.seaFreightUsdMT);
    setMarginPct(p.typicalMarginPct);
    setOrderQuantityMT(p.moqMT);
  };

  // Math Calculations (Per MT and Total)
  const procurementCostPerMT_INR = basePriceInrKg * 1000;
  const processingCostPerMT_INR = cleaningInrKg * 1000;
  const packagingCostPerMT_INR = packagingInrKg * 1000;
  const inlandTransportPerMT_INR = inlandTransportInrKg * 1000;
  const chaCostPerMT_INR = chaChargesInrKg * 1000;

  // Landed Cost at Indian Port (FOB Cost before margin)
  const totalFobCostPerMT_INR = 
    procurementCostPerMT_INR + 
    processingCostPerMT_INR + 
    packagingCostPerMT_INR + 
    inlandTransportPerMT_INR + 
    chaCostPerMT_INR;

  // Convert to USD (assume 1 USD = 84 INR for export base)
  const inrToUsdRate = 84.0;
  const fobCostPerMT_USD = totalFobCostPerMT_INR / inrToUsdRate;

  // With Profit Margin added
  const fobSellingPricePerMT_USD = fobCostPerMT_USD * (1 + marginPct / 100);
  const profitPerMT_USD = fobSellingPricePerMT_USD - fobCostPerMT_USD;

  // Sea Freight & Marine Insurance (0.35% for CIF)
  const insurancePerMT_USD = incoterm === 'CIF' ? fobSellingPricePerMT_USD * 0.0035 : 0;
  const freightPerMT_USD = incoterm === 'FOB' ? 0 : seaFreightUsdMT;

  // Final Quote per MT
  const finalQuotePricePerMT_USD = fobSellingPricePerMT_USD + freightPerMT_USD + insurancePerMT_USD;

  // Order Totals
  const totalContractValueUSD = finalQuotePricePerMT_USD * orderQuantityMT;
  const totalProfitUSD = profitPerMT_USD * orderQuantityMT;

  const formatPrice = (usd: number) => {
    if (currency === 'USD') return `$${usd.toFixed(2)}`;
    if (currency === 'EUR') return `€${(usd * currencyRate.EUR).toFixed(2)}`;
    return `₹${Math.round(usd * currencyRate.INR).toLocaleString()}`;
  };

  return (
    <div className="module-container">
      {/* Module Title */}
      <div className="module-header">
        <div>
          <h2>Export Costing & FOB / CIF Quotation Engine</h2>
          <p className="subtitle">
            Automates the complete cost-sheet breakdown: Mandi procurement, export cleaning/packing, port handling, sea freight, and locked margin.
          </p>
        </div>

        <div className="header-actions">
          <button className="btn-secondary" onClick={() => handleProductChange(selectedProduct.id)}>
            <RefreshCw size={15} /> Reset Defaults
          </button>
          <button className="btn-primary" onClick={() => setShowPiModal(true)}>
            <FileText size={16} /> Generate Proforma Invoice (PI)
          </button>
        </div>
      </div>

      {/* Main Grid: Cost Parameters (Left) & Real-time Quote Card (Right) */}
      <div className="costing-grid">
        {/* Left Column: Interactive Input Controls */}
        <div className="costing-controls card-panel">
          {/* Product & Incoterm Selector */}
          <div className="control-row">
            <div className="field-group">
              <label>Select Export Product</label>
              <select 
                className="select-input"
                value={selectedProduct.id} 
                onChange={(e) => handleProductChange(e.target.value)}
              >
                {INITIAL_PRODUCTS.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} (HS: {p.hsCode})
                  </option>
                ))}
              </select>
            </div>

            <div className="field-group">
              <label>Incoterm</label>
              <div className="incoterm-switch">
                {(['FOB', 'CIF', 'CFR'] as const).map(term => (
                  <button 
                    key={term} 
                    className={`incoterm-pill ${incoterm === term ? 'active' : ''}`}
                    onClick={() => setIncoterm(term)}
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="control-row">
            <div className="field-group">
              <label>Loading Port (POL)</label>
              <select 
                className="select-input" 
                value={loadingPort} 
                onChange={e => setLoadingPort(e.target.value)}
              >
                <option value="Nhava Sheva (JNPT), Mumbai">Nhava Sheva (JNPT), Mumbai</option>
                <option value="Mundra Port, Gujarat">Mundra Port, Gujarat</option>
                <option value="Cochin Port (ICTT), Kerala">Cochin Port (ICTT), Kerala</option>
                <option value="Chennai Port, Tamil Nadu">Chennai Port, Tamil Nadu</option>
              </select>
            </div>

            <div className="field-group">
              <label>Discharge Port (POD)</label>
              <input 
                type="text" 
                className="text-input" 
                value={destinationPort} 
                onChange={e => setDestinationPort(e.target.value)}
              />
            </div>
          </div>

          <div className="section-divider" />

          {/* Pricing Parameters Section */}
          <h4 className="section-subtitle">1. Origin & Processing Cost (INR/kg)</h4>
          <div className="slider-group">
            <div className="slider-row">
              <div className="slider-label">
                <span>Base Procurement Price (Ex-Mill/Mandi)</span>
                <strong>₹{basePriceInrKg} / kg</strong>
              </div>
              <input 
                type="range" min="50" max="1000" step="1"
                value={basePriceInrKg} 
                onChange={e => setBasePriceInrKg(Number(e.target.value))}
              />
            </div>

            <div className="slider-row">
              <div className="slider-label">
                <span>Sorting, Grading & Machine Cleaning</span>
                <strong>₹{cleaningInrKg.toFixed(1)} / kg</strong>
              </div>
              <input 
                type="range" min="1" max="25" step="0.5"
                value={cleaningInrKg} 
                onChange={e => setCleaningInrKg(Number(e.target.value))}
              />
            </div>

            <div className="slider-row">
              <div className="slider-label">
                <span>Export Standard Packaging (25kg/50kg PP/Jute Bags)</span>
                <strong>₹{packagingInrKg.toFixed(1)} / kg</strong>
              </div>
              <input 
                type="range" min="1" max="15" step="0.5"
                value={packagingInrKg} 
                onChange={e => setPackagingInrKg(Number(e.target.value))}
              />
            </div>
          </div>

          <h4 className="section-subtitle">2. Inland Logistics & Port Charges (INR/kg)</h4>
          <div className="slider-group">
            <div className="slider-row">
              <div className="slider-label">
                <span>Inland Road Transport to Port CFS</span>
                <strong>₹{inlandTransportInrKg.toFixed(1)} / kg</strong>
              </div>
              <input 
                type="range" min="1" max="15" step="0.2"
                value={inlandTransportInrKg} 
                onChange={e => setInlandTransportInrKg(Number(e.target.value))}
              />
            </div>

            <div className="slider-row">
              <div className="slider-label">
                <span>CHA Handling, Terminal & Customs Clearance</span>
                <strong>₹{chaChargesInrKg.toFixed(1)} / kg</strong>
              </div>
              <input 
                type="range" min="1" max="10" step="0.2"
                value={chaChargesInrKg} 
                onChange={e => setChaChargesInrKg(Number(e.target.value))}
              />
            </div>
          </div>

          {incoterm !== 'FOB' && (
            <>
              <h4 className="section-subtitle">3. Ocean Logistics (USD/MT)</h4>
              <div className="slider-group">
                <div className="slider-row">
                  <div className="slider-label">
                    <span>Sea Freight to {destinationPort.split(',')[0]}</span>
                    <strong>${seaFreightUsdMT} / MT</strong>
                  </div>
                  <input 
                    type="range" min="20" max="250" step="5"
                    value={seaFreightUsdMT} 
                    onChange={e => setSeaFreightUsdMT(Number(e.target.value))}
                  />
                </div>
              </div>
            </>
          )}

          <h4 className="section-subtitle">4. Commercial Margin & Order Volume</h4>
          <div className="slider-group">
            <div className="slider-row">
              <div className="slider-label">
                <span>Target Net Profit Margin</span>
                <strong className="green-text">{marginPct}%</strong>
              </div>
              <input 
                type="range" min="5" max="30" step="1"
                value={marginPct} 
                onChange={e => setMarginPct(Number(e.target.value))}
              />
            </div>

            <div className="slider-row">
              <div className="slider-label">
                <span>Order Volume in Metric Tons</span>
                <strong>{orderQuantityMT} MT ({Math.round(orderQuantityMT / 18)} x 20ft FCL)</strong>
              </div>
              <input 
                type="range" min="10" max="100" step="2"
                value={orderQuantityMT} 
                onChange={e => setOrderQuantityMT(Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Live Quotation Summary Card */}
        <div className="costing-summary">
          <div className="quote-display-card">
            <div className="quote-header">
              <span className="quote-badge">OFFICIAL QUOTE CALCULATION</span>
              <h3>{incoterm} {destinationPort.split(',')[0]}</h3>
              <p>{selectedProduct.name}</p>
            </div>

            <div className="quote-hero-number">
              <span className="currency-symbol">{currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₹'}</span>
              <span className="amount">
                {currency === 'USD' 
                  ? finalQuotePricePerMT_USD.toFixed(2)
                  : currency === 'EUR'
                  ? (finalQuotePricePerMT_USD * currencyRate.EUR).toFixed(2)
                  : Math.round(finalQuotePricePerMT_USD * inrToUsdRate).toLocaleString()
                }
              </span>
              <span className="unit">/ Metric Ton</span>
            </div>

            <div className="quote-breakdown-list">
              <div className="breakdown-row">
                <span>Base Procurement Cost (1 MT)</span>
                <strong>₹{procurementCostPerMT_INR.toLocaleString()}</strong>
              </div>
              <div className="breakdown-row">
                <span>Sorting, Cleaning & Packaging</span>
                <strong>₹{(processingCostPerMT_INR + packagingCostPerMT_INR).toLocaleString()}</strong>
              </div>
              <div className="breakdown-row">
                <span>Inland Freight & CHA Port Handling</span>
                <strong>₹{(inlandTransportPerMT_INR + chaCostPerMT_INR).toLocaleString()}</strong>
              </div>
              <div className="breakdown-row subtotal">
                <span>Total FOB Cost (Break-even)</span>
                <strong>${fobCostPerMT_USD.toFixed(2)} / MT</strong>
              </div>
              <div className="breakdown-row profit-highlight">
                <span>Export Profit Margin ({marginPct}%)</span>
                <strong>+${profitPerMT_USD.toFixed(2)} / MT</strong>
              </div>
              {incoterm !== 'FOB' && (
                <>
                  <div className="breakdown-row">
                    <span>Sea Freight to Destination</span>
                    <strong>+${freightPerMT_USD.toFixed(2)} / MT</strong>
                  </div>
                  {incoterm === 'CIF' && (
                    <div className="breakdown-row">
                      <span>Marine Cargo Insurance (0.35%)</span>
                      <strong>+${insurancePerMT_USD.toFixed(2)} / MT</strong>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="contract-total-box">
              <div className="total-metric">
                <span className="label">Total Contract Value ({orderQuantityMT} MT)</span>
                <strong className="value">{formatPrice(totalContractValueUSD)}</strong>
              </div>
              <div className="profit-metric">
                <span className="label">Total Net Profit</span>
                <strong className="value green-text">+{formatPrice(totalProfitUSD)}</strong>
              </div>
            </div>

            <div className="quote-actions">
              <button className="btn-primary full-width" onClick={() => setShowPiModal(true)}>
                <FileText size={16} /> View Proforma Invoice (PI)
              </button>
            </div>
          </div>

          {/* Product Quality Compliance Card */}
          <div className="specs-card card-panel">
            <h4>Export Grade Specifications</h4>
            <p className="spec-text">{selectedProduct.specifications}</p>
            <div className="spec-meta">
              <div><strong>HS Code:</strong> {selectedProduct.hsCode}</div>
              <div><strong>Standard Packing:</strong> {selectedProduct.standardPackaging}</div>
              <div><strong>Approx Transit:</strong> {selectedProduct.transitDays} Days</div>
            </div>
          </div>
        </div>
      </div>

      {/* Proforma Invoice Modal Preview */}
      {showPiModal && (
        <div className="modal-backdrop" onClick={() => setShowPiModal(false)}>
          <div className="modal-card wide pi-document-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="badge-tag">Commercial Document</span>
                <h3>PROFORMA INVOICE — REF: HI-PI-2026-092</h3>
                <p className="modal-sub">Sensible Impex • Govt. of India Recognized Exporter</p>
              </div>
              <button className="close-btn" onClick={() => setShowPiModal(false)}>×</button>
            </div>

            <div className="pi-paper">
              <div className="pi-company-header">
                <div>
                  <h2>SENSIBLE IMPEX</h2>
                  <p className="addr">
                    Export House, Commercial Chambers, Sector 18<br />
                    Tamil Nadu / Gujarat / Maharashtra, India<br />
                    IEC: 0319201844 | GSTIN: 33AAACH9918M1ZF | APEDA: RCMC-9921
                  </p>
                </div>
                <div className="pi-meta-box">
                  <div><strong>Date:</strong> 30 Sep 2026</div>
                  <div><strong>PI No:</strong> HI/EXP/2026/092</div>
                  <div><strong>Incoterm:</strong> {incoterm} {destinationPort}</div>
                  <div><strong>Payment:</strong> 30% Advance, 70% against BL Copy</div>
                </div>
              </div>

              <div className="pi-buyer-info">
                <strong>BUYER / IMPORTER:</strong>
                <div>Asia Agri Commodities Sdn Bhd</div>
                <div>Westports Logistics Park, Port Klang, Malaysia</div>
              </div>

              <table className="pi-table">
                <thead>
                  <tr>
                    <th>Item Description</th>
                    <th>HS Code</th>
                    <th>Qty (MT)</th>
                    <th>Unit Price ({currency})</th>
                    <th>Total Amount ({currency})</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <strong>{selectedProduct.name}</strong><br />
                      <span className="sub">{selectedProduct.specifications}</span><br />
                      <span className="sub">Packing: {selectedProduct.standardPackaging}</span>
                    </td>
                    <td>{selectedProduct.hsCode}</td>
                    <td>{orderQuantityMT} MT</td>
                    <td>{formatPrice(finalQuotePricePerMT_USD)}</td>
                    <td className="bold-cell">{formatPrice(totalContractValueUSD)}</td>
                  </tr>
                </tbody>
              </table>

              <div className="pi-terms-grid">
                <div>
                  <strong>Banking & AD Code Details:</strong>
                  <p>Bank: State Bank of India, Overseas Branch<br />Swift: SBININBB120<br />AD Code: 0210049</p>
                </div>
                <div className="pi-summary-right">
                  <div className="pi-grand-total">
                    <span>Total {incoterm} Value:</span>
                    <strong>{formatPrice(totalContractValueUSD)}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => window.print()}>
                <Printer size={16} /> Print Proforma Invoice
              </button>
              <button className="btn-primary" onClick={() => {
                alert('Proforma Invoice PDF generated and ready to attach to buyer email!');
                setShowPiModal(false);
              }}>
                <Download size={16} /> Export as PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

