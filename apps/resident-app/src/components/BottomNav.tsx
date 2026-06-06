import { Home, Megaphone } from 'lucide-react';
import type { Page } from '../types';

interface Props {
  current: Page;
  onNavigate: (page: Page) => void;
}

const tabs: { id: Page; label: string; Icon: typeof Home }[] = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'report', label: 'Report', Icon: Megaphone },
];

export default function BottomNav({ current, onNavigate }: Props) {
  return (
    <nav className="bottom-nav">
      {tabs.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={`bottom-nav-tab ${current === id ? 'active' : ''}`}
          onClick={() => onNavigate(id)}
          aria-current={current === id ? 'page' : undefined}
        >
          <Icon size={20} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
