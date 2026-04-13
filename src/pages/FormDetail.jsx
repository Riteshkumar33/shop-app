import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import {
  HiOutlineArrowLeft,
  HiOutlineCheck,
  HiOutlineClock,
  HiOutlineDownload,
  HiOutlineChatAlt2,
  HiOutlineCalendar,
} from 'react-icons/hi';

const FormDetail = () => {
  const { id } = useParams();
  const { user, isShopkeeper } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [deadline, setDeadline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [dueDate, setDueDate] = useState('');

  useEffect(() => {
    const fetchForm = async () => {
      try {
        const { data } = await api.get(`/forms/${id}`);
        setForm(data.form);
        setDocuments(data.documents || []);
        setDeadline(data.deadline);
        if (data.deadline?.dueDate) {
          setDueDate(new Date(data.deadline.dueDate).toISOString().split('T')[0]);
        }
      } catch (err) {
        toast.error('Failed to load form');
        navigate('/forms');
      } finally {
        setLoading(false);
      }
    };
    fetchForm();
  }, [id]);

  const handleStatusUpdate = async (status) => {
    setUpdating(true);
    try {
      const body = { status };
      if (dueDate && status === 'applied') {
        body.dueDate = new Date(dueDate).toISOString();
      }
      const { data } = await api.put(`/forms/${id}/status`, body);
      setForm(data);
      toast.success(`Form marked as ${status}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed');
    } finally {
      setUpdating(false);
    }
  };

  const handleStartChat = async () => {
    try {
      const otherUserId = isShopkeeper ? form.customerId._id : form.shopkeeperId._id;
      const body = isShopkeeper
        ? { customerId: otherUserId }
        : { shopkeeperId: otherUserId };
      const { data: chat } = await api.post('/chats', body);
      navigate(`/chat/${chat._id}`);
    } catch (err) {
      toast.error('Failed to start chat');
    }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric'
  }) : '—';

  const handleDownload = async (doc) => {
    try {
      const downloadUrl = doc.url.replace(/^\/api/, '');
      const response = await api.get(downloadUrl, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', doc.originalName || 'document');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Failed to download document');
    }
  };

  const getDeadlineStatus = () => {
    if (!deadline?.dueDate) return null;
    const due = new Date(deadline.dueDate);
    const now = new Date();
    const diff = due - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (deadline.completed) return { text: 'Completed', color: 'var(--success-400)' };
    if (diff < 0) return { text: `Overdue by ${Math.abs(days)} days`, color: 'var(--danger-400)' };
    if (days <= 3) return { text: `${days} days left`, color: 'var(--warning-400)' };
    return { text: `${days} days remaining`, color: 'var(--text-secondary)' };
  };

  if (loading) {
    return <div className="spinner--center"><div className="spinner spinner--lg" /></div>;
  }

  if (!form) return null;

  const deadlineStatus = getDeadlineStatus();

  return (
    <div id="form-detail-page" className="max-w-[800px] mx-auto">
      <button className="btn btn--ghost mb-4" onClick={() => navigate(-1)}>
        <HiOutlineArrowLeft /> Back
      </button>

      {/* Header */}
      <div className="flex flex-wrap justify-between items-start mb-6 gap-4">
        <div>
          <h1 className="heading-2">{form.applicantName}</h1>
          <p className="text-secondary mt-1">
            Submitted {formatDate(form.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`badge badge--${form.status}`}>{form.status}</span>
          <button className="btn btn--secondary btn--sm" onClick={handleStartChat}>
            <HiOutlineChatAlt2 size={16} /> Chat
          </button>
        </div>
      </div>

      {/* Deadline banner */}
      {deadlineStatus && (
        <div className="glass-card glass-card--static p-4 md:px-6 mb-6 flex items-center gap-3" style={{
          borderLeftColor: deadlineStatus.color, borderLeftWidth: 4, borderLeftStyle: 'solid'
        }}>
          <HiOutlineClock size={20} style={{ color: deadlineStatus.color }} />
          <span className="font-medium" style={{ color: deadlineStatus.color }}>{deadlineStatus.text}</span>
          <span className="text-text-muted ml-auto text-sm">
            Due: {formatDate(deadline?.dueDate)}
          </span>
        </div>
      )}

      <div className="grid-responsive-2">
        {/* Form Details */}
        <div className="glass-card glass-card--static p-6">
          <h3 className="heading-4 mb-4">Application Details</h3>
          {[
            ['Applicant Name', form.applicantName],
            ['Father\'s Name', form.fatherName],
            ['Mobile', form.mobileNumber],
            ['Email', form.email || '—'],
            ['Address', form.address || '—'],
            ['Date of Birth', formatDate(form.dateOfBirth)],
            ['Description', form.description || '—'],
          ].map(([label, value]) => (
            <div key={label} className="py-3 border-b border-border-color">
              <div className="text-text-muted text-xs mb-0.5">{label}</div>
              <div className="text-sm">{value}</div>
            </div>
          ))}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          {/* Documents */}
          <div className="glass-card glass-card--static p-6">
            <h3 className="heading-4 mb-4">
              Documents ({documents.length})
            </h3>
            {documents.length === 0 ? (
              <p className="text-text-muted text-sm">No documents uploaded</p>
            ) : (
              <div className="flex flex-col gap-3">
                {documents.map(doc => (
                  <div key={doc._id} className="file-preview">
                    <div className="w-10 h-10 rounded-md bg-primary-500/10 flex items-center justify-center">
                      {doc.mimeType?.includes('image') ? '🖼️' : '📄'}
                    </div>
                    <div className="file-preview__info">
                      <div className="file-preview__name">{doc.originalName}</div>
                      <div className="file-preview__size">
                        <span className={`badge badge--${doc.type === 'photo' ? 'applied' : 'pending'} mr-2`}>
                          {doc.type}
                        </span>
                        {(doc.sizeBytes / 1024).toFixed(0)} KB
                      </div>
                    </div>
                    <button onClick={() => handleDownload(doc)}
                      className="btn btn--ghost btn--icon btn--sm">
                      <HiOutlineDownload />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Shopkeeper Actions */}
          {isShopkeeper && form.status !== 'complete' && (
            <div className="glass-card glass-card--static p-6">
              <h3 className="heading-4 mb-4">Actions</h3>

              {form.status === 'pending' && (
                <>
                  <div className="form-group mb-4">
                    <label className="form-label"><HiOutlineCalendar className="inline" /> Set Deadline</label>
                    <input type="date" className="form-input" value={dueDate}
                      onChange={e => setDueDate(e.target.value)} id="input-deadline" />
                  </div>
                  <button className="btn btn--primary w-full"
                    onClick={() => handleStatusUpdate('applied')} disabled={updating} id="mark-applied-btn">
                    {updating ? <span className="spinner" style={{ width: 18, height: 18 }} /> : (
                      <><HiOutlineClock /> Mark as Applied</>
                    )}
                  </button>
                </>
              )}

              {(form.status === 'applied' || form.status === 'overdue') && (
                <button className="btn btn--success w-full"
                  onClick={() => handleStatusUpdate('complete')} disabled={updating} id="mark-complete-btn">
                  {updating ? <span className="spinner" style={{ width: 18, height: 18 }} /> : (
                    <><HiOutlineCheck /> Mark as Complete</>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FormDetail;
