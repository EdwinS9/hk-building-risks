import {
  Map as MapIcon,
  ClipboardCheck,
  CalendarClock,
  Settings,
  UserCircle2,
  Database,
  LogOut,
  type LucideIcon,
} from 'lucide-react';

export type ViewKey =
  | 'risk-monitor'
  | 'inspected-log'
  | 'schedule'
  | 'data'
  | 'settings'
  | 'account'
  | 'logout';

export interface ViewDef {
  key: ViewKey;
  label: string;
  icon: LucideIcon;
  group: 'main' | 'system';
  comingSoon?: boolean;
}

export const VIEWS: ViewDef[] = [
  { key: 'risk-monitor',  label: 'Risk Monitor',  icon: MapIcon,         group: 'main' },
  { key: 'inspected-log', label: 'Inspected Log', icon: ClipboardCheck,  group: 'main' },
  { key: 'schedule',      label: 'Schedule',      icon: CalendarClock,   group: 'main' },
  { key: 'data',          label: 'Data',          icon: Database,        group: 'main' },
  { key: 'settings',      label: 'Settings',      icon: Settings,        group: 'system' },
  { key: 'account',       label: 'Account',       icon: UserCircle2,     group: 'system', comingSoon: true },
  { key: 'logout',        label: 'Logout',        icon: LogOut,          group: 'system' },
];
