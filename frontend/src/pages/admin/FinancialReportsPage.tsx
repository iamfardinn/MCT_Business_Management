import { useQuery } from '@tanstack/react-query';
import { PieChart, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import api from '../../lib/api';

export default function FinancialReportsPage() {
  const { data: plData, isLoading: loadingPL } = useQuery({
    queryKey: ['financials', 'profit-loss'],
    queryFn: async () => (await api.get('/reports/financials/profit-loss')).data.data,
  });

  const { data: bsData, isLoading: loadingBS } = useQuery({
    queryKey: ['financials', 'balance-sheet'],
    queryFn: async () => (await api.get('/reports/financials/balance-sheet')).data.data,
  });

  const fmt = (n: number) => `৳${Number(n || 0).toLocaleString('en-BD', { minimumFractionDigits: 2 })}`;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title"><PieChart className="mr-2" /> Financial Reports</h1>
          <p className="page-subtitle">Real-time Profit & Loss and Balance Sheet</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
        
        {/* Profit & Loss */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Profit & Loss Statement</h2>
          </div>
          <div className="card-body">
            {loadingPL ? <div className="page-loader"><div className="spinner" /></div> : (
              <div>
                <h3 style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', marginBottom: 'var(--space-3)' }}><TrendingUp size={16} className="mr-2"/> Revenue</h3>
                {plData?.revenue?.map((r: any) => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px dashed var(--border-subtle)' }}>
                    <span>{r.name}</span>
                    <span className="font-mono">{fmt(r.total)}</span>
                  </div>
                ))}

                <h3 style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', margin: 'var(--space-5) 0 var(--space-3)' }}><TrendingDown size={16} className="mr-2"/> Expenses</h3>
                {plData?.expenses?.map((e: any) => (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px dashed var(--border-subtle)' }}>
                    <span>{e.name}</span>
                    <span className="font-mono">{fmt(e.total)}</span>
                  </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-5)', paddingTop: 'var(--space-4)', borderTop: '2px solid var(--border-default)', fontWeight: 'bold', fontSize: '1.1rem' }}>
                  <span>Net Income</span>
                  <span className="font-mono" style={{ color: 'var(--accent-primary)' }}>{fmt(plData?.net_income)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Balance Sheet */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Balance Sheet</h2>
          </div>
          <div className="card-body">
            {loadingBS ? <div className="page-loader"><div className="spinner" /></div> : (
              <div>
                <h3 style={{ color: 'var(--info)', display: 'flex', alignItems: 'center', marginBottom: 'var(--space-3)' }}><DollarSign size={16} className="mr-2"/> Assets</h3>
                {bsData?.assets?.map((a: any) => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px dashed var(--border-subtle)' }}>
                    <span>{a.name}</span>
                    <span className="font-mono">{fmt(a.total)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', fontWeight: 'bold' }}>
                  <span>Total Assets</span>
                  <span className="font-mono">{fmt(bsData?.assets?.reduce((s: any, a: any) => s + Number(a.total), 0))}</span>
                </div>

                <h3 style={{ color: 'var(--warning)', display: 'flex', alignItems: 'center', margin: 'var(--space-5) 0 var(--space-3)' }}><DollarSign size={16} className="mr-2"/> Liabilities</h3>
                {bsData?.liabilities?.map((l: any) => (
                  <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px dashed var(--border-subtle)' }}>
                    <span>{l.name}</span>
                    <span className="font-mono">{fmt(l.total)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', fontWeight: 'bold' }}>
                  <span>Total Liabilities</span>
                  <span className="font-mono">{fmt(bsData?.liabilities?.reduce((s: any, l: any) => s + Number(l.total), 0))}</span>
                </div>

                <h3 style={{ color: 'var(--info)', display: 'flex', alignItems: 'center', margin: 'var(--space-5) 0 var(--space-3)' }}><DollarSign size={16} className="mr-2"/> Equity</h3>
                {bsData?.equity?.map((eq: any) => (
                  <div key={eq.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px dashed var(--border-subtle)' }}>
                    <span>{eq.name}</span>
                    <span className="font-mono">{fmt(eq.total)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', fontWeight: 'bold' }}>
                  <span>Total Equity</span>
                  <span className="font-mono">{fmt(bsData?.equity?.reduce((s: any, e: any) => s + Number(e.total), 0))}</span>
                </div>

              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
