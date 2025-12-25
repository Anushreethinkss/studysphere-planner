import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Calendar, BarChart3, RefreshCw, User } from 'lucide-react';

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { path: '/plan', icon: Home, label: 'Home' },
    { path: '/revision', icon: RefreshCw, label: 'Revision' },
    { path: '/progress', icon: BarChart3, label: 'Progress' },
    { path: '/calendar', icon: Calendar, label: 'Calendar' },
    { path: '/profile', icon: User, label: 'Profile' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-lg border-t border-border px-4 pb-safe z-40">
      <div className="flex items-center justify-around py-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all duration-300 ${
                isActive 
                  ? 'text-accent bg-accent/10' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'animate-bounce-in' : ''}`} />
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
