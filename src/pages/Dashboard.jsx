import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  HiOutlineDocumentText,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineExclamationCircle,
  HiOutlinePlusCircle,
  HiOutlineArrowRight,
} from 'react-icons/hi';

const Dashboard = () => {
  const { user, isCustomer, isShopkeeper } = useAuth();
  const [forms, setForms] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, applied: 0, complete: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data } = await api.get('/forms');
        setForms(data.forms || []);

        const s = { total: 0, pending: 0, applied: 0, complete: 0, overdue: 0 };
        (data.forms || []).forEach(f => {
          s.total++;
          s[f.status] = (s[f.status] || 0) + 1;
        });
        setStats(s);
      } catch (err) {
        console.error('Failed to fetch forms:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const formatDate = (d) => new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });

  if (loading) {
    return (
      <div>
        <div className="animate-pulse bg-white/10 rounded-md h-7 w-3/5 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[1, 2, 3, 4].map(i => <div key={i} className="animate-pulse bg-white/10 rounded-xl" style={{ height: 120 }} />)}
        </div>
      </div>
    );
  }

  return (
    <div id="dashboard-page">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="heading-2 mb-2">
          Welcome back, <span className="text-gradient">{user?.name || 'User'}</span> 👋
        </h1>
        <p className="text-secondary">
          {isCustomer
            ? 'Track your applications and connect with shopkeepers.'
            : 'Manage incoming applications and deadlines.'}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="glass-card p-6 relative overflow-hidden">
          <HiOutlineDocumentText className="absolute top-4 right-4 text-2xl opacity-60 text-primary-400" />
          <div className="text-4xl font-extrabold mb-1 text-gradient">{stats.total}</div>
          <div className="text-sm text-text-secondary">Total Forms</div>
        </div>
        <div className="glass-card p-6 relative overflow-hidden">
          <HiOutlineClock className="absolute top-4 right-4 text-2xl opacity-60 text-yellow-500" />
          <div className="text-4xl font-extrabold mb-1 text-yellow-500">{stats.pending}</div>
          <div className="text-sm text-text-secondary">Pending</div>
        </div>
        <div className="glass-card p-6 relative overflow-hidden">
          <HiOutlineCheckCircle className="absolute top-4 right-4 text-2xl opacity-60 text-green-500" />
          <div className="text-4xl font-extrabold mb-1 text-green-500">{stats.complete}</div>
          <div className="text-sm text-text-secondary">Completed</div>
        </div>
        <div className="glass-card p-6 relative overflow-hidden">
          <HiOutlineExclamationCircle className="absolute top-4 right-4 text-2xl opacity-60 text-red-500" />
          <div className="text-4xl font-extrabold mb-1 text-red-500">{stats.overdue}</div>
          <div className="text-sm text-text-secondary">Overdue</div>
        </div>
      </div>

      {/* Quick Action */}
      {isCustomer && (
        <Link to="/forms/new" className="btn btn--primary btn--lg mb-8" id="new-form-btn">
          <HiOutlinePlusCircle size={20} />
          New Application
        </Link>
      )}

      {/* Recent Forms */}
      <div className="glass-card glass-card--static p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="heading-4">Recent Forms</h2>
          <Link to="/forms" className="btn btn--ghost btn--sm">
            View all <HiOutlineArrowRight size={14} />
          </Link>
        </div>

        {forms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
            <div className="text-6xl text-text-muted opacity-50 mb-4">📋</div>
            <div className="text-xl font-semibold mb-2">No forms yet</div>
            <div className="text-sm text-text-muted max-w-sm">
              {isCustomer ? 'Submit your first application to get started.' : 'No applications assigned yet.'}
            </div>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Mobile</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {forms.slice(0, 5).map(form => (
                  <tr key={form._id}>
                    <td style={{ fontWeight: 600 }}>{form.applicantName}</td>
                    <td>{form.mobileNumber}</td>
                    <td className={`font-semibold capitalize ${
                      form.status === 'complete' ? 'text-green-500' :
                      form.status === 'overdue' ? 'text-red-500' :
                      form.status === 'pending' ? 'text-yellow-500' :
                      'text-blue-500'
                    }`}>
                      {form.status === 'complete' ? 'Completed' : form.status}
                    </td>
                    <td className="text-text-muted">{formatDate(form.createdAt)}</td>
                    <td>
                      <Link to={`/forms/${form._id}`} className="btn btn--ghost btn--sm">
                        View <HiOutlineArrowRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
