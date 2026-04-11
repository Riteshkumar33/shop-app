import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  HiOutlineViewGrid,
  HiOutlineDocumentText,
  HiOutlinePlusCircle,
  HiOutlineChatAlt2,
  HiOutlineClock,
  HiOutlineUserGroup,
} from 'react-icons/hi';

const Sidebar = ({ isOpen }) => {
  const { user } = useAuth();

  const customerLinks = [
    { to: '/dashboard', icon: <HiOutlineViewGrid />, label: 'Dashboard' },
    { to: '/forms/new', icon: <HiOutlinePlusCircle />, label: 'New Application' },
    { to: '/forms', icon: <HiOutlineDocumentText />, label: 'My Forms' },
    { to: '/chat', icon: <HiOutlineChatAlt2 />, label: 'Messages' },
  ];

  const shopkeeperLinks = [
    { to: '/dashboard', icon: <HiOutlineViewGrid />, label: 'Dashboard' },
    { to: '/forms', icon: <HiOutlineDocumentText />, label: 'Forms Queue' },
    { to: '/chat', icon: <HiOutlineChatAlt2 />, label: 'Messages' },
  ];

  const links = user?.role === 'shopkeeper' ? shopkeeperLinks : customerLinks;

  return (
    <aside className={`sidebar ${isOpen ? 'sidebar--open' : 'sidebar--collapsed'}`} id="main-sidebar">
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
            {link.label}
          </NavLink>
        ))}
      </div>
    </aside>
  );
};

export default Sidebar;
