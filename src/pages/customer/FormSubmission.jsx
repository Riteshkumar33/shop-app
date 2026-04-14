import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import {
  HiOutlineUpload,
  HiOutlineX,
  HiOutlineArrowRight,
  HiOutlineArrowLeft,
  HiOutlineCheck,
  HiOutlineScissors,
} from 'react-icons/hi';
import ImageCropper from '../../components/ImageCropper';

const FormSubmission = () => {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [step, setStep] = useState(1);
  const [shopkeepers, setShopkeepers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    applicantName: user?.name || '',
    fatherName: '',
    mobileNumber: user?.mobile || '',
    email: user?.email || '',
    address: '',
    dateOfBirth: '',
    description: '',
    shopkeeperId: '',
  });
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [cropIndex, setCropIndex] = useState(null); // index of image being cropped

  useEffect(() => {
    const fetchShopkeepers = async () => {
      try {
        const { data } = await api.get('/users?role=shopkeeper');
        setShopkeepers(data);
      } catch (err) {
        console.error('Failed to fetch shopkeepers:', err);
      }
    };
    fetchShopkeepers();
  }, []);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    const validFiles = selectedFiles.filter(f => {
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`${f.name} is too large (max 10MB)`);
        return false;
      }
      if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(f.type)) {
        toast.error(`${f.name}: invalid file type`);
        return false;
      }
      return true;
    });

    setFiles(prev => [...prev, ...validFiles.map(f => ({ file: f, type: 'other' }))]);

    // Generate previews for images
    validFiles.forEach(f => {
      if (f.type.startsWith('image/')) {
        const url = URL.createObjectURL(f);
        setPreviews(prev => [...prev, { name: f.name, url, type: 'image' }]);
      } else {
        setPreviews(prev => [...prev, { name: f.name, url: null, type: 'pdf' }]);
      }
    });
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => {
      if (prev[index]?.url) URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  /* ── Crop applied ── */
  const handleCropApply = (index, croppedBlob, croppedUrl) => {
    // Revoke old preview URL
    if (previews[index]?.url) URL.revokeObjectURL(previews[index].url);

    // Replace the file with the cropped version
    const croppedFile = new File([croppedBlob], files[index].file.name, { type: 'image/jpeg' });
    setFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, file: croppedFile } : f))
    );
    setPreviews((prev) =>
      prev.map((p, i) => (i === index ? { ...p, url: croppedUrl } : p))
    );
    setCropIndex(null);
  };

  const handleSubmit = async () => {
    if (!formData.shopkeeperId) {
      return toast.error('Please select a shopkeeper');
    }
    setLoading(true);
    try {
      // 1. Create form
      const { data: form } = await api.post('/forms', formData);
      toast.success('Form submitted!');

      // 2. Upload files
      for (const { file, type } of files) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('formId', form._id);
        fd.append('type', type);
        try {
          await api.post('/documents', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch (err) {
          toast.warning(`Failed to upload ${file.name}`);
        }
      }

      toast.success('All files uploaded!');
      navigate(`/forms/${form._id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Submission failed');
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div id="form-submission-page" className="max-w-[680px] mx-auto">
      <h1 className="heading-2 mb-2">
        <span className="text-gradient">New Application</span>
      </h1>
      <p className="text-secondary mb-8">
        Fill out the form below to submit a new application.
      </p>

      {/* Step indicators */}
      <div className="flex flex-wrap gap-4 mb-8 justify-center">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
              step >= s ? 'bg-gradient-primary border-none text-white shadow-[0_0_15px_rgba(99,102,241,0.3)]' : 'bg-bg-glass border border-border-color text-text-muted'
            }`}>
              {step > s ? <HiOutlineCheck /> : s}
            </div>
            <span className={`text-sm transition-colors ${step === s ? 'font-semibold text-text-primary' : 'text-text-muted'}`}>
              {s === 1 ? 'Details' : s === 2 ? 'Documents' : 'Review'}
            </span>
            {s < 3 && <div className={`w-10 h-0.5 transition-colors duration-300 ${step > s ? 'bg-primary-400' : 'bg-border-color'}`} />}
          </div>
        ))}
      </div>

      <div className="glass-card glass-card--static p-6 md:p-8">
        {/* Step 1: Details */}
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <div className="form-group">
              <label className="form-label">Applicant Name *</label>
              <input className="form-input" name="applicantName" value={formData.applicantName}
                onChange={handleChange} placeholder="Your full name" required id="input-applicant-name" />
            </div>
            <div className="form-group">
              <label className="form-label">Father's Name *</label>
              <input className="form-input" name="fatherName" value={formData.fatherName}
                onChange={handleChange} placeholder="Father's full name" required id="input-father-name" />
            </div>
            <div className="grid-responsive-2">
              <div className="form-group">
                <label className="form-label">Mobile Number *</label>
                <input className="form-input" name="mobileNumber" value={formData.mobileNumber}
                  onChange={handleChange} placeholder="+91 9876543210" required id="input-mobile" />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" name="email" type="email" value={formData.email}
                  onChange={handleChange} placeholder="email@example.com" id="input-email" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Address</label>
              <textarea className="form-input form-textarea" name="address" value={formData.address}
                onChange={handleChange} placeholder="Your full address" id="input-address" />
            </div>
            <div className="grid-responsive-2">
              <div className="form-group">
                <label className="form-label">Date of Birth</label>
                <input className="form-input" name="dateOfBirth" type="date" value={formData.dateOfBirth}
                  onChange={handleChange} id="input-dob" />
              </div>
              <div className="form-group">
                <label className="form-label">Assign Shopkeeper *</label>
                <select className="form-input" name="shopkeeperId" value={formData.shopkeeperId}
                  onChange={handleChange} required id="input-shopkeeper">
                  <option value="">Select...</option>
                  {shopkeepers.map(s => (
                    <option key={s._id} value={s._id}>{s.name || s.email}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Additional Notes</label>
              <textarea className="form-input form-textarea" name="description" value={formData.description}
                onChange={handleChange} placeholder="Any additional information..." id="input-description" />
            </div>
          </div>
        )}

        {/* Step 2: Documents */}
        {step === 2 && (
          <div>
            <div className="file-upload" onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const dt = e.dataTransfer;
                if (dt.files.length) {
                  handleFileSelect({ target: { files: dt.files } });
                }
              }}
              id="file-dropzone"
            >
              <div className="file-upload__icon"><HiOutlineUpload /></div>
              <div className="file-upload__text">
                <strong>Click to upload</strong> or drag and drop<br />
                JPEG, PNG, WebP, PDF (max 10MB each)
              </div>
              <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleFileSelect} style={{ display: 'none' }} />
            </div>

            {previews.length > 0 && (
              <div className="mt-6 flex flex-col gap-3">
                {previews.map((p, i) => (
                  <div key={i} className="file-preview" style={{ flexWrap: 'wrap' }}>
                    {p.url ? (
                      <img src={p.url} alt={p.name} className="file-preview__image" />
                    ) : (
                      <div className="w-12 h-12 bg-danger-400/10 rounded-md flex items-center justify-center text-xl">📄</div>
                    )}
                    <div className="file-preview__info">
                      <div className="file-preview__name">{p.name}</div>
                      <div className="file-preview__size">{files[i] ? formatFileSize(files[i].file.size) : ''}</div>
                    </div>
                    <select value={files[i]?.type || 'other'} onChange={e => {
                      setFiles(prev => prev.map((f, fi) => fi === i ? { ...f, type: e.target.value } : f));
                    }} className="form-input w-[140px] px-2 py-1.5 text-xs">
                      <option value="photo">Photo</option>
                      <option value="certificate">Certificate</option>
                      <option value="signature">Signature</option>
                      <option value="id_proof">ID Proof</option>
                      <option value="other">Other</option>
                    </select>
                    {p.type === 'image' && (
                      <button
                        className="btn btn--ghost btn--icon btn--sm"
                        onClick={() => setCropIndex(i)}
                        title="Crop image"
                      >
                        <HiOutlineScissors size={16} />
                      </button>
                    )}
                    <button className="btn btn--ghost btn--icon" onClick={() => removeFile(i)}>
                      <HiOutlineX />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <h3 className="heading-4 mb-2">Review Your Application</h3>
            {[
              ['Applicant', formData.applicantName],
              ['Father\'s Name', formData.fatherName],
              ['Mobile', formData.mobileNumber],
              ['Email', formData.email || '—'],
              ['Address', formData.address || '—'],
              ['Date of Birth', formData.dateOfBirth || '—'],
              ['Shopkeeper', shopkeepers.find(s => s._id === formData.shopkeeperId)?.name || '—'],
              ['Documents', `${files.length} file(s)`],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between py-3 border-b border-border-color">
                <span className="text-text-muted text-sm">{label}</span>
                <span className="font-medium text-sm">{value}</span>
              </div>
            ))}
            {formData.description && (
              <div className="py-3">
                <span className="text-text-muted text-sm">Notes</span>
                <p className="text-sm mt-1">{formData.description}</p>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          {step > 1 ? (
            <button className="btn btn--secondary" onClick={() => setStep(s => s - 1)}>
              <HiOutlineArrowLeft /> Back
            </button>
          ) : <div />}

          {step < 3 ? (
            <button className="btn btn--primary" onClick={() => setStep(s => s + 1)} id="next-step-btn">
              Next <HiOutlineArrowRight />
            </button>
          ) : (
            <button className="btn btn--success btn--lg" onClick={handleSubmit} disabled={loading} id="submit-form-btn">
              {loading ? <span className="spinner" style={{ width: 20, height: 20 }} /> : (
                <>Submit Application <HiOutlineCheck /></>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Image Cropper Modal ── */}
      {cropIndex !== null && previews[cropIndex]?.url && (
        <ImageCropper
          imageSrc={previews[cropIndex].url}
          fileName={previews[cropIndex].name}
          onCancel={() => setCropIndex(null)}
          onApply={(blob, url) => handleCropApply(cropIndex, blob, url)}
        />
      )}
    </div>
  );
};

export default FormSubmission;
