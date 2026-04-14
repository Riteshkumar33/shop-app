import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  HiOutlineViewGrid,
  HiOutlineDocumentText,
  HiOutlinePlusCircle,
  HiOutlineChatAlt2,
  HiOutlineClock,
  HiOutlineUserGroup,
  HiOutlineAdjustments,
} from 'react-icons/hi';

const Sidebar = ({ isOpen }) => {
  const { user } = useAuth();

  const customerLinks = [
    { to: '/dashboard', icon: <HiOutlineViewGrid />, label: 'Dashboard' },
    { to: '/forms/new', icon: <HiOutlinePlusCircle />, label: 'New Application' },
    { to: '/forms', icon: <HiOutlineDocumentText />, label: 'My Forms' },
    { to: '/chat', icon: <HiOutlineChatAlt2 />, label: 'Messages' },
    { to: '/tools/compress', icon: <HiOutlineAdjustments />, label: 'File Compressor' },
  ];

  const shopkeeperLinks = [
    { to: '/dashboard', icon: <HiOutlineViewGrid />, label: 'Dashboard' },
    { to: '/forms', icon: <HiOutlineDocumentText />, label: 'Forms Queue' },
    { to: '/chat', icon: <HiOutlineChatAlt2 />, label: 'Messages' },
    { to: '/tools/compress', icon: <HiOutlineAdjustments />, label: 'File Compressor' },
  ];

  const links = user?.role === 'shopkeeper' ? shopkeeperLinks : customerLinks;

  return (
    <aside
      className={`fixed top-0 left-0 h-screen bg-bg-secondary border-r border-border-color transition-transform duration-300 ease-in-out z-40 overflow-hidden
        ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full w-0'}
        ${isOpen ? 'md:w-64' : 'md:w-0'}`}
      id="main-sidebar"
    >
      <div className="p-4 pt-20 w-64">
        <div className="sidebar__section">
          <div className="sidebar__section-title">Navigation</div>
          {links.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
              }
              end={link.to === '/dashboard'}
            >
              <span className="sidebar__link-icon">{link.icon}</span>
              <span className="truncate">{link.label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
