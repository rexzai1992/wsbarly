
import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import {
    Search,
    MoreVertical,
    MessageSquare,
    Paperclip,
    Smile,
    Mic,
    Send,
    Check,
    CheckCheck,
    CircleDashed,
    Filter,
    User,
    ArrowLeft,
    Settings,
    Phone,
    Video,
    Shield,
    LogOut,
    Users,
    X,
    Info,
    GitBranch,
    Play,
    Plus,
    Trash2,
    Save,
    Workflow
} from 'lucide-react';
import FlowCanvas from './FlowCanvas';

const SOCKET_URL = 'http://localhost:3001';

interface Message {
    key: {
        id: string;
        remoteJid: string;
        fromMe?: boolean;
    };
    message?: {
        conversation?: string;
        extendedTextMessage?: {
            text: string;
        };
        imageMessage?: any;
        documentMessage?: any;
    };
    pushName?: string;
    messageTimestamp?: number;
}

interface Chat {
    id: string;
    name: string;
    lastMessage?: string;
    timestamp?: number;
    unreadCount: number;
}

interface MediaData {
    data: string;
    mimetype: string;
}

const getCleanId = (jid: string | undefined): string => {
    if (!jid) return '';
    // Remove any @... suffix and any :device suffix
    const clean = jid.split('@')[0].split(':')[0];
    return clean;
};

const formatPhoneNumber = (id: string): string => {
    if (!id) return id;
    // If it's a long LID (usually 14-16 digits starting with 1 or 2), 
    // we can't easily format it as a PN, but we can at least make it look cleaner.
    if (id.length > 13) return id;

    // Attempt basic formatting for apparent phone numbers
    if (/^\d+$/.test(id)) {
        if (id.startsWith('60') && id.length >= 11) { // Malaysia
            return `+${id.slice(0, 2)} ${id.slice(2, 4)}-${id.slice(4, 8)} ${id.slice(8)}`;
        }
        if (id.startsWith('62') && id.length >= 11) { // Indonesia
            return `+${id.slice(0, 2)} ${id.slice(2, 5)}-${id.slice(5, 9)}-${id.slice(9)}`;
        }
        return `+${id}`;
    }
    return id;
};

export default function App() {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'open' | 'close'>('connecting');
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [allMessages, setAllMessages] = useState<Message[]>([]);
    const [contacts, setContacts] = useState<Record<string, string>>({});
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [messageText, setMessageText] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [mediaCache, setMediaCache] = useState<Record<string, MediaData>>({});
    const [showContactInfo, setShowContactInfo] = useState(false);
    const [showNewChatModal, setShowNewChatModal] = useState(false);
    const [newPhoneNumber, setNewPhoneNumber] = useState('');
    const [showMenu, setShowMenu] = useState(false);
    const [activeView, setActiveView] = useState<'dashboard' | 'chatflow'>('dashboard');
    const [profiles, setProfiles] = useState<any[]>([]);
    const [activeProfileId, setActiveProfileId] = useState('default');
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [showAddProfileModal, setShowAddProfileModal] = useState(false);
    const [showEditProfileModal, setShowEditProfileModal] = useState(false);
    const [newProfileName, setNewProfileName] = useState('');
    const [editingProfileId, setEditingProfileId] = useState('');
    const [editingProfileName, setEditingProfileName] = useState('');
    const [isCreatingProfile, setIsCreatingProfile] = useState(false);
    const [pairingCode, setPairingCode] = useState<string | null>(null);
    const [pairingPhoneNumber, setPairingPhoneNumber] = useState('');
    const [showPairingCodeModal, setShowPairingCodeModal] = useState(false);
    const [connectionStartTime, setConnectionStartTime] = useState<number | null>(null);
    const [connectionElapsed, setConnectionElapsed] = useState(0);
    const [flows, setFlows] = useState<any>(null);
    const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const profileMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
                setShowProfileMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const statusEmoji = connectionStatus === 'open' ? '🟢' : connectionStatus === 'connecting' ? '🟡' : '🔴';
        document.title = `${statusEmoji} WhatsApp Web`;
    }, [connectionStatus]);

    // Auto-refresh QR when connecting for too long and update elapsed timer
    useEffect(() => {
        if (connectionStatus === 'connecting') {
            if (!connectionStartTime) {
                setConnectionStartTime(Date.now());
                setConnectionElapsed(0);
            }

            // Update elapsed time every second
            const interval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - (connectionStartTime || Date.now())) / 1000);
                setConnectionElapsed(elapsed);
            }, 1000);

            // Auto-refresh after 30 seconds
            const timer = setTimeout(() => {
                const elapsed = Date.now() - (connectionStartTime || Date.now());
                if (elapsed >= 30000 && connectionStatus === 'connecting') {
                    console.log('Auto-refreshing QR after 30s of connecting...');
                    handleRefreshQR();
                }
            }, 30000);

            return () => {
                clearTimeout(timer);
                clearInterval(interval);
            };
        } else {
            setConnectionStartTime(null);
            setConnectionElapsed(0);
        }
    }, [connectionStatus, connectionStartTime]);

    useEffect(() => {
        const newSocket = io(SOCKET_URL);
        setSocket(newSocket);

        newSocket.on('profiles.update', (data) => setProfiles(data));

        newSocket.on('connection.update', (update) => {
            if (update.profileId === activeProfileId) setConnectionStatus(update.connection);
        });

        newSocket.on('qr.update', (data) => {
            if (data.profileId === activeProfileId) setQrCode(data.qr);
        });

        newSocket.on('messages.upsert', (data) => {
            if (data.profileId === activeProfileId) {
                setAllMessages((prev) => [...data.messages, ...prev]);
            }
        });

        newSocket.on('messages.history', (data) => {
            if (data.profileId === activeProfileId) setAllMessages(data.messages);
        });

        newSocket.on('messaging-history.set', (history) => {
            setAllMessages(prev => [...history.messages, ...prev]);
        });

        newSocket.on('contacts.update', (data) => {
            if (data.profileId === activeProfileId) {
                setContacts(prev => {
                    const next = { ...prev };
                    data.contacts.forEach((c: any) => {
                        if (c.id) next[c.id] = c.name || c.notify || next[c.id];
                    });
                    return next;
                });
            }
        });

        // Request initial profile switch to load "default"
        newSocket.emit('switchProfile', activeProfileId);

        newSocket.on('mediaDownloaded', ({ messageId, data, mimetype }) => {
            setMediaCache(prev => ({ ...prev, [messageId]: { data, mimetype } }));
        });

        newSocket.on('profile.added', (id) => {
            handleSwitchProfile(id);
            setShowAddProfileModal(false);
            setNewProfileName('');
            setIsCreatingProfile(false);
        });

        newSocket.on('pairing.code', (data) => {
            if (data.profileId === activeProfileId) {
                console.log('Pairing code received:', data.code);
                setPairingCode(data.code);
            }
        });

        newSocket.on('pairing.error', (data) => {
            if (data.profileId === activeProfileId) {
                console.error('Pairing error:', data.error);
                alert(`Pairing failed: ${data.error}`);
            }
        });

        return () => { newSocket.close(); };
    }, [activeProfileId]);

    useEffect(() => {
        if (activeView === 'chatflow') {
            fetch(`${SOCKET_URL}/api/flows?profileId=${activeProfileId}`)
                .then(res => res.json())
                .then(data => {
                    setFlows(data);
                    if (data.flows && data.flows.length > 0) {
                        if (!selectedFlowId || !data.flows.find((f: any) => f.id === selectedFlowId)) {
                            setSelectedFlowId(data.flows[0].id);
                        }
                    }
                })
                .catch(err => console.error('Failed to fetch flows:', err));
        }
    }, [activeView, activeProfileId]);

    const handleSaveFlows = (updatedFlows: any) => {
        fetch(`${SOCKET_URL}/api/flows?profileId=${activeProfileId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedFlows)
        })
            .then(() => alert('Flows saved successfully!'))
            .catch(err => console.error('Failed to save flows:', err));
    };

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [allMessages, selectedChatId]);

    // Process unique chats
    const chatsMap = new Map<string, Chat>();
    allMessages.forEach(msg => {
        const jid = msg.key.remoteJid;
        if (!jid) return;

        const existing = chatsMap.get(jid);
        const content = msg.message?.conversation || msg.message?.extendedTextMessage?.text || 'Media message';

        if (!existing || (msg.messageTimestamp && msg.messageTimestamp > (existing.timestamp || 0))) {
            const cleanId = getCleanId(jid);
            let rawName = contacts[jid] || msg.pushName || cleanId;
            // If the name itself is a JID, clean it
            if (rawName.includes('@')) {
                rawName = getCleanId(rawName);
            }

            chatsMap.set(jid, {
                id: jid,
                name: rawName,
                lastMessage: content,
                timestamp: msg.messageTimestamp,
                unreadCount: 0,
            });
        }
    });

    const chatList = Array.from(chatsMap.values())
        .filter(chat => chat.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    const currentChatMessages = allMessages
        .filter(msg => msg.key.remoteJid === selectedChatId)
        .sort((a, b) => (a.messageTimestamp || 0) - (b.messageTimestamp || 0));

    const selectedChat = selectedChatId ? chatsMap.get(selectedChatId) : null;

    const handleLogout = () => {
        socket?.emit('logout', activeProfileId);
        // Clear local state
        setQrCode(null);
        setPairingCode(null);
        setAllMessages([]);
        setConnectionStatus('connecting');
        // Refresh QR will happen automatically from backend after logout
    };

    const handleRefreshQR = () => {
        socket?.emit('refreshQR', activeProfileId);
        setPairingCode(null); // Clear any existing pairing code
        setQrCode(null); // Clear QR code
    };

    const handleRequestPairingCode = () => {
        if (pairingPhoneNumber.trim()) {
            console.log('Requesting pairing code for:', pairingPhoneNumber);
            socket?.emit('requestPairingCode', { profileId: activeProfileId, phoneNumber: pairingPhoneNumber.trim() });
        }
    };

    const handleShowPairingModal = () => {
        setShowPairingCodeModal(true);
        setPairingPhoneNumber('');
        setPairingCode(null);
    };

    const handleSendMessage = () => {
        if (!socket || !selectedChatId || !messageText.trim()) return;
        socket.emit('sendMessage', { profileId: activeProfileId, jid: selectedChatId, text: messageText });
        const tempMsg: Message = {
            key: { id: Math.random().toString(), remoteJid: selectedChatId, fromMe: true },
            message: { conversation: messageText },
            messageTimestamp: Math.floor(Date.now() / 1000),
        };
        setAllMessages(prev => [tempMsg, ...prev]);
        setMessageText('');
    };

    const handleDownloadMedia = (message: Message) => {
        if (!socket || mediaCache[message.key.id]) return;
        socket.emit('downloadMedia', { profileId: activeProfileId, message });
    };

    const handleSwitchProfile = (id: string) => {
        setActiveProfileId(id);
        setAllMessages([]);
        setContacts({});
        setQrCode(null);
        setSelectedChatId(null);
        setConnectionStatus('connecting'); // Anticipate status update
        socket?.emit('switchProfile', id);
        setShowProfileMenu(false);
    };

    const handleAddProfile = () => {
        setShowAddProfileModal(true);
    };

    const submitAddProfile = () => {
        if (newProfileName.trim() && !isCreatingProfile) {
            setIsCreatingProfile(true);
            console.log('Submitting new profile:', newProfileName.trim());
            socket?.emit('addProfile', newProfileName.trim());
        }
    };

    const handleUpdateProfileName = (profileId: string, currentName: string) => {
        setEditingProfileId(profileId);
        setEditingProfileName(currentName);
        setShowEditProfileModal(true);
    };

    const submitUpdateProfileName = () => {
        if (editingProfileName.trim() && editingProfileName !== profiles.find(p => p.id === editingProfileId)?.name) {
            socket?.emit('updateProfileName', { profileId: editingProfileId, name: editingProfileName.trim() });
            setShowEditProfileModal(false);
        }
    };

    const handleDeleteProfile = (profileId: string, name: string) => {
        socket?.emit('deleteProfile', profileId);
        if (activeProfileId === profileId) {
            // If we deleted the active profile, switch to default or first available
            const next = profiles.find(p => p.id !== profileId);
            if (next) {
                handleSwitchProfile(next.id);
            } else {
                handleSwitchProfile('default');
            }
        }
    };

    const handleNewChat = () => {
        if (!newPhoneNumber.trim()) return;
        let cleanNumber = newPhoneNumber.replace(/\D/g, '');
        if (!cleanNumber.includes('@')) {
            cleanNumber = `${cleanNumber}@s.whatsapp.net`;
        }
        setSelectedChatId(cleanNumber);
        setShowNewChatModal(false);
        setNewPhoneNumber('');
    };

    return (
        <div className="flex h-screen bg-[#0b141a] overflow-hidden text-[#e9edef] font-sans">
            <div className="w-[400px] border-r border-[#313d45] flex flex-col bg-[#111b21]">
                <header className="h-[60px] bg-[#202c33] px-4 flex items-center justify-between">
                    <div className="relative" ref={profileMenuRef}>
                        <div
                            onClick={() => setShowProfileMenu(!showProfileMenu)}
                            className="w-10 h-10 rounded-full bg-[#374045] flex items-center justify-center overflow-hidden cursor-pointer relative"
                        >
                            <User className="text-[#8696a0]" />
                            {profiles.some(p => p.id !== activeProfileId && p.unreadCount > 0) && (
                                <div className="absolute top-0 right-0 w-3 h-3 bg-rose-500 rounded-full border-2 border-[#202c33]" />
                            )}
                        </div>

                        {showProfileMenu && (
                            <div className="absolute left-0 mt-2 w-64 bg-[#233138] rounded-lg shadow-2xl py-2 z-[101] border border-[#313d45]">
                                <div className="px-4 py-2 text-xs font-bold text-[#8696a0] uppercase border-b border-[#313d45] mb-2">Switch Profile</div>
                                <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                                    {profiles.map(p => (
                                        <div key={p.id} className="flex items-center hover:bg-[#111b21] transition-colors pr-2 group">
                                            <button
                                                onClick={() => handleSwitchProfile(p.id)}
                                                className={`flex-1 text-left px-4 py-3 flex items-center justify-between ${p.id === activeProfileId ? 'bg-[#111b21]/40' : ''}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-[#374045] flex items-center justify-center">
                                                        <User className="w-4 h-4 text-[#8696a0]" />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-medium text-[#e9edef] truncate max-w-[120px]">{p.name}</span>
                                                        <span className="text-[10px] text-[#8696a0]">{p.id === activeProfileId ? 'Active Now' : 'Click to switch'}</span>
                                                    </div>
                                                </div>
                                                {p.unreadCount > 0 && (
                                                    <span className="bg-[#00a884] text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full mr-2">{p.unreadCount}</span>
                                                )}
                                            </button>
                                            <div className="flex items-center gap-3 px-3 z-20">
                                                <Settings
                                                    className="w-5 h-5 text-[#8696a0] hover:text-[#00a884] cursor-pointer transition-colors"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        e.preventDefault();
                                                        handleUpdateProfileName(p.id, p.name);
                                                    }}
                                                />
                                                {p.id !== 'default' && (
                                                    <Trash2
                                                        className="w-5 h-5 text-[#8696a0] hover:text-rose-500 cursor-pointer transition-colors"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            e.preventDefault();
                                                            handleDeleteProfile(p.id, p.name);
                                                        }}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    onClick={handleAddProfile}
                                    className="w-full text-left px-4 py-3 hover:bg-[#111b21] text-[#00a884] text-sm transition-colors flex items-center gap-3 border-t border-[#313d45] mt-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    Add New Profile
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-6 text-[#aebac1] relative" ref={menuRef}>
                        <Workflow
                            className={`w-6 h-6 cursor-pointer transition-colors ${activeView === 'chatflow' ? 'text-[#00a884]' : 'hover:text-[#e9edef]'}`}
                            onClick={() => setActiveView(activeView === 'dashboard' ? 'chatflow' : 'dashboard')}
                        />
                        <CircleDashed className="w-6 h-6 cursor-pointer" />
                        <MessageSquare className="w-6 h-6 cursor-pointer" onClick={() => setShowNewChatModal(true)} />
                        <div className="relative">
                            <MoreVertical
                                className={`w-6 h-6 cursor-pointer transition-colors ${showMenu ? 'text-[#00a884]' : 'hover:text-[#e9edef]'}`}
                                onClick={() => setShowMenu(!showMenu)}
                            />
                            {showMenu && (
                                <div className="absolute right-0 mt-2 w-72 bg-[#233138] rounded-lg shadow-2xl py-2 z-[100] border border-[#313d45]">
                                    <div className="px-4 py-3 border-b border-[#313d45]">
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className={`w-2 h-2 rounded-full ${connectionStatus === 'open' ? 'bg-[#00a884]' : connectionStatus === 'connecting' ? 'bg-yellow-500' : 'bg-rose-500'}`} />
                                            <span className="text-sm font-medium text-[#e9edef] capitalize">{connectionStatus}</span>
                                        </div>
                                        {connectionStatus !== 'open' && qrCode && (
                                            <div className="mt-3 bg-white p-2 rounded-lg flex flex-col items-center">
                                                <img src={qrCode} alt="Mini QR" className="w-48 h-48" />
                                                <p className="text-[10px] text-black font-bold mt-1">Scan to connect</p>
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => { handleRefreshQR(); setShowMenu(false); }}
                                        className="w-full text-left px-4 py-3 hover:bg-[#111b21] text-[#e9edef] text-[14.5px] transition-colors flex items-center gap-3"
                                    >
                                        <CircleDashed className="w-4 h-4 text-[#00a884]" />
                                        Refresh QR Code
                                    </button>
                                    <button
                                        onClick={() => { handleShowPairingModal(); setShowMenu(false); }}
                                        className="w-full text-left px-4 py-3 hover:bg-[#111b21] text-[#00a884] text-[14.5px] transition-colors flex items-center gap-3"
                                    >
                                        <Phone className="w-4 h-4" />
                                        Connect via Phone Number
                                    </button>
                                    <button
                                        onClick={() => { handleLogout(); setShowMenu(false); }}
                                        className="w-full text-left px-4 py-3 hover:bg-[#111b21] text-rose-500 text-[14.5px] transition-colors flex items-center gap-3"
                                    >
                                        <LogOut className="w-4 h-4" />
                                        Logout / Clear Session
                                    </button>
                                    <button
                                        onClick={() => setShowMenu(false)}
                                        className="w-full text-left px-4 py-3 hover:bg-[#111b21] text-[#e9edef] text-[14.5px] transition-colors flex items-center gap-3 border-t border-[#313d45]"
                                    >
                                        <Settings className="w-4 h-4 text-[#8696a0]" />
                                        Settings
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <div className="px-3 py-2">
                    <div className="bg-[#202c33] rounded-lg flex items-center px-4 py-1.5 focus-within:bg-[#202c33]">
                        <Search className="w-4 h-4 text-[#8696a0] mr-5" />
                        <input
                            type="text"
                            placeholder="Search or start new chat"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-transparent border-none text-[15px] w-full focus:outline-none placeholder:text-[#8696a0]"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {connectionStatus !== 'open' ? (
                        <div className="p-4 flex flex-col items-center justify-center h-full text-center">
                            {qrCode ? (
                                <>
                                    <div className="bg-white p-3 rounded-lg mb-4">
                                        <img src={qrCode} alt="Profile QR" className="w-48 h-48" />
                                    </div>
                                    <p className="text-sm text-[#8696a0] mb-4">Scan to connect {profiles.find(p => p.id === activeProfileId)?.name}</p>
                                    <div className="flex gap-2">
                                        <button onClick={handleRefreshQR} className="bg-[#00a884] text-black px-4 py-2 rounded text-sm font-bold">Refresh QR</button>
                                        <button onClick={handleShowPairingModal} className="bg-[#202c33] text-[#00a884] px-4 py-2 rounded text-sm font-bold border border-[#00a884]">Use Phone Number</button>
                                    </div>
                                    {pairingCode && (
                                        <div className="mt-4 p-4 bg-[#202c33] rounded-lg border border-[#00a884]">
                                            <p className="text-xs text-[#8696a0] mb-2">Or enter this pairing code on your phone:</p>
                                            <p className="text-2xl font-mono font-bold text-[#00a884] tracking-wider">{pairingCode}</p>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <CircleDashed className="w-12 h-12 text-yellow-500 animate-spin mb-4" />
                                    <p className="text-[#8696a0]">Connecting profile...</p>
                                    {connectionStartTime && (
                                        <p className="text-xs text-[#8696a0] mt-2">
                                            Connecting for {connectionElapsed}s
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    ) : chatList.map((chat) => (
                        <div
                            key={chat.id}
                            onClick={() => setSelectedChatId(chat.id)}
                            className={`flex items-center px-3 py-2 cursor-pointer hover:bg-[#202c33] transition-colors ${selectedChatId === chat.id ? 'bg-[#2a3942]' : ''}`}
                        >
                            <div className="w-12 h-12 rounded-full bg-[#374045] mr-3 flex-shrink-0 flex items-center justify-center border border-[#313d45]">
                                {chat.id.endsWith('@g.us') ? (
                                    <Users className="text-[#8696a0] w-6 h-6" />
                                ) : (
                                    <User className="text-[#8696a0]" />
                                )}
                            </div>
                            <div className="flex-1 min-w-0 border-b border-[#222d34] pb-3 pt-1">
                                <div className="flex justify-between items-baseline mb-0.5">
                                    <h3 className="font-normal text-[17px] truncate pr-2 text-[#e9edef]">
                                        {chat.name}
                                    </h3>
                                    <span className="text-xs text-[#8696a0]">
                                        {chat.timestamp ? new Date(chat.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                    </span>
                                </div>
                                {(chat.id.endsWith('@s.whatsapp.net') || chat.id.endsWith('@lid')) &&
                                    getCleanId(chat.name) !== getCleanId(chat.id) && (
                                        <div className="text-[12px] text-[#00a884] font-medium leading-none mb-1">
                                            {formatPhoneNumber(getCleanId(chat.id))}
                                        </div>
                                    )}
                                <div className="flex items-center justify-between mt-0.5">
                                    <p className="truncate text-[13px] text-[#8696a0] leading-tight flex-1">
                                        {chat.lastMessage}
                                    </p>
                                    {chat.id.endsWith('@g.us') && (
                                        <span className="ml-2 px-1.5 py-0.5 bg-[#202c33] text-[#8696a0] text-[9px] rounded uppercase font-bold border border-[#313d45] tracking-tight">Group</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {selectedChatId ? (
                <div className="flex-1 flex flex-col bg-[#0b141a] relative">
                    <div className="absolute inset-0 opacity-[0.4] pointer-events-none bg-[url('https://web.whatsapp.com/img/bg-chat-tile-dark_a4be512e71a7a3139087d743d7d44870.png')] bg-repeat" />

                    <header className="h-[60px] bg-[#202c33] px-3 flex items-center justify-between z-10 border-l border-[#313d45]">
                        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setShowContactInfo(true)}>
                            <div className="w-10 h-10 rounded-full bg-[#374045] flex items-center justify-center overflow-hidden border border-[#313d45]">
                                {selectedChat?.id.endsWith('@g.us') ? (
                                    <Users className="text-[#8696a0] w-5 h-5" />
                                ) : (
                                    <User className="text-[#8696a0]" />
                                )}
                            </div>
                            <div>
                                <h2 className="font-normal text-[16px] leading-tight">
                                    {selectedChat?.name}
                                </h2>
                                <p className="text-[12px] text-[#8696a0]">
                                    {selectedChat?.id.endsWith('@g.us') ? (
                                        <span className="text-[#8696a0]">Group Chat</span>
                                    ) : (
                                        <>
                                            <span className="text-[#00a884] font-medium">{formatPhoneNumber(getCleanId(selectedChat?.id))}</span>
                                            <span className="ml-2 text-emerald-500">• online</span>
                                        </>
                                    )}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-6 text-[#aebac1]">
                            <Video className="w-5 h-5 cursor-pointer" />
                            <Phone className="w-5 h-5 cursor-pointer" />
                            <div className="w-px h-6 bg-[#313d45] mx-1" />
                            <Search className="w-5 h-5 cursor-pointer" />
                            <MoreVertical className="w-5 h-5 cursor-pointer" />
                        </div>
                    </header>

                    <div className="flex-1 overflow-y-auto px-16 py-6 space-y-1 custom-scrollbar z-10 flex flex-col">
                        {currentChatMessages.map((msg, idx) => (
                            <div
                                key={msg.key.id || idx}
                                className={`max-w-[85%] flex flex-col ${msg.key.fromMe ? 'self-end' : 'self-start'}`}
                            >
                                <div className={`
                  px-3 py-1.5 rounded-lg text-[14.2px] shadow-sm relative mb-0.5
                  ${msg.key.fromMe ? 'bg-[#005c4b] text-[#e9edef]' : 'bg-[#202c33] text-[#e9edef]'}
                `}>
                                    <p className="leading-relaxed whitespace-pre-wrap break-words pr-14 text-[#e9edef]">
                                        {msg.message?.conversation || msg.message?.extendedTextMessage?.text}
                                    </p>

                                    {/* Media Rendering */}
                                    {msg.message?.imageMessage && (
                                        <div className="mt-1 mb-1 max-w-sm rounded-lg overflow-hidden cursor-pointer bg-black/20 min-h-[100px] flex items-center justify-center relative">
                                            {mediaCache[msg.key.id!] ? (
                                                <img
                                                    src={`data:${mediaCache[msg.key.id!].mimetype};base64,${mediaCache[msg.key.id!].data}`}
                                                    alt="WhatsApp Attachment"
                                                    className="max-w-full h-auto block"
                                                />
                                            ) : (
                                                <div className="p-4 text-center" onClick={() => socket?.emit('downloadMedia', msg)}>
                                                    <p className="text-xs text-[#8696a0]">Click to load image</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {msg.message?.documentMessage && (
                                        <div
                                            className="mt-1 mb-1 p-3 bg-black/10 rounded-lg flex items-center gap-3 cursor-pointer hover:bg-black/20 transition-colors"
                                            onClick={() => {
                                                if (mediaCache[msg.key.id!]) {
                                                    const link = document.createElement('a');
                                                    link.href = `data:${mediaCache[msg.key.id!].mimetype};base64,${mediaCache[msg.key.id!].data}`;
                                                    link.download = msg.message?.documentMessage?.fileName || 'document';
                                                    link.click();
                                                } else {
                                                    socket?.emit('downloadMedia', msg);
                                                }
                                            }}
                                        >
                                            <div className="p-2 bg-[#00a884]/20 rounded text-[#00a884]">
                                                <Paperclip className="w-5 h-5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate text-[#e9edef]">{msg.message.documentMessage.fileName || 'Document'}</p>
                                                <p className="text-[11px] text-[#8696a0]">{Math.round((Number(msg.message.documentMessage.fileLength) || 0) / 1024)} KB • {msg.message.documentMessage.mimetype?.split('/')[1]?.toUpperCase() || 'FILE'}</p>
                                            </div>
                                        </div>
                                    )}

                                    <div className="absolute bottom-1 right-2 flex items-center gap-1.5">
                                        <span className="text-[11px] text-[#8696a0] leading-none">
                                            {msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : ''}
                                        </span>
                                        {msg.key.fromMe && <CheckCheck className="w-4 h-4 text-[#53bdeb]" />}
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>

                    <footer className="bg-[#202c33] px-2 py-2 flex items-center gap-1 z-10 min-h-[62px]">
                        <div className="flex items-center text-[#8696a0]">
                            <div className="p-2.5 hover:bg-[#374045] rounded-full transition-colors cursor-pointer"><Smile className="w-6 h-6" /></div>
                            <div className="p-2.5 hover:bg-[#374045] rounded-full transition-colors cursor-pointer"><Paperclip className="w-6 h-6 -rotate-45" /></div>
                        </div>
                        <div className="flex-1 mx-1">
                            <input
                                type="text"
                                placeholder="Type a message"
                                value={messageText}
                                onChange={(e) => setMessageText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                className="w-full bg-[#2a3942] border-none rounded-lg px-4 py-2.5 text-[15px] focus:outline-none placeholder:text-[#8696a0] text-[#e9edef]"
                            />
                        </div>
                        <div className="text-[#8696a0] flex items-center px-1">
                            {messageText.trim() ? (
                                <div onClick={handleSendMessage} className="p-2.5 hover:bg-[#374045] rounded-full cursor-pointer text-[#00a884]"><Send className="w-6 h-6" /></div>
                            ) : (
                                <div className="p-2.5 hover:bg-[#374045] rounded-full cursor-pointer"><Mic className="w-6 h-6" /></div>
                            )}
                        </div>
                    </footer>

                    {/* Contact Info Sidebar */}
                    {showContactInfo && (
                        <div className="w-[400px] bg-[#0b141a] border-l border-[#313d45] flex flex-col z-50">
                            <header className="h-[60px] bg-[#202c33] px-5 flex items-center gap-6 text-[#e9edef]">
                                <X className="w-6 h-6 cursor-pointer hover:text-[#8696a0]" onClick={() => setShowContactInfo(false)} />
                                <h2 className="text-[16px] font-normal font-sans">Contact Info</h2>
                            </header>

                            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col items-center py-8 px-6 space-y-8">
                                <div className="w-48 h-48 rounded-full bg-[#374045] flex items-center justify-center border border-[#313d45] flex-shrink-0">
                                    {selectedChat?.id.endsWith('@g.us') ? (
                                        <Users className="text-[#8696a0] w-24 h-24" />
                                    ) : (
                                        <User className="text-[#8696a0] w-24 h-24" />
                                    )}
                                </div>

                                <div className="w-full text-center">
                                    <h3 className="text-[24px] font-normal text-[#e9edef] break-words">{selectedChat?.name}</h3>
                                    <p className="text-[#8696a0] text-[16px] mt-1 italic">
                                        {selectedChat?.id.endsWith('@g.us') ? 'Group Chat' : formatPhoneNumber(getCleanId(selectedChat?.id))}
                                    </p>
                                </div>

                                <div className="w-full space-y-4 bg-[#111b21] p-4 rounded-lg border border-[#313d45]">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[14px] text-[#00a884] font-medium tracking-tight">Phone number</span>
                                        <span className="text-[17px] text-[#e9edef]">
                                            {selectedChat?.id.endsWith('@g.us') ? 'Group Conversation' : formatPhoneNumber(getCleanId(selectedChat?.id))}
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-1 pt-2 border-t border-[#313d45]">
                                        <span className="text-[14px] text-[#00a884] font-medium tracking-tight">About</span>
                                        <span className="text-[17px] text-[#e9edef]">This is a Barly-powered WhatsApp bridge connection.</span>
                                    </div>
                                </div>

                                <div className="w-full space-y-4">
                                    <button
                                        onClick={() => setShowContactInfo(false)}
                                        className="w-full py-3 bg-[#202c33] hover:bg-[#2a3942] text-rose-500 font-medium rounded-lg transition-colors border border-[#313d45]"
                                    >
                                        Block Contact
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center bg-[#222e35] relative">
                    <div className="absolute inset-x-0 bottom-0 h-1.5 bg-[#00a884] z-20" />
                    <div className="text-center relative z-10 px-6">
                        <div className="mb-10 text-[#54656f] opacity-30 flex justify-center">
                            <img src="https://static.whatsapp.net/rsrc.php/v4/y6/r/wa699kaDcnU.png" className="w-[350px] brightness-125" />
                        </div>
                        <h1 className="text-[32px] font-light text-[#e9edef] mb-4">WhatsApp Web</h1>
                        <p className="text-[#8696a0] text-[14px] leading-relaxed mb-10 max-w-sm mx-auto">
                            Send and receive messages without keeping your phone online.<br />
                            Use WhatsApp on up to 4 linked devices and 1 phone at the same time.
                        </p>
                        <div className="flex items-center justify-center gap-2 text-[#667781] text-[12px] opacity-70">
                            <Shield className="w-4 h-4" />
                            End-to-end encrypted
                        </div>
                    </div>
                </div>
            )}



            {/* Add Profile Modal */}
            {
                showAddProfileModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] backdrop-blur-sm">
                        <div className="bg-[#2a3942] p-6 rounded-xl shadow-2xl w-full max-w-md border border-[#313d45]">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-medium text-[#e9edef]">Add New Profile</h2>
                                <X className="w-6 h-6 text-[#8696a0] cursor-pointer" onClick={() => setShowAddProfileModal(false)} />
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm text-[#00a884] mb-2 font-medium">Profile Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Work, Bot #2"
                                        value={newProfileName}
                                        onChange={(e) => setNewProfileName(e.target.value)}
                                        autoFocus
                                        onKeyDown={(e) => e.key === 'Enter' && submitAddProfile()}
                                        className="w-full bg-[#111b21] border border-[#313d45] rounded-lg px-4 py-2.5 text-[#e9edef] text-[15px] focus:outline-none focus:border-[#00a884] placeholder:text-[#8696a0]"
                                    />
                                </div>
                                <button
                                    onClick={submitAddProfile}
                                    disabled={!newProfileName.trim() || isCreatingProfile}
                                    className={`w-full py-3 font-bold rounded-lg transition-all uppercase tracking-tight text-sm flex items-center justify-center gap-2 ${newProfileName.trim() && !isCreatingProfile
                                        ? 'bg-[#00a884] hover:bg-[#008f6f] text-[#111b21] cursor-pointer'
                                        : 'bg-[#aebac1]/20 text-[#8696a0] cursor-not-allowed opacity-50'
                                        }`}
                                >
                                    {isCreatingProfile && <CircleDashed className="w-4 h-4 animate-spin" />}
                                    {isCreatingProfile ? 'Creating...' : 'Create Profile'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Edit Profile Modal */}
            {
                showEditProfileModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] backdrop-blur-sm">
                        <div className="bg-[#2a3942] p-6 rounded-xl shadow-2xl w-full max-w-md border border-[#313d45]">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-medium text-[#e9edef]">Edit Profile Name</h2>
                                <X className="w-6 h-6 text-[#8696a0] cursor-pointer" onClick={() => setShowEditProfileModal(false)} />
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm text-[#00a884] mb-2 font-medium">New Name</label>
                                    <input
                                        type="text"
                                        value={editingProfileName}
                                        onChange={(e) => setEditingProfileName(e.target.value)}
                                        autoFocus
                                        onKeyDown={(e) => e.key === 'Enter' && submitUpdateProfileName()}
                                        className="w-full bg-[#111b21] border border-[#313d45] rounded-lg px-4 py-2.5 text-[#e9edef] text-[15px] focus:outline-none focus:border-[#00a884] placeholder:text-[#8696a0]"
                                    />
                                </div>
                                <button
                                    onClick={submitUpdateProfileName}
                                    className="w-full py-3 bg-[#00a884] hover:bg-[#008f6f] text-[#111b21] font-bold rounded-lg transition-colors uppercase tracking-tight text-sm"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* New Chat Modal */}
            {
                showNewChatModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] backdrop-blur-sm">
                        <div className="bg-[#2a3942] p-6 rounded-xl shadow-2xl w-full max-w-md border border-[#313d45]">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-medium text-[#e9edef]">New Chat</h2>
                                <X className="w-6 h-6 text-[#8696a0] cursor-pointer" onClick={() => setShowNewChatModal(false)} />
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm text-[#00a884] mb-2 font-medium">Phone Number</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. 60123456789"
                                        value={newPhoneNumber}
                                        onChange={(e) => setNewPhoneNumber(e.target.value)}
                                        autoFocus
                                        className="w-full bg-[#111b21] border border-[#313d45] rounded-lg px-4 py-3 text-[#e9edef] focus:outline-none focus:border-[#00a884] transition-colors"
                                        onKeyDown={(e) => e.key === 'Enter' && handleNewChat()}
                                    />
                                    <p className="text-[12px] text-[#8696a0] mt-2">Enter the number with country code (no '+' or spaces)</p>
                                </div>
                                <button
                                    onClick={handleNewChat}
                                    className="w-full bg-[#00a884] hover:bg-[#008f6f] text-[#111b21] font-bold py-3 rounded-lg transition-colors mt-2"
                                >
                                    Start Chat
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Pairing Code Modal */}
            {
                showPairingCodeModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] backdrop-blur-sm">
                        <div className="bg-[#2a3942] p-6 rounded-xl shadow-2xl w-full max-w-md border border-[#313d45]">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-medium text-[#e9edef]">Connect via Phone Number</h2>
                                <X className="w-6 h-6 text-[#8696a0] cursor-pointer" onClick={() => setShowPairingCodeModal(false)} />
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm text-[#00a884] mb-2 font-medium">Your WhatsApp Phone Number</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. 60123456789"
                                        value={pairingPhoneNumber}
                                        onChange={(e) => setPairingPhoneNumber(e.target.value)}
                                        autoFocus
                                        className="w-full bg-[#111b21] border border-[#313d45] rounded-lg px-4 py-3 text-[#e9edef] focus:outline-none focus:border-[#00a884] transition-colors"
                                        onKeyDown={(e) => e.key === 'Enter' && handleRequestPairingCode()}
                                    />
                                    <p className="text-[12px] text-[#8696a0] mt-2">Enter your number with country code (no '+' or spaces)</p>
                                </div>

                                {pairingCode ? (
                                    <div className="p-6 bg-[#111b21] rounded-lg border-2 border-[#00a884]">
                                        <p className="text-sm text-[#8696a0] mb-3 text-center">Enter this code in WhatsApp Linked Devices:</p>
                                        <p className="text-4xl font-mono font-bold text-[#00a884] tracking-widest text-center">{pairingCode}</p>
                                        <p className="text-xs text-[#8696a0] mt-4 text-center">
                                            Open WhatsApp → Settings → Linked Devices → Link a Device → Link with Phone Number
                                        </p>
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleRequestPairingCode}
                                        disabled={!pairingPhoneNumber.trim()}
                                        className={`w-full py-3 font-bold rounded-lg transition-all uppercase tracking-tight text-sm ${pairingPhoneNumber.trim()
                                            ? 'bg-[#00a884] hover:bg-[#008f6f] text-[#111b21] cursor-pointer'
                                            : 'bg-[#aebac1]/20 text-[#8696a0] cursor-not-allowed opacity-50'
                                            }`}
                                    >
                                        Generate Pairing Code
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Chat Flow Setup View */}
            {
                activeView === 'chatflow' && (
                    <div className="fixed inset-0 bg-[#0b141a] z-[60] flex flex-col">
                        <header className="h-[60px] bg-[#202c33] px-6 flex items-center justify-between border-b border-[#313d45]">
                            <div className="flex items-center gap-4">
                                <Workflow className="text-[#00a884] w-6 h-6" />
                                <h2 className="text-xl font-medium text-[#e9edef]">WhatsApp Chat Flow Assistant</h2>
                            </div>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => handleSaveFlows(flows)}
                                    className="bg-[#00a884] hover:bg-[#008f6f] text-[#111b21] px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors"
                                >
                                    <Save className="w-4 h-4" /> Save Configuration
                                </button>
                                <X className="w-6 h-6 text-[#8696a0] cursor-pointer hover:text-[#e9edef]" onClick={() => setActiveView('dashboard')} />
                            </div>
                        </header>

                        <div className="flex-1 overflow-hidden bg-[#111b21] flex">
                            {/* Sidebar for Flow List */}
                            <div className="w-80 border-r border-[#313d45] flex flex-col bg-[#0b141a]">
                                <div className="p-6 border-b border-[#313d45]">
                                    <h3 className="text-lg font-medium text-[#00a884] mb-4 flex items-center gap-2">
                                        <Info className="w-5 h-5" /> Global Config
                                    </h3>
                                    <div className="space-y-4">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={flows?.idleEnabled}
                                                onChange={(e) => setFlows({ ...flows, idleEnabled: e.target.checked })}
                                                className="w-4 h-4 accent-[#00a884]"
                                            />
                                            <span className="text-[#e9edef] text-sm">Enable Idle Message</span>
                                        </label>
                                        <textarea
                                            value={flows?.idleMessage || ''}
                                            onChange={(e) => setFlows({ ...flows, idleMessage: e.target.value })}
                                            className="w-full bg-[#111b21] border border-[#313d45] rounded-lg px-3 py-2 text-[#e9edef] text-xs focus:outline-none focus:border-[#00a884] h-20"
                                            placeholder="Idle message..."
                                        />
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="text-xs font-bold text-[#8696a0] uppercase tracking-wider">Your Flows</span>
                                        <button
                                            onClick={() => {
                                                const newFlow = {
                                                    id: `flow-${Date.now()}`,
                                                    name: 'New Flow',
                                                    triggers: ['example'],
                                                    nodes: [{ id: 'node-start', type: 'START', position: { x: 100, y: 100 } }]
                                                };
                                                const updatedFlows = { ...flows, flows: [...(flows?.flows || []), newFlow] };
                                                setFlows(updatedFlows);
                                                setSelectedFlowId(newFlow.id);
                                            }}
                                            className="text-[#00a884] hover:text-[#008f6f] transition-colors"
                                        >
                                            <Plus className="w-5 h-5" />
                                        </button>
                                    </div>
                                    {flows?.flows?.map((f: any) => (
                                        <div
                                            key={f.id}
                                            onClick={() => setSelectedFlowId(f.id)}
                                            className={`group p-3 rounded-lg cursor-pointer border transition-all ${selectedFlowId === f.id ? 'bg-[#2a3942] border-[#00a884]' : 'bg-[#111b21] border-transparent hover:bg-[#202c33]'}`}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span className={`text-sm font-medium ${selectedFlowId === f.id ? 'text-[#e9edef]' : 'text-[#8696a0]'}`}>{f.name}</span>
                                                <Trash2
                                                    className="w-3 h-3 text-rose-500 opacity-0 group-hover:opacity-100 cursor-pointer hover:scale-125 transition-all"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const updatedFlows = { ...flows, flows: (flows?.flows || []).filter((flow: any) => flow.id !== f.id) };
                                                        setFlows(updatedFlows);
                                                        if (selectedFlowId === f.id) setSelectedFlowId(null);
                                                    }}
                                                />
                                            </div>
                                            <div className="flex gap-1 flex-wrap">
                                                {f.triggers.map((t: string, i: number) => (
                                                    <span key={i} className="text-[9px] bg-[#111b21] text-[#00a884] px-1.5 py-0.5 rounded border border-[#00a884]/30">{t}</span>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Flow Editor Canvas */}
                            <div className="flex-1 flex flex-col">
                                {selectedFlowId ? (
                                    <>
                                        <div className="bg-[#202c33] p-4 border-b border-[#313d45] flex items-center justify-between">
                                            <div className="flex items-center gap-4 flex-1">
                                                <input
                                                    className="bg-transparent border-none text-[#e9edef] font-medium text-lg focus:outline-none w-1/3"
                                                    value={flows?.flows?.find((f: any) => f.id === selectedFlowId)?.name || ''}
                                                    onChange={(e) => {
                                                        const updatedFlows = { ...flows, flows: (flows?.flows || []).map((f: any) => f.id === selectedFlowId ? { ...f, name: e.target.value } : f) };
                                                        setFlows(updatedFlows);
                                                    }}
                                                />
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-[#8696a0] font-bold uppercase">Triggers:</span>
                                                    <input
                                                        className="bg-[#111b21] border border-[#313d45] rounded-lg px-3 py-1 text-[#00a884] text-xs focus:outline-none focus:border-[#00a884] min-w-[200px]"
                                                        value={flows?.flows?.find((f: any) => f.id === selectedFlowId)?.triggers.join(', ') || ''}
                                                        onChange={(e) => {
                                                            const updatedFlows = { ...flows, flows: (flows?.flows || []).map((f: any) => f.id === selectedFlowId ? { ...f, triggers: e.target.value.split(',').map(s => s.trim()).filter(s => s) } : f) };
                                                            setFlows(updatedFlows);
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <FlowCanvas
                                            key={selectedFlowId}
                                            flow={flows?.flows?.find((f: any) => f.id === selectedFlowId)}
                                            onSave={(updatedFlow) => {
                                                const updatedFlows = { ...flows, flows: (flows?.flows || []).map((f: any) => f.id === selectedFlowId ? updatedFlow : f) };
                                                setFlows(updatedFlows);
                                                handleSaveFlows(updatedFlows);
                                            }}
                                        />
                                    </>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-[#8696a0] opacity-50">
                                        <GitBranch className="w-16 h-16 mb-4" />
                                        <p>Select or create a flow to start designing</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scrollbar::-webkit-scrollbar {
                  width: 6px !important;
                }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.25); }
                
                input::placeholder { color: #8696a0; }
                * { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important; }
            ` }} />
        </div>
    );
}
