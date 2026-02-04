
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

    Workflow,
    Plug,
    ShieldCheck
} from 'lucide-react';
import FlowCanvas from './FlowCanvas';
import WebhookView from './WebhookView';
import Login from './Login';
import AdminView from './AdminView';
import { supabase } from './supabase';
import type { Session } from '@supabase/supabase-js';


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
    // Auth State
    const [session, setSession] = useState<Session | null>(null);
    const [authChecking, setAuthChecking] = useState(true);

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

    const [activeView, setActiveView] = useState<'dashboard' | 'chatflow' | 'webhooks' | 'admin'>('dashboard');
    const [isAdmin, setIsAdmin] = useState(false);
    const [profiles, setProfiles] = useState<any[]>([]);


    const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
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
    const activeProfileIdRef = useRef<string | null>(null);

    useEffect(() => {
        activeProfileIdRef.current = activeProfileId;
    }, [activeProfileId]);

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

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        setSession(null);
    };

    // Check Auth
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setAuthChecking(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setAuthChecking(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        if (session) {
            supabase.from('user_roles').select('role').eq('user_id', session.user.id).single()
                .then(({ data }) => setIsAdmin(data?.role === 'admin'));
        } else {
            setIsAdmin(false);
        }
    }, [session]);

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
        if (!session) {
            setSocket(null);
            return;
        }

        console.log('Connecting socket with token', session.access_token.substring(0, 10));
        const newSocket = io(SOCKET_URL, {
            auth: { token: session.access_token }
        });
        setSocket(newSocket);

        newSocket.on('profiles.update', (data) => {
            setProfiles(data);
            // Auto-select first profile if none active
            if (data.length > 0 && !activeProfileId) {
                setActiveProfileId(data[0].id);
            }
        });

        newSocket.on('connection.update', (update) => {
            if (update.profileId === activeProfileIdRef.current) setConnectionStatus(update.connection);
        });

        newSocket.on('qr.update', (data) => {
            if (data.profileId === activeProfileIdRef.current) setQrCode(data.qr);
        });

        newSocket.on('messages.upsert', (data) => {
            if (data.profileId === activeProfileIdRef.current) {
                setAllMessages((prev) => [...data.messages, ...prev]);
            }
        });

        newSocket.on('messages.history', (data) => {
            if (data.profileId === activeProfileIdRef.current) setAllMessages(data.messages);
        });

        newSocket.on('messaging-history.set', (history) => {
            setAllMessages(prev => [...history.messages, ...prev]);
        });

        newSocket.on('contacts.update', (data) => {
            if (data.profileId === activeProfileIdRef.current) {
                setContacts(prev => {
                    const next = { ...prev };
                    data.contacts.forEach((c: any) => {
                        if (c.id) next[c.id] = c.name || c.notify || next[c.id];
                    });
                    return next;
                });
            }
        });

        newSocket.on('mediaDownloaded', ({ messageId, data, mimetype }) => {
            setMediaCache(prev => ({ ...prev, [messageId]: { data, mimetype } }));
        });

        newSocket.on('profile.added', (id) => {
            handleSwitchProfile(id);
            setShowAddProfileModal(false);
            setNewProfileName('');
            setIsCreatingProfile(false);
        });

        newSocket.on('profile.error', (data) => {
            alert(data.message);
            setIsCreatingProfile(false);
        });

        newSocket.on('pairing.code', (data) => {
            if (data.profileId === activeProfileIdRef.current) {
                console.log('Pairing code received:', data.code);
                setPairingCode(data.code);
            }
        });

        newSocket.on('pairing.error', (data) => {
            if (data.profileId === activeProfileIdRef.current) {
                console.error('Pairing error:', data.error);
                alert(`Pairing failed: ${data.error}`);
            }
        });

        return () => {
            newSocket.close();
        };
    }, [session]); // ONLY reconnect if session changes

    // Handle switching profile separately
    useEffect(() => {
        if (socket && activeProfileId) {
            console.log('Switching to profile:', activeProfileId);
            socket.emit('switchProfile', activeProfileId);
        }
    }, [socket, activeProfileId]);

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

    if (authChecking) {
        return <div className="h-screen flex items-center justify-center bg-white text-[#111b21] text-xl font-light">Loading SaaS Infrastructure...</div>
    }

    if (!session) {
        return <Login onLogin={() => { }} />
    }

    return (
        <div className="flex h-screen bg-[#f8f9fa] overflow-hidden text-[#111b21] font-sans">
            <div className="w-[400px] border-r border-[#eceff1] flex flex-col bg-white">
                <header className="h-[60px] bg-[#f0f2f5] px-4 flex items-center justify-between border-b border-[#eceff1]">
                    <div className="flex items-center gap-4">
                        <div className="relative" ref={profileMenuRef}>
                            <div
                                onClick={() => setShowProfileMenu(!showProfileMenu)}
                                className="w-10 h-10 rounded-full bg-white border border-[#eceff1] flex items-center justify-center overflow-hidden cursor-pointer relative shadow-sm"
                            >
                                <User className="text-[#54656f]" />
                                {profiles.some(p => p.id !== activeProfileId && p.unreadCount > 0) && (
                                    <div className="absolute top-0 right-0 w-3 h-3 bg-rose-500 rounded-full border-2 border-[#f0f2f5]" />
                                )}
                            </div>

                            {showProfileMenu && (
                                <div className="absolute left-0 mt-2 w-64 bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.1)] py-2 z-[101] border border-[#eceff1]">
                                    <div className="px-4 py-2 text-xs font-bold text-[#54656f] uppercase border-b border-[#eceff1] mb-2 tracking-wider">Switch Profile</div>
                                    <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                                        {profiles.map(p => (
                                            <div key={p.id} className="flex items-center hover:bg-[#f0f2f5] transition-colors pr-group group">
                                                <button
                                                    onClick={() => handleSwitchProfile(p.id)}
                                                    className={`flex-1 text-left px-4 py-3 flex items-center justify-between ${p.id === activeProfileId ? 'bg-[#00a884]/5' : ''}`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-full bg-[#f0f2f5] flex items-center justify-center border border-[#eceff1]">
                                                            <User className="w-4 h-4 text-[#54656f]" />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-bold text-[#111b21] truncate max-w-[120px]">{p.name}</span>
                                                            <span className="text-[10px] text-[#54656f] font-medium">{p.id === activeProfileId ? 'Active Now' : 'Click to switch'}</span>
                                                        </div>
                                                    </div>
                                                    {p.unreadCount > 0 && (
                                                        <span className="bg-[#00a884] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                                                            {p.unreadCount}
                                                        </span>
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteProfile(p.id, p.name)}
                                                    className="p-2 opacity-0 group-hover:opacity-100 text-[#54656f] hover:text-rose-500 transition-all"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => setShowAddProfileModal(true)}
                                        className="w-full px-4 py-3 flex items-center gap-3 text-[#00a884] font-bold hover:bg-[#f8f9fa] transition-colors border-t border-[#eceff1]"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Add New Profile
                                    </button>
                                    <div
                                        onClick={handleSignOut}
                                        className="w-full px-4 py-3 flex items-center gap-3 text-rose-500 font-bold hover:bg-[#f8f9fa] transition-colors cursor-pointer mt-2 border-t border-[#eceff1]"
                                    >
                                        <LogOut className="w-4 h-4" />
                                        <span className="text-sm">Sign Out</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {isAdmin && (
                            <button
                                onClick={() => setActiveView('admin')}
                                className={`p-2 rounded-lg transition-colors ${activeView === 'admin' ? 'bg-[#00a884]/10 text-[#00a884]' : 'text-[#54656f] hover:bg-white hover:shadow-sm'}`}
                                title="Admin Control Center"
                            >
                                <Shield className="w-6 h-6" />
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-6 text-[#54656f] relative" ref={menuRef}>
                        <Workflow
                            className={`w-6 h-6 cursor-pointer transition-colors ${activeView === 'chatflow' ? 'text-[#00a884]' : 'hover:text-[#111b21]'}`}
                            onClick={() => setActiveView(activeView === 'chatflow' ? 'dashboard' : 'chatflow')}
                        />
                        <Plug
                            className={`w-6 h-6 cursor-pointer transition-colors ${activeView === 'webhooks' ? 'text-[#00a884]' : 'hover:text-[#111b21]'}`}
                            onClick={() => setActiveView(activeView === 'webhooks' ? 'dashboard' : 'webhooks')}
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

                <div className="px-3 py-2 border-b border-[#f0f2f5]">
                    <div className="bg-[#f0f2f5] rounded-xl flex items-center px-4 py-2 focus-within:bg-white focus-within:ring-1 focus-within:ring-[#00a884]/20 transition-all">
                        <Search className="w-4 h-4 text-[#54656f] mr-4" />
                        <input
                            type="text"
                            placeholder="Search or start new chat"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-transparent border-none text-[15px] w-full focus:outline-none placeholder:text-[#54656f]"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {!activeProfileId ? (
                        <div className="p-4 flex flex-col items-center justify-center h-full text-center bg-white">
                            <User className="w-12 h-12 text-[#54656f] mb-4 opacity-10" />
                            <p className="text-[#111b21] font-bold mb-2">No Profile active</p>
                            <p className="text-sm text-[#8696a0] mb-6">Create or select a profile to start</p>
                            <button
                                onClick={() => setShowAddProfileModal(true)}
                                className="bg-[#00a884] text-black px-6 py-2 rounded-lg font-bold hover:bg-[#008f6f] transition-all"
                            >
                                Create First Profile
                            </button>
                        </div>
                    ) : connectionStatus !== 'open' ? (
                        <div className="p-4 flex flex-col items-center justify-center h-full text-center">
                            {qrCode ? (
                                <>
                                    <div className="bg-white p-4 rounded-2xl mb-4 shadow-[0_8px_30px_rgba(37,211,102,0.1)] border border-[#eceff1]">
                                        <img src={qrCode} alt="Profile QR" className="w-48 h-48" />
                                    </div>
                                    <p className="text-sm text-[#54656f] mb-4 font-medium">Scan to connect {profiles.find(p => p.id === activeProfileId)?.name}</p>
                                    <div className="flex gap-2">
                                        <button onClick={handleRefreshQR} className="bg-[#00a884] text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm">Refresh QR</button>
                                        <button onClick={handleShowPairingModal} className="bg-white text-[#54656f] px-4 py-2 rounded-lg text-sm font-bold border border-[#eceff1] hover:bg-[#f8f9fa] transition-colors">Use Phone Number</button>
                                    </div>
                                    {pairingCode && (
                                        <div className="mt-4 p-4 bg-[#f0f2f5] rounded-xl border border-[#00a884]">
                                            <p className="text-xs text-[#54656f] mb-2 font-bold uppercase tracking-wider">Pairing Code</p>
                                            <p className="text-2xl font-mono font-bold text-[#00a884] tracking-widest">{pairingCode}</p>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <CircleDashed className="w-12 h-12 text-[#00a884] animate-spin mb-4" />
                                    <p className="text-[#54656f] font-medium">Connecting profile...</p>
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
                            className={`flex items-center px-3 py-2 cursor-pointer hover:bg-[#f5f6f6] transition-colors border-b border-[#fcfdfd] ${selectedChatId === chat.id ? 'bg-[#f0f2f5]' : ''}`}
                        >
                            <div className="w-12 h-12 rounded-full bg-[#f0f2f5] mr-3 flex-shrink-0 flex items-center justify-center border border-[#eceff1]">
                                {chat.id.endsWith('@g.us') ? (
                                    <Users className="text-[#54656f] w-5 h-5" />
                                ) : (
                                    <User className="text-[#54656f] w-5 h-5" />
                                )}
                            </div>
                            <div className="flex-1 min-w-0 border-b border-[#f5f6f6] pb-3 pt-1">
                                <div className="flex justify-between items-baseline mb-0.5">
                                    <h3 className="font-bold text-[16px] truncate pr-2 text-[#111b21]">
                                        {chat.name}
                                    </h3>
                                    <span className="text-[11px] font-medium text-[#54656f]">
                                        {chat.timestamp ? new Date(chat.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                    </span>
                                </div>
                                {(chat.id.endsWith('@s.whatsapp.net') || chat.id.endsWith('@lid')) &&
                                    getCleanId(chat.name) !== getCleanId(chat.id) && (
                                        <div className="text-[11px] text-[#00a884] font-bold leading-none mb-1">
                                            {formatPhoneNumber(getCleanId(chat.id))}
                                        </div>
                                    )}
                                <div className="flex items-center justify-between mt-0.5">
                                    <p className="truncate text-[13px] text-[#54656f] font-medium leading-tight flex-1">
                                        {chat.lastMessage}
                                    </p>
                                    {chat.id.endsWith('@g.us') && (
                                        <span className="ml-2 px-1.5 py-0.5 bg-[#f0f2f5] text-[#54656f] text-[9px] rounded uppercase font-bold border border-[#eceff1] tracking-tight">Group</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {selectedChatId ? (
                <div className="flex-1 flex flex-col bg-[#f0f2f5] relative">
                    <div className="absolute inset-0 opacity-[0.06] pointer-events-none bg-[url('https://web.whatsapp.com/img/bg-chat-tile-light_6860a4760a595861d83d.png')] bg-repeat" />

                    <header className="h-[60px] bg-[#f0f2f5] px-3 flex items-center justify-between z-10 border-l border-[#eceff1]">
                        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setShowContactInfo(true)}>
                            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden border border-[#eceff1] shadow-sm">
                                {selectedChat?.id.endsWith('@g.us') ? (
                                    <Users className="text-[#54656f] w-5 h-5" />
                                ) : (
                                    <User className="text-[#54656f] w-5 h-5" />
                                )}
                            </div>
                            <div>
                                <h2 className="font-bold text-[16px] leading-tight text-[#111b21]">
                                    {selectedChat?.name}
                                </h2>
                                <p className="text-[12px] text-[#54656f]">
                                    {selectedChat?.id.endsWith('@g.us') ? (
                                        <span className="text-[#54656f] font-medium tracking-tight uppercase text-[10px]">Group Statistics</span>
                                    ) : (
                                        <>
                                            <span className="text-[#00a884] font-bold">{formatPhoneNumber(getCleanId(selectedChat?.id))}</span>
                                            <span className="ml-2 text-[#06d755] font-bold">• active</span>
                                        </>
                                    )}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-6 text-[#54656f]">
                            <Video className="w-5 h-5 cursor-pointer hover:text-[#111b21]" />
                            <Phone className="w-5 h-5 cursor-pointer hover:text-[#111b21]" />
                            <div className="w-px h-6 bg-[#eceff1] mx-1" />
                            <Search className="w-5 h-5 cursor-pointer hover:text-[#111b21]" />
                            <MoreVertical className="w-5 h-5 cursor-pointer hover:text-[#111b21]" />
                        </div>
                    </header>

                    <div className="flex-1 overflow-y-auto px-16 py-6 space-y-1 custom-scrollbar z-10 flex flex-col">
                        {currentChatMessages.map((msg, idx) => (
                            <div
                                key={msg.key.id || idx}
                                className={`max-w-[85%] flex flex-col ${msg.key.fromMe ? 'self-end' : 'self-start'}`}
                            >
                                <div className={`
                                    px-3 py-1.5 rounded-xl text-[14px] shadow-[0_1px_0.5px_rgba(0,0,0,0.1)] relative mb-1 tracking-tight
                                    ${msg.key.fromMe ? 'bg-[#d9fdd3] text-[#111b21] rounded-tr-none' : 'bg-white text-[#111b21] rounded-tl-none'}
                                `}>
                                    <p className="leading-relaxed whitespace-pre-wrap break-words pr-14">
                                        {msg.message?.conversation || msg.message?.extendedTextMessage?.text}
                                    </p>

                                    {/* Media Rendering */}
                                    {msg.message?.imageMessage && (
                                        <div className="mt-1 mb-1 max-w-sm rounded-lg overflow-hidden cursor-pointer bg-[#fcfdfd] min-h-[100px] flex items-center justify-center relative border border-[#eceff1]">
                                            {mediaCache[msg.key.id!] ? (
                                                <img
                                                    src={`data:${mediaCache[msg.key.id!].mimetype};base64,${mediaCache[msg.key.id!].data}`}
                                                    alt="WhatsApp Attachment"
                                                    className="max-w-full h-auto block"
                                                />
                                            ) : (
                                                <div className="p-4 text-center" onClick={() => socket?.emit('downloadMedia', { profileId: activeProfileId, message: msg })}>
                                                    <p className="text-xs text-[#54656f] font-bold">Load Image</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {msg.message?.documentMessage && (
                                        <div
                                            className="mt-1 mb-1 p-3 bg-[#f8f9fa] rounded-xl flex items-center gap-3 cursor-pointer hover:bg-white transition-all border border-[#eceff1]"
                                            onClick={() => {
                                                if (mediaCache[msg.key.id!]) {
                                                    const link = document.createElement('a');
                                                    link.href = `data:${mediaCache[msg.key.id!].mimetype};base64,${mediaCache[msg.key.id!].data}`;
                                                    link.download = msg.message?.documentMessage?.fileName || 'document';
                                                    link.click();
                                                } else {
                                                    socket?.emit('downloadMedia', { profileId: activeProfileId, message: msg });
                                                }
                                            }}
                                        >
                                            <div className="p-2 bg-[#00a884]/10 rounded-lg text-[#00a884]">
                                                <Paperclip className="w-5 h-5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold truncate text-[#111b21]">{msg.message.documentMessage.fileName || 'Document'}</p>
                                                <p className="text-[10px] text-[#54656f] font-bold uppercase tracking-tight">{Math.round((Number(msg.message.documentMessage.fileLength) || 0) / 1024)} KB • {msg.message.documentMessage.mimetype?.split('/')[1]?.toUpperCase() || 'FILE'}</p>
                                            </div>
                                        </div>
                                    )}

                                    <div className="absolute bottom-1 right-2 flex items-center gap-1">
                                        <span className="text-[10px] text-[#54656f]/70 font-bold">
                                            {msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : ''}
                                        </span>
                                        {msg.key.fromMe && <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />}
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>

                    <footer className="bg-[#f0f2f5] px-4 py-3 flex items-center gap-2 z-10 min-h-[62px]">
                        <div className="flex items-center text-[#54656f]">
                            <div className="p-2 hover:bg-white rounded-xl transition-all cursor-pointer"><Smile className="w-6 h-6" /></div>
                            <div className="p-2 hover:bg-white rounded-xl transition-all cursor-pointer"><Paperclip className="w-6 h-6 -rotate-45" /></div>
                        </div>
                        <div className="flex-1 mx-2">
                            <input
                                type="text"
                                placeholder="Type a message"
                                value={messageText}
                                onChange={(e) => setMessageText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                className="w-full bg-white border border-[#eceff1] rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-1 focus:ring-[#00a884]/20 placeholder:text-[#54656f]/50 text-[#111b21]"
                            />
                        </div>
                        <div className="text-[#54656f] flex items-center">
                            {messageText.trim() ? (
                                <div onClick={handleSendMessage} className="p-3 bg-[#00a884] shadow-sm rounded-xl cursor-pointer text-white transition-transform active:scale-95"><Send className="w-5 h-5" /></div>
                            ) : (
                                <div className="p-2 hover:bg-white rounded-xl transition-all cursor-pointer"><Mic className="w-6 h-6" /></div>
                            )}
                        </div>
                    </footer>

                    {/* Contact Info Sidebar */}
                    {showContactInfo && (
                        <div className="w-[400px] bg-white border-l border-[#eceff1] flex flex-col z-50">
                            <header className="h-[60px] bg-[#f0f2f5] px-5 flex items-center gap-6 text-[#111b21] border-b border-[#eceff1]">
                                <X className="w-6 h-6 cursor-pointer hover:text-[#54656f]" onClick={() => setShowContactInfo(false)} />
                                <h2 className="text-[16px] font-bold">Contact Info</h2>
                            </header>

                            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col items-center py-8 px-6 space-y-8">
                                <div className="w-48 h-48 rounded-full bg-[#f0f2f5] flex items-center justify-center border border-[#eceff1] flex-shrink-0 shadow-sm">
                                    {selectedChat?.id.endsWith('@g.us') ? (
                                        <Users className="text-[#aebac1] w-24 h-24" />
                                    ) : (
                                        <User className="text-[#aebac1] w-24 h-24" />
                                    )}
                                </div>

                                <div className="w-full text-center">
                                    <h3 className="text-[24px] font-bold text-[#111b21] break-words">{selectedChat?.name}</h3>
                                    <p className="text-[#54656f] text-[15px] mt-1 font-medium">
                                        {selectedChat?.id.endsWith('@g.us') ? 'Shared Group' : formatPhoneNumber(getCleanId(selectedChat?.id))}
                                    </p>
                                </div>

                                <div className="w-full space-y-4 bg-[#f8f9fa] p-5 rounded-2xl border border-[#eceff1]">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[12px] text-[#00a884] font-bold uppercase tracking-wider">Phone number</span>
                                        <span className="text-[16px] font-bold text-[#111b21]">
                                            {selectedChat?.id.endsWith('@g.us') ? 'Enterprise Group' : formatPhoneNumber(getCleanId(selectedChat?.id))}
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-1 pt-4 border-t border-[#eceff1]">
                                        <span className="text-[12px] text-[#00a884] font-bold uppercase tracking-wider">Session Info</span>
                                        <span className="text-[15px] text-[#54656f] font-medium leading-relaxed">This is a stable Nexus WA SaaS bridge. End-to-end encrypted and high-availability connection.</span>
                                    </div>
                                </div>

                                <div className="w-full pt-4">
                                    <button
                                        onClick={() => setShowContactInfo(false)}
                                        className="w-full py-4 bg-white hover:bg-rose-50 text-rose-500 font-bold rounded-2xl transition-all border border-rose-100 flex items-center justify-center gap-2"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Clear History
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center bg-[#fcfdfd] relative">
                    <div className="absolute inset-x-0 bottom-0 h-1.5 bg-[#00a884] z-20" />
                    <div className="text-center relative z-10 px-6">
                        <div className="mb-12 flex justify-center scale-110">
                            <img src="https://static.whatsapp.net/rsrc.php/v4/y6/r/wa699kaDcnU.png" className="w-[300px] opacity-80" />
                        </div>
                        <h1 className="text-[32px] font-bold text-[#111b21] mb-2 tracking-tight">Nexus WA Multi-Device</h1>
                        <p className="text-[#54656f] text-[15px] leading-relaxed mb-12 max-w-sm mx-auto font-medium">
                            Scale your messaging across multiple WhatsApp profiles.<br />
                            Manage hundreds of chats concurrently from one clean dashboard.
                        </p>
                        <div className="flex items-center justify-center gap-2 text-[#54656f] text-[12px] font-bold uppercase tracking-widest bg-[#f0f2f5] py-2 px-6 rounded-full w-fit mx-auto shadow-sm">
                            <ShieldCheck className="w-4 h-4 text-[#00a884]" />
                            Enterprise Grade Security
                        </div>
                    </div>
                </div>
            )}



            {/* Add Profile Modal */}
            {
                showAddProfileModal && (
                    <div className="fixed inset-0 bg-white/60 backdrop-blur-md flex items-center justify-center z-[200]">
                        <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-[0_20px_60px_rgba(0,0,0,0.1)] border border-[#eceff1]">
                            <h2 className="text-2xl font-bold mb-6 text-[#111b21]">Add New Profile</h2>
                            <label className="block text-sm text-[#54656f] mb-2 font-medium">Profile Name</label>
                            <input
                                type="text"
                                placeholder="e.g. Sales Account, Support Bot"
                                value={newProfileName}
                                onChange={(e) => setNewProfileName(e.target.value)}
                                className="w-full bg-[#f8f9fa] border border-[#eceff1] rounded-xl px-4 py-4 mb-6 focus:border-[#00a884] outline-none text-[#111b21] font-medium"
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && submitAddProfile()}
                            />
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setShowAddProfileModal(false)}
                                    className="px-6 py-3 text-[#54656f] font-bold hover:bg-[#f0f2f5] rounded-xl transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={submitAddProfile}
                                    disabled={isCreatingProfile || !newProfileName.trim()}
                                    className="bg-[#00a884] text-white px-8 py-3 rounded-xl font-bold shadow-[0_4px_12px_rgba(0,168,132,0.2)] hover:shadow-[0_8px_20px_rgba(0,168,132,0.3)] disabled:opacity-50 transition-all"
                                >
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
                    <div className="fixed inset-0 bg-white/60 backdrop-blur-md flex items-center justify-center z-[200]">
                        <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-[0_20px_60px_rgba(0,0,0,0.1)] border border-[#eceff1]">
                            <h2 className="text-2xl font-bold mb-6 text-[#111b21]">Edit Profile Name</h2>
                            <label className="block text-sm text-[#54656f] mb-2 font-medium">New Name</label>
                            <input
                                type="text"
                                value={editingProfileName}
                                onChange={(e) => setEditingProfileName(e.target.value)}
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && submitUpdateProfileName()}
                                className="w-full bg-[#f8f9fa] border border-[#eceff1] rounded-xl px-4 py-4 mb-6 focus:border-[#00a884] outline-none text-[#111b21] font-medium"
                            />
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setShowEditProfileModal(false)}
                                    className="px-6 py-3 text-[#54656f] font-bold hover:bg-[#f0f2f5] rounded-xl transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={submitUpdateProfileName}
                                    className="bg-[#00a884] text-white px-8 py-3 rounded-xl font-bold shadow-[0_4px_12px_rgba(0,168,132,0.2)] hover:shadow-[0_8px_20px_rgba(0,168,132,0.3)] transition-all"
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
                    <div className="fixed inset-0 bg-white/60 backdrop-blur-md flex items-center justify-center z-[200]">
                        <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-[0_20px_60px_rgba(0,0,0,0.1)] border border-[#eceff1]">
                            <h2 className="text-2xl font-bold mb-6 text-[#111b21]">Direct Message</h2>
                            <p className="text-[#54656f] text-sm mb-4">Enter the phone number with country code (e.g. 60123456789)</p>
                            <input
                                type="text"
                                placeholder="Phone number..."
                                value={newPhoneNumber}
                                onChange={(e) => setNewPhoneNumber(e.target.value)}
                                className="w-full bg-[#f8f9fa] border border-[#eceff1] rounded-xl px-4 py-4 mb-6 focus:border-[#00a884] outline-none text-[#111b21] font-medium"
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && handleNewChat()}
                            />
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setShowNewChatModal(false)}
                                    className="px-6 py-3 text-[#54656f] font-bold hover:bg-[#f0f2f5] rounded-xl transition-all"
                                >
                                    Close
                                </button>
                                <button
                                    onClick={handleNewChat}
                                    className="bg-[#00a884] text-white px-8 py-3 rounded-xl font-bold shadow-[0_4px_12px_rgba(0,168,132,0.2)] hover:shadow-[0_8px_20px_rgba(0,168,132,0.3)] transition-all"
                                >
                                    Open Chat
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Pairing Code Modal */}
            {
                showPairingCodeModal && (
                    <div className="fixed inset-0 bg-white/60 backdrop-blur-md flex items-center justify-center z-[200]">
                        <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-[0_20px_60px_rgba(0,0,0,0.1)] border border-[#eceff1]">
                            <h2 className="text-2xl font-bold mb-6 text-[#111b21]">Connect via Phone Number</h2>
                            <X className="w-6 h-6 text-[#54656f] cursor-pointer hover:text-[#111b21] absolute top-5 right-5" onClick={() => setShowPairingCodeModal(false)} />
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm text-[#54656f] mb-2 font-medium">Your WhatsApp Phone Number</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. 60123456789"
                                        value={pairingPhoneNumber}
                                        onChange={(e) => setPairingPhoneNumber(e.target.value)}
                                        autoFocus
                                        className="w-full bg-[#f8f9fa] border border-[#eceff1] rounded-xl px-4 py-4 focus:outline-none focus:border-[#00a884] transition-colors text-[#111b21] font-medium"
                                        onKeyDown={(e) => e.key === 'Enter' && handleRequestPairingCode()}
                                    />
                                    <p className="text-[12px] text-[#8696a0] mt-2">Enter your number with country code (no '+' or spaces)</p>
                                </div>

                                {pairingCode ? (
                                    <div className="p-6 bg-[#f8f9fa] rounded-xl border-2 border-[#00a884] text-center">
                                        <p className="text-sm text-[#54656f] mb-3">Enter this code in WhatsApp Linked Devices:</p>
                                        <p className="text-4xl font-mono font-bold text-[#00a884] tracking-widest">{pairingCode}</p>
                                        <p className="text-xs text-[#8696a0] mt-4">
                                            Open WhatsApp → Settings → Linked Devices → Link a Device → Link with Phone Number
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex justify-end gap-3">
                                        <button
                                            onClick={() => setShowPairingCodeModal(false)}
                                            className="px-6 py-3 text-[#54656f] font-bold hover:bg-[#f0f2f5] rounded-xl transition-all"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleRequestPairingCode}
                                            disabled={!pairingPhoneNumber.trim()}
                                            className={`bg-[#00a884] text-white px-8 py-3 rounded-xl font-bold shadow-[0_4px_12px_rgba(0,168,132,0.2)] hover:shadow-[0_8px_20px_rgba(0,168,132,0.3)] disabled:opacity-50 transition-all`}
                                        >
                                            Generate Pairing Code
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Chat Flow Setup View */}
            {
                activeView === 'chatflow' && (
                    <div className="fixed inset-0 bg-[#f8f9fa] z-[150] flex flex-col">
                        <header className="h-[70px] bg-[#f0f2f5] px-6 flex items-center justify-between border-b border-[#eceff1]">
                            <div className="flex items-center gap-4">
                                <Workflow className="text-[#00a884] w-8 h-8" />
                                <h1 className="text-xl font-bold text-[#111b21]">WhatsApp Chat Flow Assistant</h1>
                            </div>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => handleSaveFlows(flows)}
                                    className="bg-[#00a884] hover:bg-[#008f6f] text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-sm"
                                >
                                    <Save className="w-4 h-4" /> Save Configuration
                                </button>
                                <button onClick={() => setActiveView('dashboard')} className="p-2 hover:bg-white rounded-xl transition-all"><X className="w-6 h-6 text-[#54656f]" /></button>
                            </div>
                        </header>

                        <div className="flex-1 overflow-hidden bg-white flex">
                            {/* Sidebar for Flow List */}
                            <div className="w-80 border-r border-[#eceff1] flex flex-col bg-[#fcfdfd]">
                                <div className="p-6 border-b border-[#eceff1]">
                                    <h3 className="text-lg font-bold text-[#00a884] mb-4 flex items-center gap-2">
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
                                            <span className="text-[#111b21] text-sm">Enable Idle Message</span>
                                        </label>
                                        <textarea
                                            value={flows?.idleMessage || ''}
                                            onChange={(e) => setFlows({ ...flows, idleMessage: e.target.value })}
                                            className="w-full bg-[#f8f9fa] border border-[#eceff1] rounded-lg px-3 py-2 text-[#111b21] text-xs focus:outline-none focus:border-[#00a884] h-20 placeholder:text-[#54656f]"
                                            placeholder="Idle message..."
                                        />
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                    <div className="flex items-center justify-between mb-4 px-2">
                                        <span className="text-xs font-bold text-[#54656f] uppercase tracking-wider">Your Flows</span>
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
                                            className="text-[#00a884] hover:bg-[#00a884]/10 p-1.5 rounded-lg transition-all"
                                        >
                                            <Plus className="w-5 h-5" />
                                        </button>
                                    </div>
                                    {flows?.flows?.map((f: any) => (
                                        <div
                                            key={f.id}
                                            onClick={() => setSelectedFlowId(f.id)}
                                            className={`group p-4 rounded-2xl cursor-pointer border-2 transition-all ${selectedFlowId === f.id ? 'bg-[#00a884]/5 border-[#00a884]' : 'bg-white border-[#f0f2f5] hover:border-[#00a884]/30 hover:shadow-sm'}`}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <span className={`text-sm font-bold ${selectedFlowId === f.id ? 'text-[#111b21]' : 'text-[#54656f]'}`}>{f.name}</span>
                                                <Trash2
                                                    className="w-4 h-4 text-rose-500 opacity-0 group-hover:opacity-100 cursor-pointer hover:scale-110 transition-all"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const updatedFlows = { ...flows, flows: (flows?.flows || []).filter((flow: any) => flow.id !== f.id) };
                                                        setFlows(updatedFlows);
                                                        if (selectedFlowId === f.id) setSelectedFlowId(null);
                                                    }}
                                                />
                                            </div>
                                            <div className="flex gap-1.5 flex-wrap">
                                                {f.triggers.map((t: string, i: number) => (
                                                    <span key={i} className="text-[10px] bg-white text-[#00a884] px-2 py-0.5 rounded-full border border-[#00a884]/20 font-bold uppercase tracking-tight">{t}</span>
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
                                        <div className="bg-white p-6 border-b border-[#eceff1] flex items-center justify-between">
                                            <div className="flex items-center gap-8 flex-1">
                                                <input
                                                    className="bg-transparent border-none text-[#111b21] font-bold text-xl focus:outline-none w-1/3"
                                                    value={flows?.flows?.find((f: any) => f.id === selectedFlowId)?.name || ''}
                                                    onChange={(e) => {
                                                        const updatedFlows = { ...flows, flows: (flows?.flows || []).map((f: any) => f.id === selectedFlowId ? { ...f, name: e.target.value } : f) };
                                                        setFlows(updatedFlows);
                                                    }}
                                                />
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[11px] text-[#54656f] font-bold uppercase tracking-wider bg-[#f0f2f5] px-3 py-1 rounded-full">Automated Triggers</span>
                                                    <input
                                                        className="bg-[#f8f9fa] border border-[#eceff1] rounded-xl px-4 py-2 text-[#00a884] text-sm font-bold focus:outline-none focus:border-[#00a884] min-w-[250px] shadow-sm"
                                                        placeholder="Keyword triggers (comma separated)"
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

            {/* Webhook Config View */}
            {
                activeView === 'webhooks' && (
                    <div className="fixed inset-0 bg-[#f8f9fa] z-[150] flex flex-col">
                        <header className="h-[70px] bg-[#f0f2f5] px-6 flex items-center justify-between border-b border-[#eceff1]">
                            <div className="flex items-center gap-4">
                                <Plug className="text-[#00a884] w-8 h-8" />
                                <h1 className="text-xl font-bold text-[#111b21]">API & Webhook Configuration</h1>
                            </div>
                            <button onClick={() => setActiveView('dashboard')} className="p-2 hover:bg-white rounded-xl transition-all"><X className="w-6 h-6 text-[#54656f]" /></button>
                        </header>
                        <div className="flex-1 overflow-y-auto">
                            <WebhookView profileId={activeProfileId || ''} />
                        </div>
                    </div>
                )
            }

            {/* Admin View is handled above - deleting redundant block if any */}

            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scrollbar::-webkit-scrollbar {
                  width: 6px !important;
                }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #ced0d6; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #aebac1; }
                
                input::placeholder { color: #54656f; opacity: 0.5; }
                textarea::placeholder { color: #54656f; opacity: 0.5; }
                
                * { font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important; }
            ` }} />
        </div>
    );
}
