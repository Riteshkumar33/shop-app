import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div>
      <Navbar onToggleSidebar={() => setSidebarOpen(prev => !prev)} />
      <div className="flex min-h-screen pt-16">
        <Sidebar isOpen={sidebarOpen} />
        <main className={`flex-1 p-4 md:p-8 transition-[margin] duration-300 ${!sidebarOpen ? 'ml-0' : 'md:ml-[260px]'}`}>
          <div className="animate-[fadeInUp_400ms_ease]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
