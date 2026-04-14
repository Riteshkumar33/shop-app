import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import { PDFDocument } from 'pdf-lib';
import {
  HiOutlineArrowLeft,
  HiOutlineCheck,
  HiOutlineClock,
  HiOutlineDownload,
  HiOutlineChatAlt2,
  HiOutlineCalendar,
  HiOutlineTrash,
} from 'react-icons/hi';

/* ───────── Compression helpers ───────── */

/**
 * Helper: convert canvas to blob at given quality (Promise-based).
 */
const canvasToBlob = (canvas, mime, quality) =>
  new Promise((resolve) => canvas.toBlob((b) => resolve(b), mime, quality));

/**
 * Compress an image blob to ≤ targetBytes.
 * Strategy: binary-search on quality first, then progressively shrink
 * dimensions until the target is met.
 */
const compressImageToSize = async (blob, targetBytes) => {
  const img = await createImageBitmap(blob);
  const outputMime = 'image/jpeg'; // JPEG gives best quality control

  let width = img.width;
  let height = img.height;
  let bestBlob = null;

  // Outer loop: progressively shrink dimensions
  for (let scale = 1.0; scale >= 0.05; scale -= 0.08) {
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    // Binary search on quality at this dimension
    let lo = 0.01, hi = 0.95;
    for (let i = 0; i < 25; i++) {
      const mid = (lo + hi) / 2;
      const result = await canvasToBlob(canvas, outputMime, mid);
      if (!result) break;

      if (result.size <= targetBytes) {
        bestBlob = result;
        lo = mid + 0.005; // try slightly higher quality
      } else {
        hi = mid - 0.005;
      }

      // Close enough — within 5% of target or exactly under
      if (bestBlob && bestBlob.size >= targetBytes * 0.90) break;
      if (hi <= lo) break;
    }

    // If we found a result at this scale, we're done
    if (bestBlob && bestBlob.size <= targetBytes) break;

    // Even at quality 0.01 the blob is too large — shrink dimensions more
    const minBlob = await canvasToBlob(canvas, outputMime, 0.01);
    if (minBlob && minBlob.size <= targetBytes) {
      bestBlob = minBlob;
      // Now fine-tune quality at this scale
      let lo2 = 0.01, hi2 = 0.95;
      for (let j = 0; j < 20; j++) {
        const mid2 = (lo2 + hi2) / 2;
        const r = await canvasToBlob(canvas, outputMime, mid2);
        if (!r) break;
        if (r.size <= targetBytes) {
          bestBlob = r;
          lo2 = mid2 + 0.005;
        } else {
          hi2 = mid2 - 0.005;
        }
        if (bestBlob.size >= targetBytes * 0.90) break;
        if (hi2 <= lo2) break;
      }
      break;
    }
  }

  if (!bestBlob) throw new Error('Cannot compress to target size — try a larger value');
  return bestBlob;
};

/**
 * Compress a PDF to ≤ targetBytes by rasterizing pages at reduced resolution
 * and re-assembling into a new PDF with embedded JPEG images.
 */
const compressPDFToSize = async (blob, targetBytes) => {
  // First try simple re-serialization
  const arrayBuf = await blob.arrayBuffer();
  const srcDoc = await PDFDocument.load(arrayBuf, { ignoreEncryption: true });
  srcDoc.setTitle(''); srcDoc.setAuthor(''); srcDoc.setSubject('');
  srcDoc.setKeywords([]); srcDoc.setProducer(''); srcDoc.setCreator('');
  const quickBytes = await srcDoc.save({ useObjectStreams: true });
  if (quickBytes.byteLength <= targetBytes) {
    return new Blob([quickBytes], { type: 'application/pdf' });
  }

  // Re-serialization wasn't enough — rasterize pages at lower DPI
  const pageCount = srcDoc.getPageCount();
  const bytesPerPage = targetBytes / pageCount;

  // Use pdfjs-dist via CDN to render pages to canvas
  const pdfjsLib = await loadPdfJs();
  const pdfTask = pdfjsLib.getDocument({ data: arrayBuf });
  const pdfDoc = await pdfTask.promise;

  const newDoc = await PDFDocument.create();

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdfDoc.getPage(i);
    const origViewport = page.getViewport({ scale: 1.0 });

    // Try progressively lower scales until page image fits budget
    let pageBlob = null;
    for (let dpiScale = 1.5; dpiScale >= 0.2; dpiScale -= 0.15) {
      const viewport = page.getViewport({ scale: dpiScale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      // Binary search on JPEG quality
      let lo = 0.05, hi = 0.85, best = null;
      for (let j = 0; j < 15; j++) {
        const mid = (lo + hi) / 2;
        const b = await canvasToBlob(canvas, 'image/jpeg', mid);
        if (!b) break;
        if (b.size <= bytesPerPage) {
          best = b;
          lo = mid + 0.01;
        } else {
          hi = mid - 0.01;
        }
        if (hi <= lo) break;
      }
      if (!best) {
        best = await canvasToBlob(canvas, 'image/jpeg', 0.05);
      }
      if (best && best.size <= bytesPerPage) {
        pageBlob = best;
        break;
      }
      pageBlob = best; // keep reducing scale
    }

    if (pageBlob) {
      const jpegBytes = new Uint8Array(await pageBlob.arrayBuffer());
      const jpegImage = await newDoc.embedJpg(jpegBytes);
      const newPage = newDoc.addPage([origViewport.width, origViewport.height]);
      newPage.drawImage(jpegImage, {
        x: 0, y: 0,
        width: origViewport.width,
        height: origViewport.height,
      });
    }
  }

  const finalBytes = await newDoc.save({ useObjectStreams: true });
  return new Blob([finalBytes], { type: 'application/pdf' });
};

/** Lazy-load pdf.js from CDN (needed only for PDF rasterization) */
let _pdfjsPromise = null;
const loadPdfJs = () => {
  if (_pdfjsPromise) return _pdfjsPromise;
  _pdfjsPromise = new Promise((resolve, reject) => {
    if (window.pdfjsLib) return resolve(window.pdfjsLib);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error('Failed to load PDF.js'));
    document.head.appendChild(script);
  });
  return _pdfjsPromise;
};

/* ═══════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════ */

const FormDetail = () => {
  const { id } = useParams();
  const { user, isShopkeeper, isCustomer } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [deadline, setDeadline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [dueDate, setDueDate] = useState('');

  // Per-document target size (KB) and compression state
  const [targetSizes, setTargetSizes] = useState({});   // { [docId]: string }
  const [compressing, setCompressing] = useState({});    // { [docId]: boolean }

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

  /* ── Normal download (original size) ── */
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

  /* ── Compressed download (reduce to target KB) ── */
  const handleCompressedDownload = async (doc) => {
    const targetKB = parseFloat(targetSizes[doc._id]);
    if (!targetKB || targetKB <= 0) {
      toast.error('Enter a valid target size in KB');
      return;
    }

    const targetBytes = targetKB * 1024;
    const isImage = doc.mimeType?.startsWith('image/');
    const isPDF = doc.mimeType === 'application/pdf';

    if (!isImage && !isPDF) {
      toast.error('Compression is only supported for images and PDFs');
      return;
    }

    setCompressing((prev) => ({ ...prev, [doc._id]: true }));
    try {
      // 1. Fetch the original file
      const downloadUrl = doc.url.replace(/^\/api/, '');
      const response = await api.get(downloadUrl, { responseType: 'blob' });
      const originalBlob = response.data;

      let compressedBlob;

      if (isImage) {
        // 2a. Compress image to target size
        compressedBlob = await compressImageToSize(originalBlob, targetBytes);
      } else {
        // 2b. Compress PDF to target size (rasterizes pages if needed)
        compressedBlob = await compressPDFToSize(originalBlob, targetBytes);
      }

      // 3. Trigger download
      const url = window.URL.createObjectURL(compressedBlob);
      const link = document.createElement('a');
      link.href = url;

      const ext = isImage ? (doc.mimeType === 'image/png' ? 'jpg' : doc.originalName?.split('.').pop() || 'jpg') : 'pdf';
      const baseName = (doc.originalName || 'document').replace(/\.[^.]+$/, '');
      link.setAttribute('download', `${baseName}_${targetKB}KB.${ext}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      const savedPercent = Math.round(((originalBlob.size - compressedBlob.size) / originalBlob.size) * 100);
      toast.success(`Downloaded! Reduced from ${(originalBlob.size / 1024).toFixed(0)} KB → ${(compressedBlob.size / 1024).toFixed(0)} KB (${savedPercent}% saved)`);
    } catch (err) {
      console.error(err);
      toast.error('Compression failed — try a larger target size');
    } finally {
      setCompressing((prev) => ({ ...prev, [doc._id]: false }));
    }
  };

  const handleDelete = async (doc) => {
    const confirmed = window.confirm('Are you sure you want to delete this document?');
    if (!confirmed) return;

    try {
      await api.delete(`/documents/${doc._id}`);
      setDocuments(prev => prev.filter(d => d._id !== doc._id));
      toast.success('Document deleted');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete document');
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
                  <div key={doc._id} className="flex flex-col gap-2 p-3 bg-bg-glass rounded-lg border border-border-color">
                    {/* Row 1: file info + original download */}
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-md bg-primary-500/10 flex items-center justify-center shrink-0">
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
                      <button
                        onClick={() => handleDownload(doc)}
                        className="btn btn--ghost btn--icon btn--sm"
                        title="Download original"
                      >
                        <HiOutlineDownload />
                      </button>
                      {isCustomer && form.status === 'pending' && (
                        <button
                          onClick={() => handleDelete(doc)}
                          className="btn btn--ghost btn--icon btn--sm text-danger-500"
                          title="Delete document"
                        >
                          <HiOutlineTrash />
                        </button>
                      )}
                    </div>

                    {/* Row 2: compressed download with target size input */}
                    {(doc.mimeType?.startsWith('image/') || doc.mimeType === 'application/pdf') && (
                      <div className="flex items-center gap-2 pl-[52px]">
                        <div className="relative flex items-center">
                          <input
                            type="number"
                            min="1"
                            placeholder="Size"
                            value={targetSizes[doc._id] || ''}
                            onChange={(e) =>
                              setTargetSizes((prev) => ({ ...prev, [doc._id]: e.target.value }))
                            }
                            className="w-[72px] px-2 py-1.5 text-xs bg-bg-input border border-border-color rounded-l-md text-text-primary outline-none focus:border-primary-400 transition-colors"
                            title="Enter target file size"
                            id={`target-size-${doc._id}`}
                          />
                          <span className="px-2 py-1.5 text-[10px] font-bold text-text-muted bg-bg-input border border-l-0 border-border-color rounded-r-md uppercase tracking-wide">
                            KB
                          </span>
                        </div>
                        <button
                          onClick={() => handleCompressedDownload(doc)}
                          disabled={compressing[doc._id] || !targetSizes[doc._id]}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-md transition-all duration-200 bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm hover:shadow-md hover:from-indigo-600 hover:to-purple-600 disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Download compressed to target size"
                          id={`compress-download-${doc._id}`}
                        >
                          {compressing[doc._id] ? (
                            <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                          ) : (
                            <>
                              <HiOutlineDownload size={12} />
                              Reduced
                            </>
                          )}
                        </button>
                        <span className="text-[10px] text-text-muted hidden sm:inline">
                          Enter KB → download reduced
                        </span>
                      </div>
                    )}
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
