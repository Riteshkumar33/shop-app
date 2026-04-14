import { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  const sidebarRef = useRef(null);
  const location = useLocation();

  const handleToggleSidebar = () => {
    setSidebarOpen(prev => !prev);
  };

  const handleClickOutside = (event) => {
    if (!sidebarRef.current) return;

    const clickedInsideSidebar = sidebarRef.current.contains(event.target);
    const clickedToggle = event.target.closest('#sidebar-toggle');

    if (!clickedInsideSidebar && !clickedToggle) {
      setSidebarOpen(false);
    }
  };

  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, [location]);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-bg-main">
      <Navbar onToggleSidebar={handleToggleSidebar} />
      <div ref={sidebarRef}>
        <Sidebar isOpen={sidebarOpen} />
      </div>
      
      {/* Overlay for mobile */}
      {sidebarOpen && window.innerWidth < 768 && (
        <div
          className="fixed inset-0 bg-black/30 z-30"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      <main className={`flex-1 p-4 pt-20 md:p-20 transition-all duration-300 ease-in-out pt -24 ${sidebarOpen ? 'md:ml-64' : 'ml-0'}`}>
        <div className="animate-[fadeInUp_400ms_ease]">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;

