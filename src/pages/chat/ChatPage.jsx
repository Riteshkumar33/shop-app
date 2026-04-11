import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import { getSocket, connectSocket } from '../../services/socket';
import {
  HiOutlinePaperAirplane,
  HiOutlineCheck,
  HiOutlineArrowLeft,
} from 'react-icons/hi';

const ChatPage = () => {
  const { chatId } = useParams();
  const { user, token } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const [chats, setChats] = useState([]);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [activeChat, setActiveChat] = useState(chatId || null);
  const [activeChatInfo, setActiveChatInfo] = useState(null);
  const [typingUser, setTypingUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch chat list
  useEffect(() => {
    const fetchChats = async () => {
      try {
        const { data } = await api.get('/chats');
        setChats(data);
        if (chatId) {
          const found = data.find(c => c._id === chatId);
          if (found) setActiveChatInfo(found);
        }
      } catch (err) {
        console.error('Failed to fetch chats:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchChats();
  }, [chatId]);

  // Fetch messages when active chat changes
  useEffect(() => {
    if (!activeChat) return;
    const fetchMessages = async () => {
      try {
        const { data } = await api.get(`/chats/${activeChat}/messages`);
        setMessages(data.messages || []);
      } catch (err) {
        console.error('Failed to fetch messages:', err);
      }
    };
    fetchMessages();

    // Update chat info
    const found = chats.find(c => c._id === activeChat);
    if (found) setActiveChatInfo(found);
  }, [activeChat, chats]);

  // Socket.IO events
  useEffect(() => {
    const socket = getSocket() || connectSocket(token);
    if (!socket || !activeChat) return;

    socket.emit('join_chat', activeChat);

    const handleNewMessage = (msg) => {
      if (msg.chatId === activeChat || msg.chatId?._id === activeChat) {
        setMessages(prev => [...prev, msg]);
        // Mark as read
        socket.emit('messages_read', { chatId: activeChat });
      }
    };

    const handleTyping = (data) => {
      if (data.chatId === activeChat && data.userId !== user.id) {
        setTypingUser(data.userId);
        setTimeout(() => setTypingUser(null), 3000);
      }
    };

    const handleStopTyping = () => setTypingUser(null);

    const handleReadReceipt = (data) => {
      if (data.chatId === activeChat) {
        setMessages(prev => prev.map(m =>
          m.senderId?._id === user.id || m.senderId === user.id
            ? { ...m, readAt: data.readAt }
            : m
        ));
      }
    };

    socket.on('new_message', handleNewMessage);
    socket.on('user_typing', handleTyping);
    socket.on('user_stop_typing', handleStopTyping);
    socket.on('messages_read_receipt', handleReadReceipt);

    // Mark existing messages as read
    socket.emit('messages_read', { chatId: activeChat });

    return () => {
      socket.emit('leave_chat', activeChat);
      socket.off('new_message', handleNewMessage);
      socket.off('user_typing', handleTyping);
      socket.off('user_stop_typing', handleStopTyping);
      socket.off('messages_read_receipt', handleReadReceipt);
    };
  }, [activeChat, token, user?.id]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat) return;

    const socket = getSocket();
    if (!socket) return toast.error('Not connected');

    socket.emit('send_message', {
      chatId: activeChat,
      text: newMessage.trim(),
    });

    setNewMessage('');
    inputRef.current?.focus();
  };

  const handleTypingStart = () => {
    const socket = getSocket();
    if (socket && activeChat) {
      socket.emit('typing', { chatId: activeChat });
    }
  };

  const getOtherUser = (chat) => {
    if (!chat) return null;
    return user?.role === 'customer' ? chat.shopkeeperId : chat.customerId;
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };

  const formatTime = (d) => {
    if (!d) return '';
    return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const formatChatDate = (d) => {
    if (!d) return '';
    const date = new Date(d);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const isSender = (msg) => {
    const senderId = msg.senderId?._id || msg.senderId;
    return senderId === user?.id;
  };

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-bg-primary" id="chat-page">
      {/* Sidebar */}
      <div className={`w-full md:w-[320px] border-r border-border-color flex-col ${activeChat ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-border-color">
          <h2 className="heading-4">Messages</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center h-full">
              <div className="text-4xl mb-4 opacity-50">💬</div>
              <div className="font-medium mb-1">No conversations</div>
              <div className="text-sm text-text-muted">
                Start a chat from a form detail page.
              </div>
            </div>
          ) : (
            chats.map(chat => {
              const other = getOtherUser(chat);
              return (
                <div
                  key={chat._id}
                  className={`flex items-center gap-3 p-4 border-b border-white/5 cursor-pointer transition-colors hover:bg-white/5 ${activeChat === chat._id ? 'bg-white/5 border-l-4 border-l-primary-500' : ''}`}
                  onClick={() => {
                    setActiveChat(chat._id);
                    navigate(`/chat/${chat._id}`, { replace: true });
                  }}
                >
                  <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center font-bold text-white shrink-0 overflow-hidden text-sm">
                    {other?.avatar ? (
                      <img src={other.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      getInitials(other?.name)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{other?.name || 'User'}</div>
                    <div className="text-xs text-text-muted truncate mt-0.5">{chat.lastMessage || 'No messages yet'}</div>
                  </div>
                  <div className="text-xs text-text-muted shrink-0 pt-1 self-start">{formatChatDate(chat.lastMessageAt)}</div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className={`flex-1 flex col min-w-0 flex-col ${!activeChat ? 'hidden md:flex' : 'flex'}`}>
        {activeChat && activeChatInfo ? (
          <>
            <div className="p-4 border-b border-border-color flex items-center gap-3">
              <button className="btn btn--ghost btn--icon md:hidden mr-2" onClick={() => setActiveChat(null)}>
                <HiOutlineArrowLeft />
              </button>
              <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center font-bold text-primary-400 shrink-0 text-sm">
                {getInitials(getOtherUser(activeChatInfo)?.name)}
              </div>
              <div>
                <div className="font-semibold text-sm">
                  {getOtherUser(activeChatInfo)?.name || 'User'}
                </div>
                <div className="text-text-muted text-xs capitalize">
                  {getOtherUser(activeChatInfo)?.role}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              {messages.map((msg, i) => (
                <div key={msg._id || i} className={`flex w-full ${isSender(msg) ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] p-3 text-sm relative ${isSender(msg) ? 'bg-primary-600 text-white rounded-2xl rounded-tr-sm shadow-md' : 'bg-white/10 text-text-primary rounded-2xl rounded-tl-sm'}`}>
                    <div>{msg.text}</div>
                    <div className="text-[10px] mt-1 opacity-70 text-right flex items-center justify-end gap-1">
                      {formatTime(msg.sentAt)}
                      {isSender(msg) && (
                        <span>
                          {msg.readAt ? (
                            <span className="text-primary-300">✓✓</span>
                          ) : msg.deliveredAt ? (
                            <span>✓✓</span>
                          ) : (
                            <span>✓</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="px-4 pb-2 text-xs text-text-muted italic h-6">
              {typingUser && <span>typing...</span>}
            </div>

            <form className="p-4 border-t border-border-color flex items-center gap-2 bg-bg-primary" onSubmit={handleSend}>
              <input
                ref={inputRef}
                className="flex-1 bg-white/5 border border-border-color focus:border-primary-400 rounded-full px-4 py-2 outline-none text-sm transition-colors"
                placeholder="Type a message..."
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={handleTypingStart}
                id="chat-message-input"
              />
              <button type="submit" className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white hover:bg-primary-500 disabled:opacity-50 transition-colors shrink-0" disabled={!newMessage.trim()} id="chat-send-btn">
                <HiOutlinePaperAirplane className="rotate-90" />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="text-6xl mb-4 opacity-50">💬</div>
            <div className="text-xl font-medium mb-2">Select a conversation</div>
            <div className="text-sm text-text-muted">Choose a chat from the sidebar to start messaging.</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatPage;
