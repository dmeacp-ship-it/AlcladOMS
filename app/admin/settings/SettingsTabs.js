'use client'
import { useState } from 'react'

export default function SettingsTabs({ tabs, defaultTab = 'company' }) {
  const [activeTab, setActiveTab] = useState(defaultTab)

  return (
    <div className="settings-tabs-wrapper">
      <nav className="settings-tab-nav" aria-label="Settings categories">
        {tabs.map((t) => {
          const isActive = activeTab === t.id
          return (
            <button
              key={t.id}
              type="button"
              className={`settings-tab-btn${isActive ? ' active' : ''}`}
              onClick={() => setActiveTab(t.id)}
              aria-selected={isActive}
              role="tab"
            >
              <i className={`ph ${t.icon}`} />
              <span>{t.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="settings-panels" style={{ padding: '24px 24px' }}>
        {tabs.map((t) => (
          <div
            key={t.id}
            role="tabpanel"
            style={{ display: activeTab === t.id ? 'block' : 'none' }}
          >
            {t.description && (
              <div style={{ marginBottom: '20px' }}>
                <p className="muted text-sm m-0">
                  {t.description}
                </p>
              </div>
            )}
            {t.content}
          </div>
        ))}
      </div>
    </div>
  )
}
