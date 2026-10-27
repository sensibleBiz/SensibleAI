import React, { useState } from 'react';
import { 
  Package, CheckCircle2, AlertTriangle, Printer, 
  RotateCw, FileSpreadsheet
} from 'lucide-react';

export const ContainerStuffingView: React.FC = () => {
  const [containerType, setContainerType] = useState<'20ft' | '40ft_hc'>('20ft');
  const [packageType, setPackageType] = useState<'25kg_bag' | '50kg_bag' | 'carton'>('25kg_bag');
  const [bagCount, setBagCount] = useState<number>(720);
  const [usePallets, setUsePallets] = useState<boolean>(false);
  const [showLoadingSheet, setShowLoadingSheet] = useState<boolean>(false);

  // Specifications
  const specs = {
    '20ft': {
      name: '20ft Standard Dry Container (GP)',
      maxWeightKg: 21700,
      volumeCBM: 33.2,
      lengthM: 5.9,
      widthM: 2.35,
      heightM: 2.39,
      tareWeightKg: 2200
    },
    '40ft_hc': {
      name: '40ft High Cube Container (HC)',
      maxWeightKg: 26500,
      volumeCBM: 76.2,
      lengthM: 12.03,
      widthM: 2.35,
      heightM: 2.69,
      tareWeightKg: 3900
    }
  }[containerType];

  const packageSpecs = {
    '25kg_bag': { name: '25 kg Double-Stitched Jute Bag', weightKg: 25.4, cbm: 0.041 },
    '50kg_bag': { name: '50 kg PP Woven Bag with Liner', weightKg: 50.6, cbm: 0.078 },
    'carton': { name: '10 kg Master Export Carton Box', weightKg: 10.3, cbm: 0.030 }
  }[packageType];

  const totalCargoWeightKg = bagCount * packageSpecs.weightKg;
  const totalCargoWeightMT = totalCargoWeightKg / 1000;
  const totalVolumeCBM = bagCount * packageSpecs.cbm * (usePallets ? 1.15 : 1.0);

  const weightUtilizationPct = Math.min(100, Math.round((totalCargoWeightKg / specs.maxWeightKg) * 100));
  const volumeUtilizationPct = Math.min(100, Math.round((totalVolumeCBM / specs.volumeCBM) * 100));
  const vgmGrossMassKg = totalCargoWeightKg + specs.tareWeightKg;

  const isOverweight = totalCargoWeightKg > specs.maxWeightKg;
  const isOvervolume = totalVolumeCBM > specs.volumeCBM;

  return (
    <div className="module-container">
      {/* Header */}
      <div className="module-header">
        <div>
          <h2>3D Container Stuffing & Loading Simulator (EasyCargo Logic)</h2>
          <p className="subtitle">
            Optimize carton and bag loading patterns, weight distribution, axle balance, and VGM compliance for ocean freight.
          </p>
        </div>

        <div className="header-actions">
          <button className="btn-secondary" onClick={() => {
            setBagCount(containerType === '20ft' ? 720 : 1100);
          }}>
            <RotateCw size={15} /> Reset Optimal Load
          </button>
          <button className="btn-primary" onClick={() => setShowLoadingSheet(true)}>
            <FileSpreadsheet size={16} /> Generate Loading Plan Sheet
          </button>
        </div>
      </div>

      {/* Main Grid: Controls on Left, Visual Loading on Right */}
      <div className="stuffing-grid">
        {/* Left Column: Configuration Controls */}
        <div className="stuffing-controls card-panel">
          <div className="field-group">
            <label>Ocean Container Size</label>
            <div className="container-toggle">
              <button 
                className={`container-btn ${containerType === '20ft' ? 'active' : ''}`}
                onClick={() => {
                  setContainerType('20ft');
                  if (bagCount > 800) setBagCount(720);
                }}
              >
                <div className="btn-title">20ft Standard (GP)</div>
                <div className="btn-sub">Payload: 21.7 MT | 33.2 CBM</div>
              </button>
              <button 
                className={`container-btn ${containerType === '40ft_hc' ? 'active' : ''}`}
                onClick={() => {
                  setContainerType('40ft_hc');
                  if (bagCount < 800) setBagCount(1050);
                }}
              >
                <div className="btn-title">40ft High Cube (HC)</div>
                <div className="btn-sub">Payload: 26.5 MT | 76.2 CBM</div>
              </button>
            </div>
          </div>

          <div className="field-group">
            <label>Cargo Packaging Type</label>
            <select 
              className="select-input" 
              value={packageType} 
              onChange={e => setPackageType(e.target.value as typeof packageType)}
            >
              <option value="25kg_bag">25 kg Double Jute Bag (Spices / Turmeric / Pepper)</option>
              <option value="50kg_bag">50 kg PP Bag (Pulses / Grains / Rice)</option>
              <option value="carton">10 kg Master Export Carton (FMCG / Retail Packs)</option>
            </select>
          </div>

          <div className="field-group">
            <div className="slider-label">
              <span>Total Package Units to Load</span>
              <strong>{bagCount} Units</strong>
            </div>
            <input 
              type="range" 
              min="100" 
              max={containerType === '20ft' ? 900 : 1500} 
              step="10"
              value={bagCount}
              onChange={e => setBagCount(Number(e.target.value))}
            />
          </div>

          <div className="checkbox-row">
            <label className="checkbox-label">
              <input 
                type="checkbox" 
                checked={usePallets} 
                onChange={e => setUsePallets(e.target.checked)} 
              />
              <span>Load on Heat-Treated (ISPM-15) Wooden Pallets (+15% volume)</span>
            </label>
          </div>

          <div className="section-divider" />

          {/* Utilization Meters */}
          <div className="meter-block">
            <div className="meter-header">
              <span>Container Weight Utilization ({totalCargoWeightMT.toFixed(2)} MT / {(specs.maxWeightKg / 1000).toFixed(1)} MT)</span>
              <strong className={isOverweight ? 'red-text' : 'green-text'}>{weightUtilizationPct}%</strong>
            </div>
            <div className="meter-track">
              <div 
                className={`meter-fill ${isOverweight ? 'danger' : 'safe'}`} 
                style={{ width: `${Math.min(100, weightUtilizationPct)}%` }} 
              />
            </div>
            {isOverweight && (
              <span className="warning-text"><AlertTriangle size={13} /> Exceeds maximum shipping line payload!</span>
            )}
          </div>

          <div className="meter-block">
            <div className="meter-header">
              <span>Container Volume Utilization ({totalVolumeCBM.toFixed(1)} CBM / {specs.volumeCBM} CBM)</span>
              <strong className={isOvervolume ? 'red-text' : 'cyan-text'}>{volumeUtilizationPct}%</strong>
            </div>
            <div className="meter-track">
              <div 
                className={`meter-fill ${isOvervolume ? 'danger' : 'safe-cyan'}`} 
                style={{ width: `${Math.min(100, volumeUtilizationPct)}%` }} 
              />
            </div>
          </div>

          <div className="weight-distribution-box">
            <h4>Axle & Center-of-Gravity Balance</h4>
            <div className="axle-grid">
              <div className="axle-pill">
                <span>Front Bulkhead:</span>
                <strong>49.2%</strong>
              </div>
              <div className="axle-pill">
                <span>Rear Door:</span>
                <strong>50.8%</strong>
              </div>
            </div>
            <p className="axle-status"><CheckCircle2 size={13} /> Optimal weight distribution for ocean voyage.</p>
          </div>
        </div>

        {/* Right Column: Visual Container Cutaway Preview */}
        <div className="stuffing-visual card-panel">
          <div className="visual-header">
            <div>
              <h3>Isometric Stuffing Layout</h3>
              <p className="visual-sub">{specs.name} • {packageSpecs.name}</p>
            </div>
            <span className="badge-tag">EasyCargo Simulation</span>
          </div>

          {/* Static 3D Container View */}
          <div className="static-3d-stage" aria-label="Static 3D container loading layout">
            <div className="static-3d-caption">
              <span>Front bulkhead</span>
              <span>Container doors</span>
            </div>
            <div className="static-3d-scene">
              <div className="static-3d-container">
                <div className="static-3d-sidewall" />
                <div className="static-3d-backwall" />
                <div className="static-3d-floor-grid" />
                <div className="static-3d-cargo-stack">
                  {Array.from({ length: 5 }).map((_, rowIndex) => (
                    <div className="static-3d-cargo-row" key={rowIndex}>
                      {Array.from({ length: 8 }).map((_, bagIndex) => (
                        <div className="static-3d-bag" key={bagIndex}>
                          <Package size={12} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="static-3d-door"><span>DOORS</span></div>
              </div>
            </div>
            <div className="static-3d-legend">
              <span><i className="legend-cargo" />Loaded cargo: {bagCount} units</span>
              <span><i className="legend-space" />Free headroom: {Math.max(10, 100 - volumeUtilizationPct)}%</span>
              <span><i className="legend-door" />Door-side dunnage</span>
            </div>
          </div>

          {/* Stuffing Summary Metrics */}
          <div className="stuffing-metrics-row">
            <div className="metric-box">
              <span className="lbl">Verified Gross Mass (VGM)</span>
              <strong>{vgmGrossMassKg.toLocaleString()} kg</strong>
              <span className="sub">Includes Container Tare</span>
            </div>
            <div className="metric-box">
              <span className="lbl">Moisture Desiccants</span>
              <strong>8 Hang-Bags (2kg)</strong>
              <span className="sub">Prevents Container Rain</span>
            </div>
            <div className="metric-box">
              <span className="lbl">Airbags & Dunnage</span>
              <strong>4 Kraft Dunnage Bags</strong>
              <span className="sub">Locks Cargo in Transit</span>
            </div>
          </div>
        </div>
      </div>

      {/* Loading Sheet Modal */}
      {showLoadingSheet && (
        <div className="modal-backdrop" onClick={() => setShowLoadingSheet(false)}>
          <div className="modal-card wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="badge-tag">SOLAS Convention Compliance</span>
                <h3>CONTAINER STUFFING & VGM LOADING SHEET</h3>
                <p className="modal-sub">Container: MSKU9482103 • Booking: BKG-MAERSK-9811</p>
              </div>
              <button className="close-btn" onClick={() => setShowLoadingSheet(false)}>×</button>
            </div>

            <div className="pi-paper">
              <div className="pi-company-header">
                <div>
                  <h2>SENSIBLE IMPEX — CONTAINER PACKING LIST</h2>
                  <p className="addr">Stuffing Yard: CFS JNPT / Navi Mumbai | LEO Clearance: Indian Customs</p>
                </div>
                <div className="pi-meta-box">
                  <div><strong>Container No:</strong> MSKU9482103</div>
                  <div><strong>Seal No:</strong> ML-IN-981244</div>
                  <div><strong>VGM Weight:</strong> {vgmGrossMassKg.toLocaleString()} KG</div>
                  <div><strong>Method:</strong> SOLAS Method 1 (Weighbridge)</div>
                </div>
              </div>

              <table className="pi-table">
                <thead>
                  <tr>
                    <th>Item Description</th>
                    <th>Package Count</th>
                    <th>Net Weight (MT)</th>
                    <th>Tare (KG)</th>
                    <th>Gross VGM (KG)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <strong>Turmeric Salem Finger (Double Polished)</strong><br />
                      Packed in {packageSpecs.name}
                    </td>
                    <td>{bagCount} Bags</td>
                    <td>{totalCargoWeightMT.toFixed(2)} MT</td>
                    <td>{specs.tareWeightKg} KG</td>
                    <td className="bold-cell">{vgmGrossMassKg.toLocaleString()} KG</td>
                  </tr>
                </tbody>
              </table>

              <div className="checklist-box">
                <h4>Pre-Shipment Container Inspection Checklist:</h4>
                <div className="check-grid">
                  <div><CheckCircle2 size={14} className="green-text" /> Floor free from odor, oil & nails</div>
                  <div><CheckCircle2 size={14} className="green-text" /> Light-leak test passed (No holes/rust)</div>
                  <div><CheckCircle2 size={14} className="green-text" /> High-security bottle bolt seal affixed</div>
                  <div><CheckCircle2 size={14} className="green-text" /> Moisture test & phytosanitary treatment complete</div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => window.print()}>
                <Printer size={16} /> Print Loading Sheet
              </button>
              <button className="btn-primary" onClick={() => setShowLoadingSheet(false)}>
                Confirm & Attach to Shipping Bill
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
