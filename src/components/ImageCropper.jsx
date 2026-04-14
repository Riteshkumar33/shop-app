import { useState, useRef, useEffect, useCallback } from 'react';
import { HiOutlineX, HiOutlineCheck, HiOutlineRefresh } from 'react-icons/hi';

/**
 * ImageCropper — a modal crop tool for images.
 *
 * Props:
 *   imageSrc   — URL or data-URL of the image to crop
 *   onApply    — (croppedBlob: Blob, croppedUrl: string) => void
 *   onCancel   — () => void
 *   fileName   — original file name (for display)
 */
const ImageCropper = ({ imageSrc, onApply, onCancel, fileName }) => {
  const containerRef = useRef(null);
  const imgRef = useRef(null);

  // Natural image dimensions
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });
  // Displayed image dimensions & position inside container
  const [imgDisplay, setImgDisplay] = useState({ w: 0, h: 0, x: 0, y: 0 });

  // Crop rect in displayed coordinates (relative to image top-left)
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 });

  // Aspect ratio lock
  const [aspectRatio, setAspectRatio] = useState(null); // null = free

  // Drag state
  const dragRef = useRef(null);

  /* ── Image loaded ── */
  const onImgLoad = useCallback(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return;

    const natW = img.naturalWidth;
    const natH = img.naturalHeight;
    setImgNatural({ w: natW, h: natH });

    const containerW = container.clientWidth;
    const containerH = container.clientHeight;

    // Fit image inside container
    const scale = Math.min(containerW / natW, containerH / natH, 1);
    const dispW = Math.round(natW * scale);
    const dispH = Math.round(natH * scale);
    const dispX = Math.round((containerW - dispW) / 2);
    const dispY = Math.round((containerH - dispH) / 2);

    setImgDisplay({ w: dispW, h: dispH, x: dispX, y: dispY });

    // Initial crop: center 80%
    const cw = Math.round(dispW * 0.8);
    const ch = Math.round(dispH * 0.8);
    setCrop({
      x: Math.round((dispW - cw) / 2),
      y: Math.round((dispH - ch) / 2),
      w: cw,
      h: ch,
    });
  }, []);

  /* ── Clamp crop to image bounds ── */
  const clampCrop = useCallback((c) => {
    let { x, y, w, h } = c;
    w = Math.max(20, Math.min(w, imgDisplay.w));
    h = Math.max(20, Math.min(h, imgDisplay.h));
    x = Math.max(0, Math.min(x, imgDisplay.w - w));
    y = Math.max(0, Math.min(y, imgDisplay.h - h));
    return { x, y, w, h };
  }, [imgDisplay]);

  /* ── Mouse/touch handlers ── */
  const getEventPos = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left - imgDisplay.x,
      y: clientY - rect.top - imgDisplay.y,
    };
  };

  const handlePointerDown = (e, type) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = getEventPos(e);
    dragRef.current = { type, startPos: pos, startCrop: { ...crop } };

    const onMove = (ev) => {
      ev.preventDefault();
      if (!dragRef.current) return;
      const cur = getEventPos(ev);
      const dx = cur.x - dragRef.current.startPos.x;
      const dy = cur.y - dragRef.current.startPos.y;
      const sc = dragRef.current.startCrop;

      let newCrop;

      if (dragRef.current.type === 'move') {
        newCrop = clampCrop({ x: sc.x + dx, y: sc.y + dy, w: sc.w, h: sc.h });
      } else {
        // Resize handles
        const handle = dragRef.current.type;
        let nx = sc.x, ny = sc.y, nw = sc.w, nh = sc.h;

        if (handle.includes('w')) { nx = sc.x + dx; nw = sc.w - dx; }
        if (handle.includes('e')) { nw = sc.w + dx; }
        if (handle.includes('n')) { ny = sc.y + dy; nh = sc.h - dy; }
        if (handle.includes('s')) { nh = sc.h + dy; }

        // Enforce aspect ratio
        if (aspectRatio && nw > 20 && nh > 20) {
          if (handle.includes('e') || handle.includes('w')) {
            nh = Math.round(nw / aspectRatio);
          } else {
            nw = Math.round(nh * aspectRatio);
          }
        }

        newCrop = clampCrop({ x: nx, y: ny, w: nw, h: nh });
      }

      setCrop(newCrop);
    };

    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };

    window.addEventListener('mousemove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  };

  /* ── Apply crop ── */
  const handleApply = () => {
    if (!imgRef.current || !imgDisplay.w) return;

    // Convert display coords to natural coords
    const scaleX = imgNatural.w / imgDisplay.w;
    const scaleY = imgNatural.h / imgDisplay.h;
    const sx = Math.round(crop.x * scaleX);
    const sy = Math.round(crop.y * scaleY);
    const sw = Math.round(crop.w * scaleX);
    const sh = Math.round(crop.h * scaleY);

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, sw, sh);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          onApply(blob, url);
        }
      },
      'image/jpeg',
      0.92
    );
  };

  /* ── Reset crop to full ── */
  const resetCrop = () => {
    setCrop({ x: 0, y: 0, w: imgDisplay.w, h: imgDisplay.h });
  };

  /* ── Set aspect ratio ── */
  const setAR = (ratio) => {
    setAspectRatio(ratio);
    if (ratio) {
      // Adjust current crop to match ratio
      let nw = crop.w;
      let nh = Math.round(nw / ratio);
      if (nh > imgDisplay.h) {
        nh = imgDisplay.h;
        nw = Math.round(nh * ratio);
      }
      setCrop(clampCrop({
        x: Math.round((imgDisplay.w - nw) / 2),
        y: Math.round((imgDisplay.h - nh) / 2),
        w: nw,
        h: nh,
      }));
    }
  };

  const aspectRatios = [
    { label: 'Free', value: null },
    { label: '1:1', value: 1 },
    { label: '4:3', value: 4 / 3 },
    { label: '3:2', value: 3 / 2 },
    { label: '16:9', value: 16 / 9 },
    { label: '9:16', value: 9 / 16 },
  ];

  // Crop dimensions in natural pixels
  const scaleX = imgNatural.w && imgDisplay.w ? imgNatural.w / imgDisplay.w : 1;
  const scaleY = imgNatural.h && imgDisplay.h ? imgNatural.h / imgDisplay.h : 1;
  const cropNatW = Math.round(crop.w * scaleX);
  const cropNatH = Math.round(crop.h * scaleY);

  const handleStyle = (cursor) => ({
    position: 'absolute',
    width: 14,
    height: 14,
    background: '#fff',
    border: '2px solid #6366f1',
    borderRadius: 3,
    cursor,
    zIndex: 10,
    touchAction: 'none',
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="bg-bg-card border border-border-color rounded-2xl shadow-2xl w-[95vw] max-w-[800px] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-color">
          <div>
            <h3 className="text-lg font-semibold">Crop Image</h3>
            <p className="text-xs text-text-muted mt-0.5">
              {fileName && <span className="mr-2">{fileName}</span>}
              {cropNatW > 0 && <span>{cropNatW} × {cropNatH} px</span>}
            </p>
          </div>
          <button onClick={onCancel} className="btn btn--ghost btn--icon btn--sm">
            <HiOutlineX size={18} />
          </button>
        </div>

        {/* Aspect ratio bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-color bg-bg-glass/50">
          <span className="text-xs text-text-muted mr-1">Ratio:</span>
          {aspectRatios.map((ar) => (
            <button
              key={ar.label}
              onClick={() => setAR(ar.value)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-all ${
                aspectRatio === ar.value
                  ? 'border-primary-400 bg-primary-500/15 text-primary-400'
                  : 'border-border-color bg-bg-glass text-text-secondary hover:border-primary-400/50'
              }`}
            >
              {ar.label}
            </button>
          ))}
          <button onClick={resetCrop} className="ml-auto px-2.5 py-1 text-[11px] font-medium rounded-md border border-border-color bg-bg-glass text-text-secondary hover:text-text-primary transition-all" title="Reset">
            <HiOutlineRefresh size={12} className="inline mr-1" />Reset
          </button>
        </div>

        {/* Crop area */}
        <div
          ref={containerRef}
          className="relative flex-1 min-h-[300px] max-h-[55vh] mx-4 my-3 bg-black/30 rounded-lg overflow-hidden select-none"
          style={{ touchAction: 'none' }}
        >
          {/* The image */}
          <img
            ref={imgRef}
            src={imageSrc}
            alt="crop"
            onLoad={onImgLoad}
            draggable={false}
            style={{
              position: 'absolute',
              left: imgDisplay.x,
              top: imgDisplay.y,
              width: imgDisplay.w || 'auto',
              height: imgDisplay.h || 'auto',
              objectFit: 'contain',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          />

          {/* Dark overlay around crop area */}
          {imgDisplay.w > 0 && (
            <>
              {/* Top */}
              <div style={{ position: 'absolute', left: imgDisplay.x, top: imgDisplay.y, width: imgDisplay.w, height: crop.y, background: 'rgba(0,0,0,0.55)' }} />
              {/* Bottom */}
              <div style={{ position: 'absolute', left: imgDisplay.x, top: imgDisplay.y + crop.y + crop.h, width: imgDisplay.w, height: imgDisplay.h - crop.y - crop.h, background: 'rgba(0,0,0,0.55)' }} />
              {/* Left */}
              <div style={{ position: 'absolute', left: imgDisplay.x, top: imgDisplay.y + crop.y, width: crop.x, height: crop.h, background: 'rgba(0,0,0,0.55)' }} />
              {/* Right */}
              <div style={{ position: 'absolute', left: imgDisplay.x + crop.x + crop.w, top: imgDisplay.y + crop.y, width: imgDisplay.w - crop.x - crop.w, height: crop.h, background: 'rgba(0,0,0,0.55)' }} />
            </>
          )}

          {/* Crop rectangle + handles */}
          {imgDisplay.w > 0 && (
            <div
              style={{
                position: 'absolute',
                left: imgDisplay.x + crop.x,
                top: imgDisplay.y + crop.y,
                width: crop.w,
                height: crop.h,
                border: '2px solid #6366f1',
                boxShadow: '0 0 0 1px rgba(99,102,241,0.3)',
                cursor: 'move',
                touchAction: 'none',
              }}
              onMouseDown={(e) => handlePointerDown(e, 'move')}
              onTouchStart={(e) => handlePointerDown(e, 'move')}
            >
              {/* Grid lines (rule of thirds) */}
              <div style={{ position: 'absolute', left: '33.3%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.25)' }} />
              <div style={{ position: 'absolute', left: '66.6%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.25)' }} />
              <div style={{ position: 'absolute', top: '33.3%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.25)' }} />
              <div style={{ position: 'absolute', top: '66.6%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.25)' }} />

              {/* Corner handles */}
              <div style={{ ...handleStyle('nw-resize'), left: -7, top: -7 }} onMouseDown={(e) => handlePointerDown(e, 'nw')} onTouchStart={(e) => handlePointerDown(e, 'nw')} />
              <div style={{ ...handleStyle('ne-resize'), right: -7, top: -7 }} onMouseDown={(e) => handlePointerDown(e, 'ne')} onTouchStart={(e) => handlePointerDown(e, 'ne')} />
              <div style={{ ...handleStyle('sw-resize'), left: -7, bottom: -7 }} onMouseDown={(e) => handlePointerDown(e, 'sw')} onTouchStart={(e) => handlePointerDown(e, 'sw')} />
              <div style={{ ...handleStyle('se-resize'), right: -7, bottom: -7 }} onMouseDown={(e) => handlePointerDown(e, 'se')} onTouchStart={(e) => handlePointerDown(e, 'se')} />

              {/* Edge handles */}
              <div style={{ ...handleStyle('n-resize'), left: '50%', marginLeft: -7, top: -7 }} onMouseDown={(e) => handlePointerDown(e, 'n')} onTouchStart={(e) => handlePointerDown(e, 'n')} />
              <div style={{ ...handleStyle('s-resize'), left: '50%', marginLeft: -7, bottom: -7 }} onMouseDown={(e) => handlePointerDown(e, 's')} onTouchStart={(e) => handlePointerDown(e, 's')} />
              <div style={{ ...handleStyle('w-resize'), top: '50%', marginTop: -7, left: -7 }} onMouseDown={(e) => handlePointerDown(e, 'w')} onTouchStart={(e) => handlePointerDown(e, 'w')} />
              <div style={{ ...handleStyle('e-resize'), top: '50%', marginTop: -7, right: -7 }} onMouseDown={(e) => handlePointerDown(e, 'e')} onTouchStart={(e) => handlePointerDown(e, 'e')} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-border-color">
          <button onClick={onCancel} className="btn btn--secondary btn--sm">
            Cancel
          </button>
          <button onClick={handleApply} className="btn btn--primary btn--sm">
            <HiOutlineCheck size={14} /> Apply Crop
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageCropper;
