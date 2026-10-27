import React, { useState } from 'react';
import { 
  Ship, MapPin, CheckCircle2, ArrowRight, 
  Send, RefreshCw, MessageSquare
} from 'lucide-react';
import { INITIAL_SHIPMENTS } from '../data/exportSampleData';
import type { ContainerShipment } from '../data/exportSampleData';

export const ShipmentTrackingView: React.FC = () => {
  const [shipments] = useState<ContainerShipment[]>(INITIAL_SHIPMENTS);
  const [selectedShipment, setSelectedShipment] = useState<ContainerShipment>(INITIAL_SHIPMENTS[0]);
  const [notifyModalOpen, setNotifyModalOpen] = useState<boolean>(false);

  return (
    <div className="module-container">
      {/* Header */}
      <div className="module-header">
        <div>
          <h2>Ocean Freight & Container Tracking (GoComet Simulation)</h2>
          <p className="subtitle">
            Live multi-carrier container visibility across Maersk, CMA CGM & Hapag-Lloyd with automated port milestone updates.
          </p>
        </div>

        <div className="header-actions">
          <button className="btn-secondary" onClick={() => alert('Synced with shipping line satellite AIS data!')}>
            <RefreshCw size={15} /> Refresh AIS Radar
          </button>
          <button className="btn-primary" onClick={() => setNotifyModalOpen(true)}>
            <MessageSquare size={16} /> Send Buyer Milestone Alert
          </button>
        </div>
      </div>

      {/* Main Grid: Shipments List & Active Milestone Detail */}
      <div className="tracking-grid">
        {/* Left Column: Container Cards */}
        <div className="shipments-sidebar">
          <h3>Active Ocean Shipments ({shipments.length})</h3>
          <div className="shipment-card-selector-list">
            {shipments.map(s => (
              <div 
                key={s.id} 
                className={`shipment-select-card card-panel ${selectedShipment.id === s.id ? 'active' : ''}`}
                onClick={() => setSelectedShipment(s)}
              >
                <div className="card-topline">
                  <span className="cnt-badge">{s.containerNo}</span>
                  <span className="carrier-pill">{s.shippingLine}</span>
                </div>

                <div className="shipment-importer">{s.buyerName}</div>
                <div className="shipment-route-summary">
                  <span>{s.loadingPort.split('(')[0]}</span>
                  <ArrowRight size={13} />
                  <strong>{s.destinationPort}</strong>
                </div>

                <div className="card-bottom-meta">
                  <span className="status-highlight">{s.currentMilestone}</span>
                  <span className="eta-highlight">ETA: {s.eta.split(' ')[0]} {s.eta.split(' ')[1]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Detailed Tracking Console */}
        <div className="tracking-detail card-panel">
          {/* Header Banner */}
          <div className="tracking-detail-header">
            <div>
              <div className="detail-tag">BILL OF LADING / VESSEL CONSOLE</div>
              <h2>{selectedShipment.containerNo} — {selectedShipment.containerType}</h2>
              <p className="vessel-sub">
                Carrier: <strong>{selectedShipment.shippingLine}</strong> • Vessel: <strong>{selectedShipment.vesselName} (Voyage {selectedShipment.voyageNo})</strong>
              </p>
            </div>
            <div className="eta-counter-box">
              <span className="lbl">PROJECTED ETA</span>
              <strong className="val">{selectedShipment.eta}</strong>
              <span className="status-on-time"><CheckCircle2 size={12} /> AIS Status: On-Time</span>
            </div>
          </div>

          {/* Ocean Route Infographic */}
          <div className="ocean-route-panel">
            <div className="port-terminal origin">
              <span className="lbl">PORT OF LOADING (POL)</span>
              <strong>{selectedShipment.loadingPort}</strong>
              <span className="sub">Departed: {selectedShipment.etd}</span>
            </div>

            <div className="ocean-flow-track">
              <div className="flow-progress" style={{ width: `${selectedShipment.progressPct}%` }} />
              <div className="ship-beacon" style={{ left: `${selectedShipment.progressPct}%` }}>
                <div className="beacon-pulse" />
                <Ship size={20} className="ship-svg" />
              </div>
            </div>

            <div className="port-terminal dest">
              <span className="lbl">PORT OF DISCHARGE (POD)</span>
              <strong>{selectedShipment.destinationPort}</strong>
              <span className="sub">Destination: {selectedShipment.destinationCountry}</span>
            </div>
          </div>

          {/* Milestones Vertical Timeline */}
          <div className="milestones-timeline-section">
            <h3>Supply Chain Milestone History</h3>
            <div className="milestone-timeline">
              {selectedShipment.milestones.map((m, idx) => (
                <div key={idx} className={`milestone-node ${m.status}`}>
                  <div className="node-marker">
                    {m.status === 'completed' ? (
                      <CheckCircle2 size={16} />
                    ) : m.status === 'in-progress' ? (
                      <div className="pulsing-dot" />
                    ) : (
                      <div className="pending-ring" />
                    )}
                  </div>
                  <div className="node-body">
                    <div className="node-top">
                      <strong>{m.name}</strong>
                      <span className="node-date">{m.date}</span>
                    </div>
                    <span className="node-loc"><MapPin size={12} /> {m.location}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cargo Details Footer */}
          <div className="cargo-summary-strip">
            <div className="strip-item">
              <span className="lbl">Consigned Commodity</span>
              <strong>{selectedShipment.cargoDescription}</strong>
            </div>
            <div className="strip-item">
              <span className="lbl">Total Gross Weight</span>
              <strong>{selectedShipment.totalWeightMT} MT</strong>
            </div>
            <div className="strip-item">
              <span className="lbl">Booking Reference</span>
              <strong>{selectedShipment.bookingRef}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Automated Buyer Notification Modal */}
      {notifyModalOpen && (
        <div className="modal-backdrop" onClick={() => setNotifyModalOpen(false)}>
          <div className="modal-card wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="badge-tag">Customer Care Automation</span>
                <h3>Automated WhatsApp / Email Milestone Notification</h3>
                <p className="modal-sub">To: {selectedShipment.buyerName} • Port: {selectedShipment.destinationPort}</p>
              </div>
              <button className="close-btn" onClick={() => setNotifyModalOpen(false)}>×</button>
            </div>

            <div className="email-preview-box">
              <pre>{`Dear ${selectedShipment.buyerName} Team,

Your export container ${selectedShipment.containerNo} on vessel ${selectedShipment.vesselName} (Voyage ${selectedShipment.voyageNo}) is currently on schedule.

• Current Milestone: ${selectedShipment.currentMilestone}
• Port of Loading: ${selectedShipment.loadingPort}
• Expected Arrival (ETA): ${selectedShipment.eta} at ${selectedShipment.destinationPort}
• Consignment: ${selectedShipment.cargoDescription}

Original shipping documents (Bill of Lading, Phyto Certificate, Certificate of Origin) have been processed.

You can track your live shipment anytime on our Sensible Impex Portal.

Warm regards,
Logistics Desk | Sensible Impex, India
logistics@harimmaimpex.com`}</pre>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setNotifyModalOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={() => {
                alert(`Milestone dispatch notification sent to buyer via WhatsApp and Email!`);
                setNotifyModalOpen(false);
              }}>
                <Send size={16} /> Send Instant Notification
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

