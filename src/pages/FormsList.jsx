import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { HiOutlineArrowRight, HiOutlineSearch, HiOutlineFilter } from 'react-icons/hi';

const FormsList = () => {
  const { isCustomer } = useAuth();
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchForms = async () => {
      try {
        const params = {};
        if (statusFilter) params.status = statusFilter;
        const { data } = await api.get('/forms', { params });
        setForms(data.forms || []);
      } catch (err) {
        console.error('Failed to fetch forms:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchForms();
  }, [statusFilter]);

  const filteredForms = forms.filter(f =>
    f.applicantName?.toLowerCase().includes(search.toLowerCase()) ||
    f.mobileNumber?.includes(search)
  );

  const formatDate = (d) => new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });

  if (loading) {
    return (
      <div>
        <div className="animate-pulse bg-white/10 rounded-md h-8 w-1/2 mb-6" />
        {[1, 2, 3].map(i => <div key={i} className="animate-pulse bg-white/10 rounded-xl h-20 mb-4" />)}
      </div>
    );
  }

  return (
    <div id="forms-list-page">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <h1 className="heading-2">{isCustomer ? 'My Applications' : 'Forms Queue'}</h1>
        {isCustomer && (
          <Link to="/forms/new" className="btn btn--primary" id="new-form-link">+ New Application</Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="relative flex-1 min-w-[250px]">
          <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input className="form-input pl-10" placeholder="Search by name or mobile..."
            value={search} onChange={e => setSearch(e.target.value)}
            id="search-input" />
        </div>
        <select className="form-input w-full sm:w-[180px]" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          id="status-filter">
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="applied">Applied</option>
          <option value="complete">Complete</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      {/* Forms */}
      {filteredForms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
          <div className="text-6xl text-text-muted opacity-50 mb-4">📋</div>
          <div className="text-xl font-semibold mb-2">No forms found</div>
          <div className="text-sm text-text-muted max-w-sm">
            {search || statusFilter ? 'Try adjusting your filters.' : 'No applications yet.'}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredForms.map(form => (
            <Link key={form._id} to={`/forms/${form._id}`} className="block">
              <div className="glass-card flex items-center gap-4 p-5 md:p-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center font-bold text-white text-lg shrink-0">
                  {form.applicantName?.charAt(0)?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold mb-0.5">{form.applicantName}</div>
                  <div className="text-text-muted text-xs">
                    {form.mobileNumber} • {formatDate(form.createdAt)}
                  </div>
                </div>
                <span className={`font-semibold capitalize px-2 py-1 ${
                  form.status === 'complete' ? 'text-green-500' :
                  form.status === 'overdue' ? 'text-red-500' :
                  form.status === 'pending' ? 'text-yellow-500' :
                  'text-blue-500'
                }`}>
                  {form.status === 'complete' ? 'Completed' : form.status}
                </span>
                <HiOutlineArrowRight className="text-text-muted" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default FormsList;
