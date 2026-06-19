import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, Users, Package, Briefcase, Loader2 } from 'lucide-react';
import api from '../lib/api';

export default function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await api.get(`/search?q=${encodeURIComponent(query)}`);
        setResults(res.data.data);
        setIsOpen(true);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (type: string, id: string) => {
    setIsOpen(false);
    setQuery('');
    if (type === 'invoice') navigate(`/invoice/${id}`);
    if (type === 'contact') navigate(`/contacts`);
    if (type === 'product') navigate(`/products`);
    if (type === 'employee') navigate(`/admin/employees`);
  };

  const getIcon = (type: string) => {
    if (type === 'invoice') return <FileText size={14} className="text-primary" />;
    if (type === 'contact') return <Users size={14} className="text-info" />;
    if (type === 'product') return <Package size={14} className="text-warning" />;
    if (type === 'employee') return <Briefcase size={14} className="text-success" />;
    return <Search size={14} />;
  };

  const totalResults = results 
    ? (results.invoices.length + results.contacts.length + results.products.length + results.employees.length)
    : 0;

  return (
    <div className="topbar-search" ref={wrapperRef} style={{ position: 'relative' }}>
      <Search size={15} className="search-icon" />
      <input 
        type="search" 
        placeholder="Search invoices, contacts, products..." 
        id="global-search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (e.target.value.length >= 2) setIsOpen(true);
        }}
        onFocus={() => {
          if (query.length >= 2) setIsOpen(true);
        }}
        autoComplete="off"
      />
      {isLoading && <Loader2 size={15} className="spin text-muted" style={{ position: 'absolute', right: 10, top: 10 }} />}

      {isOpen && query.length >= 2 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: 'var(--space-2)',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 100,
          maxHeight: 400,
          overflowY: 'auto'
        }}>
          {totalResults === 0 && !isLoading ? (
            <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No results found for "{query}"
            </div>
          ) : (
            <>
              {['invoices', 'contacts', 'products', 'employees'].map((group) => {
                const items = results?.[group] || [];
                if (items.length === 0) return null;
                return (
                  <div key={group}>
                    <div style={{ padding: 'var(--space-2) var(--space-3)', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', background: 'var(--bg-base)' }}>
                      {group}
                    </div>
                    {items.map((item: any) => (
                      <div 
                        key={item.id} 
                        onClick={() => handleSelect(item.type, item.id)}
                        style={{
                          padding: 'var(--space-3)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-3)',
                          cursor: 'pointer',
                          borderBottom: '1px solid var(--border-subtle)'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-base)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div style={{ padding: 6, background: 'var(--bg-base)', borderRadius: 'var(--radius-md)' }}>
                          {getIcon(item.type)}
                        </div>
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{item.title}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.subtitle || '—'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
