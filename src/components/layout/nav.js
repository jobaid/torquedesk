import {
  LayoutDashboard, Car, Search, Wrench, Stethoscope, ScanLine, Zap, CalendarCheck, ClipboardList,
  Megaphone, Cpu, Star, History, FileText, Users, Settings, UserRound, BarChart3, ClipboardCheck,
} from 'lucide-react'

// `feature` is the key the SaaS owner can toggle in Owner Portal → Company →
// Feature access. Missing feature = always shown.
export const NAV = [
  {
    label: 'Workspace',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, feature: 'dashboard' },
      { to: '/vehicle', label: 'Vehicle', icon: Car, feature: 'vehicles' },
      { to: '/search', label: 'Search', icon: Search },
    ],
  },
  {
    label: 'Repair Info',
    items: [
      { to: '/repair', label: 'Repair Information', icon: Wrench, feature: 'repair_info' },
      { to: '/diagnostics', label: 'Diagnostics', icon: Stethoscope, feature: 'diagnostics' },
      { to: '/dtc', label: 'DTC', icon: ScanLine, feature: 'dtc' },
      { to: '/wiring', label: 'Wiring Diagrams', icon: Zap, feature: 'wiring' },
      { to: '/maintenance', label: 'Maintenance', icon: CalendarCheck, feature: 'maintenance' },
      { to: '/specifications', label: 'Specifications', icon: ClipboardList, feature: 'repair_info' },
      { to: '/bulletins', label: 'Technical Bulletins', icon: Megaphone, feature: 'bulletins' },
      { to: '/components', label: 'Components', icon: Cpu, feature: 'repair_info' },
    ],
  },
  {
    label: 'Shop',
    items: [
      { to: '/orders', label: 'Repair Orders', icon: FileText, countKey: 'openOrders', feature: 'orders' },
      { to: '/customers', label: 'Customers', icon: Users, feature: 'customers' },
      { to: '/inspections', label: 'Inspections', icon: ClipboardCheck, feature: 'inspections' },
      { to: '/reports', label: 'Reports', icon: BarChart3, feature: 'reports' },
    ],
  },
  {
    label: 'Library',
    items: [
      { to: '/favorites', label: 'Favorites', icon: Star, countKey: 'favorites' },
      { to: '/history', label: 'Search History', icon: History },
    ],
  },
]

export const FOOT_NAV = [
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/profile', label: 'Profile', icon: UserRound },
]

// Page titles + breadcrumbs keyed by first path segment
export const PAGE_META = {
  '': { title: 'Dashboard' },
  vehicle: { title: 'Vehicle' },
  search: { title: 'Search' },
  repair: { title: 'Repair Information', crumb: 'Repair Info' },
  diagnostics: { title: 'Diagnostics', crumb: 'Repair Info' },
  dtc: { title: 'Diagnostic Trouble Codes', crumb: 'Repair Info' },
  wiring: { title: 'Wiring Diagrams', crumb: 'Repair Info' },
  maintenance: { title: 'Maintenance', crumb: 'Repair Info' },
  specifications: { title: 'Specifications', crumb: 'Repair Info' },
  bulletins: { title: 'Technical Bulletins', crumb: 'Repair Info' },
  components: { title: 'Components', crumb: 'Repair Info' },
  orders: { title: 'Repair Orders', crumb: 'Shop' },
  customers: { title: 'Customers', crumb: 'Shop' },
  inspections: { title: 'Vehicle Inspections', crumb: 'Shop' },
  favorites: { title: 'Favorites', crumb: 'Library' },
  history: { title: 'Search History', crumb: 'Library' },
  reports: { title: 'Reports', crumb: 'Shop' },
  settings: { title: 'Settings' },
  profile: { title: 'Profile' },
}
