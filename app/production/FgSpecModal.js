'use client'
import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { closeAnimated } from '../ui'
import { getOrCreateFgItem } from './actions'

export default function FgSpecModal({ open, onClose, onSelect, options = {} }) {
  const dialogRef = useRef(null)
  const uid = useId()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState(null)

  // Master options matching Quotation Form
  const brands = options.brand?.length ? options.brand : ['ALCLAD', 'ALUMAX']
  const grades = options.grade?.length ? options.grade : ['AL4025', 'AL4035', 'AL4045', 'AL4050']
  const cores = options.core?.length ? options.core : ['FRA2', 'FRB1', 'NFR']
  const skins = options.skin?.length ? options.skin : ['0.2', '0.3', '0.4', '0.5']
  const widths = options.width?.length ? options.width : ['1250', '1500']
  const lengths = options.length?.length
    ? options.length
    : ['1700', '2000', '2450', '2500', '2800', '3000', '3200', '3600', '3660', '3700', '3800', '3850', '3900', '4000', '4500', '4660', '4800', '5000', '5200', '5600', '5800', '6000', '6700']
  const thicknesses = options.thickness?.length ? options.thickness : ['2', '3', '4', '5', '6']
  const colors = options.color || {}
  const colorList = Object.entries(colors)

  const [brand, setBrand] = useState(brands[0] || 'ALCLAD')
  const [colorCode, setColorCode] = useState(colorList[0]?.[0] || '')
  const [grade, setGrade] = useState(grades[0] || '')
  const [core, setCore] = useState(cores[0] || '')
  const [skin, setSkin] = useState(skins[0] || '')
  const [width, setWidth] = useState(widths[0] || '')
  const [length, setLength] = useState(lengths[0] || '')
  const [thickness, setThickness] = useState(thicknesses[0] || '')

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open) {
      setError(null)
      if (!d.open) d.showModal()
    } else if (d.open) {
      closeAnimated(d)
    }
  }, [open])

  // Color name & live preview
  const colorName = colors[colorCode] || ''
  const specSkin = skin ? `${Number(skin)}` : ''
  const specDim = width && length && thickness ? `-${width}*${length}*${thickness}MM` : ''
  const codePreview = [brand, grade, colorCode, core, specSkin].filter(Boolean).join('-') + specDim
  const m2Preview = width && length ? ((Number(width) * Number(length)) / 1000000).toFixed(4) : null

  const handleClose = () => {
    closeAnimated(dialogRef.current, onClose)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!brand) {
      setError('Please select a Brand.')
      return
    }
    if (!width || !(Number(width) > 0)) {
      setError('Please select a Width.')
      return
    }
    if (!length || !(Number(length) > 0)) {
      setError('Please select a Length.')
      return
    }
    if (!thickness || !(Number(thickness) > 0)) {
      setError('Please select a Thickness.')
      return
    }

    setError(null)
    startTransition(async () => {
      const res = await getOrCreateFgItem({
        brand,
        grade,
        color_code: colorCode,
        color_name: colorName,
        core,
        skin: skin ? Number(skin) : null,
        width: Number(width),
        length: Number(length),
        thickness: Number(thickness),
      })

      if (res?.error) {
        setError(res.error)
      } else if (res?.item) {
        onSelect(res.item)
        handleClose()
      }
    })
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal medium"
      aria-label="Select Panel Specification"
      onCancel={(e) => {
        e.preventDefault()
        handleClose()
      }}
      onMouseDown={(e) => {
        if (e.target === dialogRef.current) handleClose()
      }}
    >
      <div className="modal-header">
        <div className="modal-ttl">
          <i className="ph ph-sliders-horizontal" />
          <span className="modal-ttl-txt">Select Panel Specification</span>
          <button type="button" className="btn-link x" onClick={handleClose} aria-label="Close">
            <i className="ph ph-x" />
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="modal-body">
          {error && (
            <div className="banner error shake">
              <i className="ph ph-warning-circle" />
              <span>{error}</span>
            </div>
          )}

          {/* Row 1: Brand, Color code, Grade, Core */}
          <div className="fgrid-4">
            <div className="fg">
              <label htmlFor={`${uid}-brand`}>Brand <span className="req">*</span></label>
              <select
                id={`${uid}-brand`}
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                required
              >
                {brands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            <div className="fg">
              <label htmlFor={`${uid}-color`}>Color code <span className="req">*</span></label>
              <select
                id={`${uid}-color`}
                value={colorCode}
                onChange={(e) => setColorCode(e.target.value)}
                required
              >
                {colorList.map(([code, name]) => (
                  <option key={code} value={code}>
                    {code} · {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="fg">
              <label htmlFor={`${uid}-grade`}>Grade</label>
              <select
                id={`${uid}-grade`}
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
              >
                {grades.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            <div className="fg">
              <label htmlFor={`${uid}-core`}>Core</label>
              <select
                id={`${uid}-core`}
                value={core}
                onChange={(e) => setCore(e.target.value)}
              >
                {cores.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Al skin, Width, Length, Thickness */}
          <div className="fgrid-4" style={{ marginTop: 8 }}>
            <div className="fg">
              <label htmlFor={`${uid}-skin`}>Al skin</label>
              <select
                id={`${uid}-skin`}
                value={skin}
                onChange={(e) => setSkin(e.target.value)}
              >
                {skins.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="fg">
              <label htmlFor={`${uid}-width`}>Width <span className="req">*</span></label>
              <select
                id={`${uid}-width`}
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                required
              >
                {widths.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>

            <div className="fg">
              <label htmlFor={`${uid}-length`}>Length <span className="req">*</span></label>
              <select
                id={`${uid}-length`}
                value={length}
                onChange={(e) => setLength(e.target.value)}
                required
              >
                {lengths.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            <div className="fg">
              <label htmlFor={`${uid}-thickness`}>Thickness <span className="req">*</span></label>
              <select
                id={`${uid}-thickness`}
                value={thickness}
                onChange={(e) => setThickness(e.target.value)}
                required
              >
                {thicknesses.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Live Preview Strip */}
          <div className="cust-meta-strip" style={{ marginTop: 16 }}>
            <div className="cust-meta-item">
              <span className="lbl">Preview SKU:</span>
              <span className="val badge b-blue">{codePreview || '—'}</span>
            </div>
            {colorName && (
              <div className="cust-meta-item">
                <span className="lbl">Color:</span>
                <span className="val">{colorName}</span>
              </div>
            )}
            {m2Preview && (
              <div className="cust-meta-item">
                <span className="lbl">Area:</span>
                <span className="val fw6">{m2Preview} M² / pc</span>
              </div>
            )}
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={handleClose} disabled={pending}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={pending || !brand || !width || !length || !thickness}
          >
            {pending ? <span className="spin" /> : <i className="ph ph-check" />}
            {pending ? 'Adding…' : 'Add to Production'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
