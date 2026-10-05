import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import {
  Palette, Store, BadgeCheck, UserCog, Wrench, DollarSign, Percent, TrendingUp, Receipt, Hash, Printer, ToggleRight,
  PanelsTopLeft, CalendarClock, History, Database, KeyRound, Archive, ShieldCheck,
} from 'lucide-react'
import { ShopDetails, Licenses, StaffPage } from './ShopSettings'
import { LaborRates, TaxRates, Markups, ShopFees } from './FinancialSettings'
import { Numbering, Printing, DocumentOptions, HeaderFooter, EstimateSettings } from './DocumentSettings'
import { Appearance, DataSettings, AuditLog, ChangePassword } from './GeneralSettings'
import { BackupSettings } from './BackupSettings'
import { MfaSettings } from './MfaSettings'

// Adding a settings page = one entry here + its component.
export const SETTINGS_NAV = [
  { group: 'Shop', items: [
    { path: 'shop/details', label: 'Shop Details', icon: Store, el: <ShopDetails /> },
    { path: 'shop/licenses', label: 'Licenses & Certifications', icon: BadgeCheck, el: <Licenses /> },
    { path: 'shop/service-writers', label: 'Service Writers', icon: UserCog, el: <StaffPage kind="writers" /> },
    { path: 'shop/technicians', label: 'Technicians', icon: Wrench, el: <StaffPage kind="technicians" /> },
  ] },
  { group: 'Financial', items: [
    { path: 'financial/labor', label: 'Labor Rates', icon: DollarSign, el: <LaborRates /> },
    { path: 'financial/taxes', label: 'Tax Rates', icon: Percent, el: <TaxRates /> },
    { path: 'financial/markups', label: 'Markups & Display', icon: TrendingUp, el: <Markups /> },
    { path: 'financial/fees', label: 'Shop Fees', icon: Receipt, el: <ShopFees /> },
  ] },
  { group: 'Documents', items: [
    { path: 'documents/numbering', label: 'Numbering & Units', icon: Hash, el: <Numbering /> },
    { path: 'documents/printing', label: 'Printing & Logo', icon: Printer, el: <Printing /> },
    { path: 'documents/options', label: 'Document Options', icon: ToggleRight, el: <DocumentOptions /> },
    { path: 'documents/header-footer', label: 'Header & Footer', icon: PanelsTopLeft, el: <HeaderFooter /> },
    { path: 'documents/estimates', label: 'Estimate Settings', icon: CalendarClock, el: <EstimateSettings /> },
  ] },
  { group: 'General', items: [
    { path: 'general/appearance', label: 'Appearance', icon: Palette, el: <Appearance /> },
    { path: 'general/password', label: 'Change Password', icon: KeyRound, el: <ChangePassword /> },
    { path: 'general/mfa', label: 'Two-factor (MFA)', icon: ShieldCheck, el: <MfaSettings /> },
    { path: 'general/backup', label: 'Backup & Restore', icon: Archive, el: <BackupSettings /> },
    { path: 'general/audit', label: 'Audit Log', icon: History, el: <AuditLog /> },
    { path: 'general/data', label: 'Local Data', icon: Database, el: <DataSettings /> },
  ] },
]

export default function SettingsLayout() {
  return (
    <div className="page full">
      <div className="settings-shell">
        <nav className="settings-nav card" aria-label="Settings sections">
          {SETTINGS_NAV.map((g) => (
            <div key={g.group} role="group" aria-label={g.group}>
              <div className="settings-nav-group">{g.group}</div>
              {g.items.map((i) => (
                <NavLink key={i.path} to={`/settings/${i.path}`} className={({ isActive }) => `settings-link${isActive ? ' active' : ''}`}>
                  <i.icon size={16} aria-hidden="true" /><span>{i.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="settings-main">
          <Routes>
            <Route index element={<Navigate to="shop/details" replace />} />
            {SETTINGS_NAV.flatMap((g) => g.items).map((i) => <Route key={i.path} path={i.path} element={i.el} />)}
            <Route path="*" element={<Navigate to="shop/details" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  )
}
