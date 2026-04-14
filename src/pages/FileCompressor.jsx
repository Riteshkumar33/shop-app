import { useState, useRef, useCallback } from 'react';
import {
  HiOutlineUpload,
  HiOutlineDownload,
  HiOutlineTrash,
  HiOutlinePhotograph,
  HiOutlineDocumentText,
  HiOutlineAdjustments,
  HiOutlineRefresh,
  HiOutlineCheckCircle,
  HiOutlineX,
} from 'react-icons/hi';
import { PDFDocument } from 'pdf-lib';

/* ───────── helpers ───────── */

const formatSize = (bytes) => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

const getReductionPercent = (original, compressed) => {
  if (!original || !compressed) return 0;
  return Math.round(((original - compressed) / original) * 100);
};

const getMimeFromExt = (name) => {
  const ext = name.split('.').pop().toLowerCase();
  const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };
  return map[ext] || '';
};

/* ───────── image compressor (uses Canvas API) ───────── */

const compressImage = (file, settings) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.onload = () => {
        let { width, height } = img;

        // Apply max dimension scaling
        if (settings.maxWidth && width > settings.maxWidth) {
          height = Math.round(height * (settings.maxWidth / width));
          width = settings.maxWidth;
        }
        if (settings.maxHeight && height > settings.maxHeight) {
          width = Math.round(width * (settings.maxHeight / height));
          height = settings.maxHeight;
        }

        // Apply scale percentage
        if (settings.scale && settings.scale < 100) {
          const factor = settings.scale / 100;
          width = Math.round(width * factor);
          height = Math.round(height * factor);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Smooth scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Determine output format
        const outputFormat = settings.outputFormat || file.type || 'image/jpeg';
        const quality = (settings.quality || 80) / 100;

        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('Compression failed'));
            resolve({
              blob,
              width,
              height,
              originalWidth: img.width,
              originalHeight: img.height,
            });
          },
          outputFormat,
          quality
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

/* ───────── PDF compressor (re-serialize with pdf-lib) ───────── */

const compressPDF = async (file, settings) => {
  const arrayBuf = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuf, { ignoreEncryption: true });

  // Remove metadata to reduce size
  if (settings.removeMetadata) {
    pdfDoc.setTitle('');
    pdfDoc.setAuthor('');
    pdfDoc.setSubject('');
    pdfDoc.setKeywords([]);
    pdfDoc.setProducer('');
    pdfDoc.setCreator('');
  }

  // Serialize — pdf-lib re-serializes which can strip unused objects
  const compressedBytes = await pdfDoc.save({
    useObjectStreams: true,        // object-stream compression
    addDefaultPage: false,
    objectsPerTick: 100,
  });

  const blob = new Blob([compressedBytes], { type: 'application/pdf' });
  return { blob, pages: pdfDoc.getPageCount() };
};

/* ═══════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════ */

const FileCompressor = () => {
  const fileInputRef = useRef(null);

  // Files state
  const [files, setFiles] = useState([]);           // { id, file, preview, compressed, compressing, error, meta }
  const [activeId, setActiveId] = useState(null);    // selected file id for settings

  // Global settings
  const [settings, setSettings] = useState({
    quality: 70,
    scale: 100,
    maxWidth: 0,
    maxHeight: 0,
    outputFormat: '',     // '' = keep original
    removeMetadata: true,
  });

  const nextId = useRef(0);

  /* ── Add files ── */
  const handleFileSelect = useCallback((selectedFiles) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const valid = Array.from(selectedFiles).filter((f) => {
      const mime = f.type || getMimeFromExt(f.name);
      return allowed.includes(mime) && f.size > 0;
    });

    const newFiles = valid.map((file) => {
      const id = ++nextId.current;
      const isImage = file.type.startsWith('image/');
      return {
        id,
        file,
        preview: isImage ? URL.createObjectURL(file) : null,
        compressed: null,
        compressing: false,
        error: null,
        meta: null,
      };
    });

    setFiles((prev) => [...prev, ...newFiles]);
    if (newFiles.length > 0 && !activeId) {
      setActiveId(newFiles[0].id);
    }
  }, [activeId]);

  /* ── Remove file ── */
  const removeFile = (id) => {
    setFiles((prev) => {
      const item = prev.find((f) => f.id === id);
      if (item?.preview) URL.revokeObjectURL(item.preview);
      if (item?.compressed?.url) URL.revokeObjectURL(item.compressed.url);
      return prev.filter((f) => f.id !== id);
    });
    if (activeId === id) {
      setActiveId((prev) => {
        const remaining = files.filter((f) => f.id !== id);
        return remaining.length > 0 ? remaining[0].id : null;
      });
    }
  };

  /* ── Compress single file ── */
  const compressFile = async (id) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, compressing: true, error: null, compressed: null } : f))
    );

    const item = files.find((f) => f.id === id);
    if (!item) return;

    try {
      const isImage = item.file.type.startsWith('image/');
      let result;

      if (isImage) {
        const imgSettings = {
          ...settings,
          outputFormat: settings.outputFormat || item.file.type,
        };
        result = await compressImage(item.file, imgSettings);
        const url = URL.createObjectURL(result.blob);
        setFiles((prev) =>
          prev.map((f) =>
            f.id === id
              ? {
                  ...f,
                  compressing: false,
                  compressed: {
                    blob: result.blob,
                    url,
                    size: result.blob.size,
                  },
                  meta: {
                    originalWidth: result.originalWidth,
                    originalHeight: result.originalHeight,
                    newWidth: result.width,
                    newHeight: result.height,
                  },
                }
              : f
          )
        );
      } else {
        // PDF
        result = await compressPDF(item.file, settings);
        const url = URL.createObjectURL(result.blob);
        setFiles((prev) =>
          prev.map((f) =>
            f.id === id
              ? {
                  ...f,
                  compressing: false,
                  compressed: {
                    blob: result.blob,
                    url,
                    size: result.blob.size,
                  },
                  meta: { pages: result.pages },
                }
              : f
          )
        );
      }
    } catch (err) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === id ? { ...f, compressing: false, error: err.message || 'Compression failed' } : f
        )
      );
    }
  };

  /* ── Compress all ── */
  const compressAll = async () => {
    for (const f of files) {
      if (!f.compressed && !f.compressing) {
        await compressFile(f.id);
      }
    }
  };

  /* ── Download single ── */
  const downloadFile = (item) => {
    if (!item.compressed) return;
    const link = document.createElement('a');
    link.href = item.compressed.url;
    const ext = item.file.name.split('.').pop();
    const baseName = item.file.name.replace(/\.[^.]+$/, '');
    link.download = `${baseName}_compressed.${ext}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  /* ── Download All ── */
  const downloadAll = () => {
    files.forEach((item) => {
      if (item.compressed) downloadFile(item);
    });
  };

  /* ── Computed ── */
  const activeFile = files.find((f) => f.id === activeId);
  const totalOriginal = files.reduce((s, f) => s + f.file.size, 0);
  const totalCompressed = files.reduce((s, f) => s + (f.compressed?.size || 0), 0);
  const compressedCount = files.filter((f) => f.compressed).length;
  const isImage = activeFile?.file?.type?.startsWith('image/');

  return (
    <div id="file-compressor-page" className="max-w-[1100px] mx-auto">
      {/* ── Header ── */}
      <div className="mb-6">
        <h1 className="heading-2 mb-1">
          <span className="text-gradient">File Compressor</span>
        </h1>
        <p className="text-secondary text-sm">
          Reduce file sizes for images (JPEG, PNG, WebP) and PDFs — entirely in your browser.
        </p>
      </div>

      {files.length === 0 ? (
        /* ── Empty state: large dropzone ── */
        <div
          className="file-upload py-16"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFileSelect(e.dataTransfer.files);
          }}
          id="compressor-dropzone"
        >
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-primary-500/10 flex items-center justify-center">
              <HiOutlineUpload size={36} className="text-primary-400" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold mb-1">Drop files here or click to browse</p>
              <p className="text-text-muted text-sm">
                Supports JPEG, PNG, WebP &amp; PDF — max 50 MB each
              </p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => handleFileSelect(e.target.files)}
            style={{ display: 'none' }}
          />
        </div>
      ) : (
        /* ── Main UI with files ── */
        <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 320px' }}>
          {/* ─── LEFT: file list + stats ─── */}
          <div className="flex flex-col gap-5">
            {/* Stats bar */}
            <div className="glass-card glass-card--static p-4 flex flex-wrap items-center gap-4 md:gap-6">
              <div className="flex-1 min-w-[140px]">
                <div className="text-xs text-text-muted mb-0.5">Original</div>
                <div className="font-semibold">{formatSize(totalOriginal)}</div>
              </div>
              <div className="flex-1 min-w-[140px]">
                <div className="text-xs text-text-muted mb-0.5">Compressed</div>
                <div className="font-semibold text-primary-400">
                  {compressedCount > 0 ? formatSize(totalCompressed) : '—'}
                </div>
              </div>
              <div className="flex-1 min-w-[100px]">
                <div className="text-xs text-text-muted mb-0.5">Saved</div>
                <div className="font-semibold" style={{ color: compressedCount > 0 ? 'var(--success-400, #10b981)' : 'inherit' }}>
                  {compressedCount > 0
                    ? `${getReductionPercent(totalOriginal, totalCompressed)}%`
                    : '—'}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn--primary btn--sm"
                  onClick={compressAll}
                  disabled={files.some((f) => f.compressing)}
                  id="compress-all-btn"
                >
                  <HiOutlineAdjustments size={14} /> Compress All
                </button>
                {compressedCount > 0 && (
                  <button className="btn btn--success btn--sm" onClick={downloadAll} id="download-all-btn">
                    <HiOutlineDownload size={14} /> Download All
                  </button>
                )}
              </div>
            </div>

            {/* Add more */}
            <div
              className="border-2 border-dashed border-border-color rounded-xl p-3 text-center cursor-pointer transition-all duration-300 bg-bg-glass hover:border-primary-400 hover:bg-primary-500/5 text-sm text-text-muted"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFileSelect(e.dataTransfer.files);
              }}
            >
              <HiOutlineUpload className="inline mr-1" /> Add more files
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => handleFileSelect(e.target.files)}
                style={{ display: 'none' }}
              />
            </div>

            {/* File list */}
            <div className="flex flex-col gap-2">
              {files.map((item) => {
                const isImg = item.file.type.startsWith('image/');
                const reduction = item.compressed
                  ? getReductionPercent(item.file.size, item.compressed.size)
                  : null;

                return (
                  <div
                    key={item.id}
                    onClick={() => setActiveId(item.id)}
                    className={`file-preview cursor-pointer transition-all duration-200 ${
                      activeId === item.id
                        ? 'ring-2 ring-primary-400/60 bg-primary-500/5'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0 bg-primary-500/10">
                      {isImg ? (
                        <HiOutlinePhotograph size={20} className="text-primary-400" />
                      ) : (
                        <HiOutlineDocumentText size={20} className="text-red-400" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="file-preview__info">
                      <div className="file-preview__name">{item.file.name}</div>
                      <div className="file-preview__size flex items-center gap-2">
                        <span>{formatSize(item.file.size)}</span>
                        {item.compressed && (
                          <>
                            <span className="text-text-muted">→</span>
                            <span className="text-primary-400 font-medium">
                              {formatSize(item.compressed.size)}
                            </span>
                            <span
                              className="text-xs font-bold px-1.5 py-0.5 rounded"
                              style={{
                                color: reduction > 0 ? '#10b981' : '#ef4444',
                                background: reduction > 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                              }}
                            >
                              {reduction > 0 ? `-${reduction}%` : `+${Math.abs(reduction)}%`}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      {item.compressing && (
                        <span className="spinner" style={{ width: 18, height: 18 }} />
                      )}
                      {item.compressed && !item.compressing && (
                        <HiOutlineCheckCircle size={18} className="text-green-400" />
                      )}
                      {!item.compressing && !item.compressed && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            compressFile(item.id);
                          }}
                          className="btn btn--ghost btn--icon btn--sm"
                          title="Compress"
                        >
                          <HiOutlineRefresh size={16} />
                        </button>
                      )}
                      {item.compressed && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadFile(item);
                          }}
                          className="btn btn--ghost btn--icon btn--sm"
                          title="Download"
                        >
                          <HiOutlineDownload size={16} />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(item.id);
                        }}
                        className="btn btn--ghost btn--icon btn--sm text-danger-500"
                        title="Remove"
                      >
                        <HiOutlineX size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── RIGHT: settings panel ─── */}
          <div className="flex flex-col gap-5">
            <div className="glass-card glass-card--static p-5">
              <h3 className="heading-4 mb-4 flex items-center gap-2">
                <HiOutlineAdjustments size={18} className="text-primary-400" />
                Compression Settings
              </h3>

              {/* Quality slider (images) */}
              <div className="form-group mb-4">
                <label className="form-label flex justify-between">
                  <span>Quality</span>
                  <span className="text-primary-400 font-bold">{settings.quality}%</span>
                </label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={settings.quality}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, quality: parseInt(e.target.value) }))
                  }
                  className="w-full accent-primary-400 cursor-pointer"
                  id="quality-slider"
                  style={{ height: '6px' }}
                />
                <div className="flex justify-between text-[10px] text-text-muted -mt-1">
                  <span>Smallest</span>
                  <span>Best quality</span>
                </div>
              </div>

              {/* Scale percentage */}
              <div className="form-group mb-4">
                <label className="form-label flex justify-between">
                  <span>Scale</span>
                  <span className="text-primary-400 font-bold">{settings.scale}%</span>
                </label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={settings.scale}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, scale: parseInt(e.target.value) }))
                  }
                  className="w-full accent-primary-400 cursor-pointer"
                  id="scale-slider"
                  style={{ height: '6px' }}
                />
                <div className="flex justify-between text-[10px] text-text-muted -mt-1">
                  <span>10%</span>
                  <span>Original size</span>
                </div>
              </div>

              {/* Max dimensions */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="form-group">
                  <label className="form-label text-xs">Max Width (px)</label>
                  <input
                    type="number"
                    className="form-input text-sm py-2"
                    placeholder="Auto"
                    value={settings.maxWidth || ''}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, maxWidth: parseInt(e.target.value) || 0 }))
                    }
                    min="0"
                    id="max-width-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label text-xs">Max Height (px)</label>
                  <input
                    type="number"
                    className="form-input text-sm py-2"
                    placeholder="Auto"
                    value={settings.maxHeight || ''}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, maxHeight: parseInt(e.target.value) || 0 }))
                    }
                    min="0"
                    id="max-height-input"
                  />
                </div>
              </div>

              {/* Output format */}
              <div className="form-group mb-4">
                <label className="form-label text-xs">Output Format (images)</label>
                <select
                  className="form-input text-sm py-2"
                  value={settings.outputFormat}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, outputFormat: e.target.value }))
                  }
                  id="format-select"
                >
                  <option value="">Keep original</option>
                  <option value="image/jpeg">JPEG</option>
                  <option value="image/png">PNG</option>
                  <option value="image/webp">WebP</option>
                </select>
              </div>

              {/* PDF options */}
              <div className="form-group mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.removeMetadata}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, removeMetadata: e.target.checked }))
                    }
                    className="w-4 h-4 accent-primary-400"
                    id="remove-metadata-checkbox"
                  />
                  <span className="text-sm">Remove PDF metadata</span>
                </label>
              </div>

              {/* Presets */}
              <div className="form-group">
                <label className="form-label text-xs mb-2">Quick Presets</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Light', quality: 85, scale: 100 },
                    { label: 'Medium', quality: 60, scale: 90 },
                    { label: 'Heavy', quality: 35, scale: 70 },
                    { label: 'Maximum', quality: 15, scale: 50 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() =>
                        setSettings((s) => ({
                          ...s,
                          quality: preset.quality,
                          scale: preset.scale,
                        }))
                      }
                      className={`text-xs py-2 px-3 rounded-lg border transition-all duration-200 font-medium ${
                        settings.quality === preset.quality && settings.scale === preset.scale
                          ? 'border-primary-400 bg-primary-500/10 text-primary-400'
                          : 'border-border-color bg-bg-glass text-text-secondary hover:border-primary-400/50 hover:text-text-primary'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Preview card ── */}
            {activeFile && (
              <div className="glass-card glass-card--static p-5">
                <h4 className="text-sm font-semibold text-text-secondary mb-3">Preview</h4>

                {isImage && activeFile.preview && (
                  <div className="mb-3">
                    <div className="relative rounded-lg overflow-hidden border border-border-color bg-black/20">
                      <img
                        src={activeFile.compressed?.url || activeFile.preview}
                        alt="preview"
                        className="w-full h-auto max-h-[200px] object-contain"
                      />
                      {activeFile.compressed && (
                        <div className="absolute top-2 right-2 text-[10px] font-bold px-2 py-1 rounded-md bg-green-500/20 text-green-400 backdrop-blur-sm">
                          Compressed
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {!isImage && (
                  <div className="flex items-center justify-center py-6 mb-3 rounded-lg border border-border-color bg-black/10">
                    <div className="text-center">
                      <HiOutlineDocumentText size={40} className="text-red-400 mx-auto mb-2" />
                      <div className="text-sm text-text-muted">PDF Document</div>
                      {activeFile.meta?.pages && (
                        <div className="text-xs text-text-muted mt-1">{activeFile.meta.pages} pages</div>
                      )}
                    </div>
                  </div>
                )}

                {/* File details */}
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Original</span>
                    <span className="font-medium">{formatSize(activeFile.file.size)}</span>
                  </div>
                  {activeFile.compressed && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-text-muted">Compressed</span>
                        <span className="font-medium text-primary-400">
                          {formatSize(activeFile.compressed.size)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-muted">Reduction</span>
                        <span className="font-bold text-green-400">
                          {getReductionPercent(activeFile.file.size, activeFile.compressed.size)}%
                        </span>
                      </div>
                    </>
                  )}
                  {activeFile.meta?.originalWidth && (
                    <div className="flex justify-between">
                      <span className="text-text-muted">Dimensions</span>
                      <span className="font-medium">
                        {activeFile.meta.originalWidth}×{activeFile.meta.originalHeight}
                        {activeFile.meta.newWidth !== activeFile.meta.originalWidth && (
                          <span className="text-primary-400">
                            {' → '}
                            {activeFile.meta.newWidth}×{activeFile.meta.newHeight}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                  {activeFile.error && (
                    <div className="text-red-400 mt-2 p-2 bg-red-500/10 rounded-md">
                      {activeFile.error}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FileCompressor;
