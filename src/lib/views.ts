import {
  Map as MapIcon,
  ClipboardCheck,
  Settings,
  UserCircle2,
  LogOut,
  type LucideIcon,
} from 'lucide-react';

export type ViewKey =
  | 'risk-monitor'
  | 'inspected-log'
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
  { key: 'settings',      label: 'Settings',      icon: Settings,        group: 'system' },
  { key: 'account',       label: 'Account',       icon: UserCircle2,     group: 'system' },
  { key: 'logout',        label: 'Logout',        icon: LogOut,          group: 'system' },
];
