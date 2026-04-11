import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { HiOutlineMenu, HiOutlineLogout, HiOutlineChatAlt2, HiOutlineDownload } from 'react-icons/hi';


const Navbar = ({ onToggleSidebar }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    setDeferredPrompt(null);
  };


  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 h-16 bg-bg-card/80 backdrop-blur-xl border-b border-border-color z-50 flex items-center justify-between px-4 lg:px-6" id="main-navbar">
      <div className="flex items-center gap-4">
        <button className="btn btn--ghost btn--icon" onClick={onToggleSidebar} id="sidebar-toggle">
          <HiOutlineMenu size={22} />
        </button>
        <Link to="/dashboard" className="flex items-center gap-2 font-bold text-xl">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-primary shadow-[0_0_15px_rgba(99,102,241,0.3)]">🏪</div>
          <span className="text-gradient">ShopFlow</span>
        </Link>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        {deferredPrompt && (
          <button 
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors shadow-sm" 
            onClick={handleInstallClick} 
            title="Install App"
          >
            <HiOutlineDownload size={18} />
            <span className="hidden sm:inline">Install App</span>
          </button>
        )}
        <Link to="/chat" className="btn btn--ghost btn--icon" title="Messages">
          <HiOutlineChatAlt2 size={20} />
        </Link>
        <div className="flex items-center gap-3 py-1 px-2 md:pr-4 rounded-full hover:bg-white/5 transition-colors cursor-pointer">
          <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center text-sm font-bold text-primary-400 overflow-hidden ring-2 ring-primary-500/30">
            {user?.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              getInitials(user?.name)
            )}
          </div>
          <div className="hidden sm:flex flex-col items-start">
            <span className="text-sm font-semibold">{user?.name || 'User'}</span>
            <span className={`badge badge--${user?.role}`}>{user?.role}</span>
          </div>
        </div>
        <button className="btn btn--ghost btn--icon" onClick={logout} title="Logout" id="logout-btn">
          <HiOutlineLogout size={20} />
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
