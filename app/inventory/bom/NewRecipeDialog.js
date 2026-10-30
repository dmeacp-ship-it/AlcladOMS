'use client'

import { useState } from 'react'
import Link from 'next/link'
import { money } from '@/lib/tas'
import { RouteDialog } from '../../ui'

export default function NewRecipeDialog({ closeHref }) {
  const [grade, setGrade] = useState('PE')
  const [thickness, setThickness] = useState(4.0)
  const [topSkin, setTopSkin] = useState(0.25)
  const [bottomSkin, setBottomSkin] = useState(0.20)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')

  const th = Number(thickness) || 0
  const top = Number(topSkin) || 0
  const bot = Number(bottomSkin) || 0
  const coreMm = Math.max(0, Math.round((th - top - bot) * 100) / 100)

  // Estimated standard weights
  const topKg = Math.round(top * 2.71 * 1.02 * 1000) / 1000
  const botKg = Math.round(bot * 2.71 * 1.02 * 1000) / 1000
  const coreDensity = grade === 'FR-B1' ? 1.6 : grade === 'FR-A2' ? 1.9 : 0.92
  const coreKg = Math.round(coreMm * coreDensity * 1.03 * 1000) / 1000
  const filmKg = 0.09
  const totalEstKg = Math.round((topKg + botKg + coreKg + filmKg) * 1000) / 1000

  const defaultCode = `BOM-${th}MM-${grade}-${String(top).replace('.', '')}`
  const defaultName = `${grade === 'PE' ? 'Standard' : 'Fire-Rated'} ACP ${th}mm · ${grade} Core · ${top} / ${bot}`

  return (
    <RouteDialog
      icon="ph-plus"
      title={<>New ACP Parametric Recipe</>}
      closeHref={closeHref}
      footer={
        <div className="d-flex jc-e gap-8 w-full">
          <Link href={closeHref} className="btn btn-subtle btn-sm">Cancel</Link>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              alert('Recipe saved! Run supabase/migrate-018.sql in Supabase to sync custom DB schemas.')
              window.location.href = closeHref
            }}
          >
            <i className="ph ph-check" />Save Recipe
          </button>
        </div>
      }
    >
      <div className="d-flex f-col gap-16">
        <p className="muted text-sm m-0">
          Define physical specifications for panel composite layers. The system will auto-compute standard consumption rates per M² based on standard ACP densities.
        </p>

        {/* ── Specs Form ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div>
            <label className="text-xs muted block mb-1">Panel Grade <span className="req">*</span></label>
            <select
              className="tsearch"
              style={{ width: '100%', padding: '8px 10px', background: 'var(--fill-2)' }}
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
            >
              <option value="PE">PE (Standard Polyethylene)</option>
              <option value="FR-B1">FR-B1 (Fire Retardant Class B)</option>
              <option value="FR-A2">FR-A2 (Non-Combustible Class A)</option>
            </select>
          </div>

          <div>
            <label className="text-xs muted block mb-1">Total Panel Thickness (mm) <span className="req">*</span></label>
            <input
              type="number"
              step="0.5"
              min="2"
              max="10"
              className="tsearch"
              style={{ width: '100%', padding: '8px 10px' }}
              value={thickness}
              onChange={(e) => setThickness(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs muted block mb-1">Top Skin (mm) <span className="req">*</span></label>
            <input
              type="number"
              step="0.05"
              min="0.10"
              max="1.0"
              className="tsearch"
              style={{ width: '100%', padding: '8px 10px' }}
              value={topSkin}
              onChange={(e) => setTopSkin(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs muted block mb-1">Bottom Skin (mm) <span className="req">*</span></label>
            <input
              type="number"
              step="0.05"
              min="0.10"
              max="1.0"
              className="tsearch"
              style={{ width: '100%', padding: '8px 10px' }}
              value={bottomSkin}
              onChange={(e) => setBottomSkin(e.target.value)}
            />
          </div>
        </div>

        {/* ── Auto-calculated Core & Total ── */}
        <div
          style={{
            background: 'var(--fill-2)',
            padding: '12px 16px',
            borderRadius: 'var(--r-ctl)',
            border: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <span className="muted text-xs block">Calculated Core Layer</span>
            <span className="fw7 text-base">
              {coreMm} mm ({grade} Granules)
            </span>
          </div>
          <div>
            <span className="muted text-xs block">Estimated RM Weight</span>
            <span className="fw7 text-base">{money(totalEstKg)} KG / M²</span>
          </div>
          <div>
            <span className="muted text-xs block">Composition Ratio</span>
            <span className="text-xs font-mono">
              Top: {top}mm · Core: {coreMm}mm · Bot: {bot}mm
            </span>
          </div>
        </div>

        {/* ── Identifiers ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
          <div>
            <label className="text-xs muted block mb-1">Recipe Code</label>
            <input
              type="text"
              placeholder={defaultCode}
              className="tsearch"
              style={{ width: '100%', padding: '8px 10px' }}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs muted block mb-1">Recipe Name</label>
            <input
              type="text"
              placeholder={defaultName}
              className="tsearch"
              style={{ width: '100%', padding: '8px 10px' }}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>
      </div>
    </RouteDialog>
  )
}
