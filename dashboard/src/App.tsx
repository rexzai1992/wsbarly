
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
    Info
} from 'lucide-react';

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
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const statusEmoji = connectionStatus === 'open' ? '🟢' : connectionStatus === 'connecting' ? '🟡' : '🔴';
        document.title = `${statusEmoji} WhatsApp Web`;
    }, [connectionStatus]);

    useEffect(() => {
        const newSocket = io(SOCKET_URL);
        setSocket(newSocket);

        newSocket.on('connection.update', (update) => {
            if (update.connection) setConnectionStatus(update.connection);
        });

        newSocket.on('qr', (data) => {
            setQrCode(data);
        });

        newSocket.on('messages.upsert', (upsert) => {
            setAllMessages((prev) => [...upsert.messages, ...prev]);
        });

        newSocket.on('messaging-history.set', (history) => {
            setAllMessages(prev => [...history.messages, ...prev]);
        });

        newSocket.on('contacts.update', (updates) => {
            setContacts(prev => {
                const next = { ...prev };
                updates.forEach((u: any) => {
                    if (u.id && u.name) next[u.id] = u.name;
                });
                return next;
            });
        });

        newSocket.on('mediaDownloaded', ({ messageId, data, mimetype }) => {
            setMediaCache(prev => ({ ...prev, [messageId]: { data, mimetype } }));
        });

        return () => {
            newSocket.close();
        };
    }, []);

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
            chatsMap.set(jid, {
                id: jid,
                name: contacts[jid] || msg.pushName || jid.split('@')[0],
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
        if (socket) {
            socket.emit('logout');
            setAllMessages([]);
            setSelectedChatId(null);
            setQrCode(null);
        }
    };

    const handleSendMessage = () => {
        if (socket && selectedChatId && messageText.trim()) {
            socket.emit('sendMessage', { jid: selectedChatId, text: messageText });
            const tempMsg: Message = {
                key: { id: Math.random().toString(), remoteJid: selectedChatId, fromMe: true },
                message: { conversation: messageText },
                messageTimestamp: Math.floor(Date.now() / 1000),
            };
            setAllMessages(prev => [tempMsg, ...prev]);
            setMessageText('');
        }
    };

    if (connectionStatus !== 'open' && qrCode) {
        return (
            <div className="min-h-screen bg-[#111b21] flex flex-col items-center justify-center p-4">
                <div className="bg-[#202c33] p-8 rounded-lg shadow-xl max-w-md w-full text-center">
                    <h2 className="text-2xl font-light text-[#e9edef] mb-6 flex items-center justify-center gap-2 font-sans">
                        <MessageSquare className="text-[#00a884] w-8 h-8" />
                        Barly WhatsApp
                    </h2>
                    <div className="bg-white p-4 rounded-lg inline-block mb-6">
                        <img src={qrCode} alt="QR Code" className="w-64 h-64" />
                    </div>
                    <p className="text-[#8696a0] text-sm leading-relaxed mb-4">
                        Scan QR code to Link Device
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-[#0b141a] overflow-hidden text-[#e9edef] font-sans">
            <div className="w-[400px] border-r border-[#313d45] flex flex-col bg-[#111b21]">
                <header className="h-[60px] bg-[#202c33] px-4 flex items-center justify-between">
                    <div className="w-10 h-10 rounded-full bg-[#374045] flex items-center justify-center overflow-hidden cursor-pointer">
                        <User className="text-[#8696a0]" />
                    </div>
                    <div className="flex items-center gap-6 text-[#aebac1]">
                        <CircleDashed className="w-6 h-6 cursor-pointer" />
                        <MessageSquare className="w-6 h-6 cursor-pointer" />
                        <LogOut className="w-5 h-5 cursor-pointer hover:text-rose-500 transition-colors" onClick={handleLogout} />
                        <MoreVertical className="w-6 h-6 cursor-pointer" />
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
                    {chatList.map((chat) => (
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
                                        {chat.id.endsWith('@s.whatsapp.net') && chat.name !== chat.id.split('@')[0] && (
                                            <span className="ml-2 text-[#8696a0] text-sm">(+{chat.id.split('@')[0]})</span>
                                        )}
                                        {chat.id.endsWith('@g.us') && (
                                            <span className="ml-2 px-1.5 py-0.5 bg-[#202c33] text-[#8696a0] text-[9px] rounded uppercase font-bold border border-[#313d45] tracking-tight">Group</span>
                                        )}
                                    </h3>
                                    <span className="text-xs text-[#8696a0]">
                                        {chat.timestamp ? new Date(chat.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                    </span>
                                </div>
                                <p className="truncate text-[13px] text-[#8696a0] leading-tight mt-0.5">
                                    {chat.lastMessage}
                                </p>
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
                                    {selectedChat?.id.endsWith('@s.whatsapp.net') && selectedChat?.name !== selectedChat?.id.split('@')[0] && (
                                        <span className="ml-2 text-[#8696a0] text-[13px]"> (+{selectedChat.id.split('@')[0]})</span>
                                    )}
                                </h2>
                                <p className="text-[12px] text-[#8696a0]">
                                    {selectedChat?.id.endsWith('@g.us') ? (
                                        <span className="text-[#8696a0]">Group Chat</span>
                                    ) : (
                                        <>
                                            {selectedChat?.id.includes('@s.whatsapp.net') ? `+${selectedChat.id.split('@')[0]}` : 'Newsletter/Other'}
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
                                        {selectedChat?.id.endsWith('@g.us') ? 'Group Chat' : `+${selectedChat?.id.split('@')[0]}`}
                                    </p>
                                </div>

                                <div className="w-full space-y-4 bg-[#111b21] p-4 rounded-lg border border-[#313d45]">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[14px] text-[#00a884] font-medium tracking-tight">About and phone number</span>
                                        <span className="text-[17px] text-[#e9edef]">This is a Barly-powered WhatsApp bridge connection.</span>
                                        <span className="text-[14px] text-[#8696a0] mt-2 border-t border-[#313d45] pt-2 italic">
                                            {selectedChat?.id.endsWith('@g.us') ? 'Group Conversation' : `+${selectedChat?.id.split('@')[0]}`}
                                        </span>
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

            <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px !important;
        }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.25); }
        
        input::placeholder { color: #8696a0; }
        * { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important; }
      `}</style>
        </div>
    );
}
