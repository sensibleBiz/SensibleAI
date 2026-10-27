import { 
  Ship, Users, FileText, ShieldCheck, 
  ArrowRight, Sparkles, Layers
} from 'lucide-react';
import { INITIAL_BUYERS, INITIAL_SHIPMENTS } from '../data/exportSampleData';

interface OverviewDashboardProps {
  onNavigate: (module: string) => void;
  currency: 'USD' | 'EUR' | 'INR';
  currencyRate: { USD: number; EUR: number; INR: number };
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({ 
  onNavigate, 
  currency, 
  currencyRate 
}) => {
  const formatMoney = (valUSD: number) => {
    if (currency === 'USD') return `$${valUSD.toLocaleString()}`;
    if (currency === 'EUR') return `€${Math.round(valUSD * currencyRate.EUR).toLocaleString()}`;
    return `₹${Math.round(valUSD * currencyRate.INR).toLocaleString()}`;
  };

  const totalPipelineUSD = INITIAL_BUYERS.reduce((acc, b) => acc + b.estimatedValueUSD, 0);

  return (
    <div className="module-container">
      {/* 1. Deep Navy Hero Banner */}
      <section className="hero-banner-navy">
        <div className="hero-banner-left">
          <h1>Export Control Tower</h1>
          <p>
            Unified dashboard orchestrating global buyer intelligence, automated FOB/CIF costing, 
            3D container stuffing, and real-time vessel tracking.
          </p>
        </div>

        <div className="hero-banner-controls">
          <button className="btn-banner-outline" onClick={() => onNavigate('container')}>
            <Layers size={14} /> 3D Stuffing Simulator
          </button>
          <button className="btn-coral-cta" onClick={() => onNavigate('costing')}>
            <Sparkles size={15} /> Instant CIF Quote
          </button>
        </div>
      </section>

      {/* 2. Sensible Colored-Border KPI Cards Strip */}
      <section className="kpi-cards-strip">
        <div className="sensible-kpi-card kpi-total" onClick={() => onNavigate('buyers')}>
          <div className="kpi-top-row">
            <span className="kpi-title-label">BUYER PIPELINE</span>
            <div className="kpi-icon-pill"><Users size={16} /></div>
          </div>
          <div className="kpi-big-number">{formatMoney(totalPipelineUSD)}</div>
          <span className="kpi-sub-trend">6 High-Value Prospects in Funnel</span>
        </div>

        <div className="sensible-kpi-card kpi-new" onClick={() => onNavigate('shipments')}>
          <div className="kpi-top-row">
            <span className="kpi-title-label">ON-WATER CARGO</span>
            <div className="kpi-icon-pill"><Ship size={16} /></div>
          </div>
          <div className="kpi-big-number">58.75 MT</div>
          <span className="kpi-sub-trend">3 Ocean Containers Tracked</span>
        </div>

        <div className="sensible-kpi-card kpi-won" onClick={() => onNavigate('suppliers')}>
          <div className="kpi-top-row">
            <span className="kpi-title-label">PARTNER MILLS</span>
            <div className="kpi-icon-pill"><ShieldCheck size={16} /></div>
          </div>
          <div className="kpi-big-number">4 Mills</div>
          <span className="kpi-sub-trend">Avg. Quality Rating: 91.5 / 100</span>
        </div>

        <div className="sensible-kpi-card kpi-followup" onClick={() => onNavigate('documents')}>
          <div className="kpi-top-row">
            <span className="kpi-title-label">COMPLIANCE</span>
            <div className="kpi-icon-pill"><FileText size={16} /></div>
          </div>
          <div className="kpi-big-number">Active</div>
          <span className="kpi-sub-trend">LUT, APEDA & AD Code Synced</span>
        </div>
      </section>

      {/* 3. Two Column Layout: Workflow Engine & Live Shipments */}
      <div className="dashboard-columns">
        {/* Left: Workflow & Leads Table */}
        <section className="card-panel">
          <div className="panel-header">
            <div>
              <h3>End-to-End Export Workflow Engine</h3>
              <p className="panel-sub">How Sensible CRM 2.0 turns trade data into confirmed export shipments</p>
            </div>
            <button className="text-btn" onClick={() => onNavigate('buyers')}>
              View All Leads <ArrowRight size={14} />
            </button>
          </div>

          <div className="export-table-wrap">
            <table className="export-table">
              <thead>
                <tr>
                  <th>Importer Company</th>
                  <th>Destination</th>
                  <th>Commodity</th>
                  <th>Stage</th>
                  <th>Estimated Value</th>
                </tr>
              </thead>
              <tbody>
                {INITIAL_BUYERS.slice(0, 4).map((b) => (
                  <tr key={b.id} onClick={() => onNavigate('buyers')} className="clickable-row">
                    <td>
                      <div className="co-name">{b.companyName}</div>
                      <span className="lead-source-sub">{b.source}</span>
                    </td>
                    <td>
                      <strong>{b.flag} {b.port}</strong>
                    </td>
                    <td>{b.productInterest}</td>
                    <td>
                      <span className="lead-status-pill amber">
                        {b.pipelineStage}
                      </span>
                    </td>
                    <td className="bold-cell">{formatMoney(b.estimatedValueUSD)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right: Live Container Radar */}
        <section className="card-panel">
          <div className="panel-header">
            <div>
              <h3>In-Transit Shipments Radar</h3>
              <p className="panel-sub">Real-time ocean tracking (GoComet Simulation)</p>
            </div>
            <button className="text-btn" onClick={() => onNavigate('shipments')}>
              All Containers <ArrowRight size={14} />
            </button>
          </div>

          <div className="quick-catalog-list">
            {INITIAL_SHIPMENTS.map((s) => (
              <div key={s.id} className="quick-catalog-item" onClick={() => onNavigate('shipments')} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <strong style={{ color: '#1e293b' }}>{s.containerNo}</strong>
                  <span className="lead-status-pill green" style={{ fontSize: '0.65rem' }}>{s.shippingLine}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 4 }}>
                  {s.loadingPort.split('(')[0]} → <strong>{s.destinationPort}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8' }}>
                  <span>{s.cargoDescription}</span>
                  <span style={{ color: '#d97706', fontWeight: 600 }}>ETA: {s.eta}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

