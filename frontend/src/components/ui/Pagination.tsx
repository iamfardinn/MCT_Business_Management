import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
}

export function Pagination({ page, limit, total, onPageChange, onLimitChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Determine a window of page numbers to show
  const maxPagesToShow = 5;
  let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
  let endPage = startPage + maxPagesToShow - 1;

  if (endPage > totalPages) {
    endPage = totalPages;
    startPage = Math.max(1, endPage - maxPagesToShow + 1);
  }

  const pages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

  if (total === 0) return null;

  return (
    <div className="pagination-container">
      <div className="pagination-info">
        Showing <strong>{(page - 1) * limit + 1}</strong> to{' '}
        <strong>{Math.min(page * limit, total)}</strong> of{' '}
        <strong>{total}</strong> records
      </div>

      <div className="pagination-controls">
        {onLimitChange && (
          <select 
            value={limit} 
            onChange={(e) => onLimitChange(Number(e.target.value))}
            className="form-select form-select-sm pagination-limit"
          >
            <option value="20">20 per page</option>
            <option value="50">50 per page</option>
            <option value="100">100 per page</option>
            <option value="200">200 per page</option>
          </select>
        )}

        <div className="pagination-buttons">
          <button
            onClick={() => onPageChange(1)}
            disabled={page === 1}
            className="page-btn"
            title="First Page"
          >
            <ChevronsLeft size={16} />
          </button>
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            className="page-btn"
            title="Previous Page"
          >
            <ChevronLeft size={16} />
          </button>

          {startPage > 1 && <div className="page-dots">...</div>}

          {pages.map((p) => (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`page-btn ${page === p ? 'active' : ''}`}
            >
              {p}
            </button>
          ))}

          {endPage < totalPages && <div className="page-dots">...</div>}

          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
            className="page-btn"
            title="Next Page"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={page === totalPages}
            className="page-btn"
            title="Last Page"
          >
            <ChevronsRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
