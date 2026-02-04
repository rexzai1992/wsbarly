
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Key, Globe, Shield } from 'lucide-react';

const SOCKET_URL = 'http://localhost:3001';
const ADMIN_PASS = 'admin123';

export default function WebhookView({ profileId }: { profileId: string }) {
    const [webhooks, setWebhooks] = useState<any[]>([]);
    const [apiKeys, setApiKeys] = useState<any>({});
    const [newUrl, setNewUrl] = useState('');
    const [newEvents, setNewEvents] = useState<string[]>(['message_received']);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchWebhooks();
        fetchApiKeys();
    }, [profileId]);

    const fetchWebhooks = () => {
        fetch(`${SOCKET_URL}/addon/admin/webhooks?profileId=${profileId}&adminPassword=${ADMIN_PASS}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) setWebhooks(data.data);
            });
    };

    const fetchApiKeys = () => {
        fetch(`${SOCKET_URL}/api/admin/api-keys?adminPassword=${ADMIN_PASS}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) setApiKeys(data.data);
            });
    };

    const handleAddWebhook = () => {
        if (!newUrl) return;
        setLoading(true);
        fetch(`${SOCKET_URL}/addon/admin/webhooks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                profileId,
                adminPassword: ADMIN_PASS,
                url: newUrl,
                events: newEvents
            })
        }).then(() => {
            setLoading(false);
            setNewUrl('');
            fetchWebhooks();
        });
    };

    const handleDeleteWebhook = (url: string) => {
        if (!confirm('Delete webhook?')) return;
        fetch(`${SOCKET_URL}/addon/admin/webhooks`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                profileId,
                adminPassword: ADMIN_PASS,
                url
            })
        }).then(() => fetchWebhooks());
    };

    const generateApiKey = () => {
        const name = prompt('Key Name:');
        if (!name) return;
        fetch(`${SOCKET_URL}/api/admin/api-keys`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                profileId,
                adminPassword: ADMIN_PASS,
                name
            })
        }).then(() => fetchApiKeys());
    };

    return (
        <div className="flex-1 bg-[#fcfdfd] p-10 overflow-y-auto text-[#111b21] h-screen font-sans">
            <h2 className="text-3xl font-black mb-10 flex items-center gap-4 tracking-tight">
                <Globe className="text-[#00a884] w-8 h-8" /> API & Connectivity
                <span className="text-xs bg-[#f0f2f5] px-4 py-1.5 rounded-full text-[#54656f] font-bold border border-[#eceff1] uppercase tracking-widest">Active session: {profileId}</span>
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                {/* Webhooks Section */}
                <div className="bg-white p-8 rounded-3xl border border-[#eceff1] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
                    <h3 className="text-xl mb-2 text-[#111b21] font-bold">Outgoing Webhooks</h3>
                    <p className="text-sm text-[#54656f] mb-8 font-medium">Configure endpoints to receive real-time updates from this session.</p>

                    <div className="space-y-4 mb-8">
                        {webhooks.length === 0 && (
                            <div className="bg-[#f8f9fa] border-2 border-dashed border-[#eceff1] p-10 rounded-2xl text-center">
                                <p className="text-sm text-[#aebac1] font-bold uppercase tracking-widest italic">No endpoints configured</p>
                            </div>
                        )}
                        {webhooks.map((hook, i) => (
                            <div key={i} className="bg-[#fcfdfd] p-5 rounded-2xl flex items-start justify-between border border-[#eceff1] group hover:border-[#00a884]/30 transition-all">
                                <div className="min-w-0 pr-4">
                                    <div className="font-mono text-sm break-all mb-2 text-[#111b21] font-bold leading-relaxed">{hook.url}</div>
                                    <div className="flex gap-2 flex-wrap">
                                        {hook.events.map((e: string) => (
                                            <span key={e} className="text-[10px] bg-[#f0f2f5] px-3 py-1 rounded-full text-[#54656f] font-bold uppercase tracking-tight border border-[#eceff1]">{e}</span>
                                        ))}
                                    </div>
                                </div>
                                <button onClick={() => handleDeleteWebhook(hook.url)} className="p-2 text-[#aebac1] hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all h-fit">
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="border-t border-[#eceff1] pt-8 space-y-4">
                        <label className="text-xs font-bold text-[#54656f] uppercase tracking-widest">Endpoint URL</label>
                        <input
                            className="w-full bg-[#f8f9fa] border border-[#eceff1] rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a884]/20 focus:border-[#00a884] text-[#111b21] font-bold placeholder-[#aebac1]"
                            placeholder="https://your-api.com/v1/webhook"
                            value={newUrl}
                            onChange={e => setNewUrl(e.target.value)}
                        />
                        <div className="flex flex-col gap-3 py-2">
                            <span className="text-[11px] font-bold text-[#54656f] uppercase tracking-widest">Select Events</span>
                            <div className="flex gap-3 flex-wrap">
                                {['message_received', 'message_sent', 'session_opened'].map(evt => (
                                    <label key={evt} className={`flex items-center gap-3 cursor-pointer px-4 py-2.5 rounded-xl border-2 transition-all font-bold text-xs uppercase tracking-tighter ${newEvents.includes(evt) ? 'bg-[#00a884]/5 border-[#00a884] text-[#00a884]' : 'bg-white border-[#eceff1] text-[#54656f] hover:border-[#aebac1]'}`}>
                                        <input
                                            type="checkbox"
                                            checked={newEvents.includes(evt)}
                                            onChange={e => {
                                                if (e.target.checked) setNewEvents([...newEvents, evt]);
                                                else setNewEvents(newEvents.filter(x => x !== evt));
                                            }}
                                            className="hidden"
                                        />
                                        {evt.replace('_', ' ')}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <button
                            onClick={handleAddWebhook}
                            disabled={loading || !newUrl}
                            className="w-full bg-[#00a884] hover:bg-[#008f6f] text-white font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-[0_8px_20px_rgba(0,168,132,0.2)] disabled:opacity-50 active:scale-95"
                        >
                            {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Plus className="w-5 h-5" />}
                            Register Webhook
                        </button>
                    </div>
                </div>

                {/* API Keys Section */}
                <div className="bg-white p-8 rounded-3xl border border-[#eceff1] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-xl text-[#111b21] font-bold">Access Gateways</h3>
                            <p className="text-sm text-[#54656f] font-medium mt-1">Manage API keys for server-side integration.</p>
                        </div>
                        <button onClick={generateApiKey} className="bg-[#111b21] text-white px-5 py-3 rounded-2xl flex items-center gap-2 font-bold hover:bg-[#202c33] transition-all shadow-lg text-xs">
                            <Plus className="w-4 h-4" /> NEW KEY
                        </button>
                    </div>

                    <div className="space-y-5 mb-10">
                        {Object.entries(apiKeys).length === 0 && (
                            <p className="text-sm text-[#aebac1] font-bold uppercase text-center italic py-4">No keys generated yet.</p>
                        )}
                        {Object.entries(apiKeys).map(([key, info]: [string, any]) => (
                            <div key={key} className="bg-[#fcfdfd] p-6 rounded-2xl border border-[#eceff1] hover:border-[#aebac1] transition-all">
                                <div className="flex justify-between items-center mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-[#00a884]/10 flex items-center justify-center">
                                            <Key className="w-4 h-4 text-[#00a884]" />
                                        </div>
                                        <span className="font-bold text-base text-[#111b21]">{info.name}</span>
                                    </div>
                                    <span className="text-[10px] text-[#54656f] bg-[#f0f2f5] px-3 py-1 rounded-full border border-[#eceff1] font-black uppercase tracking-widest">{info.profileId}</span>
                                </div>
                                <div className="flex items-center gap-3 font-mono text-sm bg-white p-4 rounded-xl border border-[#eceff1] break-all select-all cursor-text text-[#54656f] shadow-inner">
                                    <code className="flex-1 overflow-hidden text-ellipsis">{key}</code>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="p-6 bg-[#f8f9fa] rounded-3xl border border-[#eceff1]">
                        <h4 className="text-sm font-bold text-[#111b21] mb-5 flex items-center gap-2 uppercase tracking-widest">
                            <Shield className="w-5 h-5 text-[#00a884]" /> Developer Documentation
                        </h4>

                        <div className="space-y-4">
                            {/* Send Message */}
                            <div className="bg-white rounded-2xl border border-[#eceff1] overflow-hidden">
                                <div className="p-4 flex items-center justify-between bg-[#fcfdfd]">
                                    <span className="font-bold text-xs text-[#111b21]">POST <span className="text-[#00a884]">/addon/api/send-message</span></span>
                                    <span className="bg-[#00a884]/10 text-[#00a884] px-2 py-0.5 rounded-full font-black text-[9px] uppercase">Send Text</span>
                                </div>
                                <div className="p-4 border-t border-[#f0f2f5] space-y-3">
                                    <div className="text-[10px] text-[#54656f]">
                                        <p className="font-bold text-[#111b21] mb-1">HEADERS</p>
                                        <code className="block bg-[#f8f9fa] p-2 rounded">x-api-key: YOUR_KEY</code>
                                    </div>
                                    <div className="text-[10px] text-[#54656f]">
                                        <p className="font-bold text-[#111b21] mb-1">BODY (JSON)</p>
                                        <pre className="block bg-[#111b21] text-emerald-400 p-3 rounded font-mono leading-relaxed">
                                            {`{
  "to": "123456789@c.us",
  "message": "Hello from API"
}`}
                                        </pre>
                                    </div>
                                </div>
                            </div>

                            {/* Fetch Messages */}
                            <div className="bg-white rounded-2xl border border-[#eceff1] overflow-hidden">
                                <div className="p-4 flex items-center justify-between bg-[#fcfdfd]">
                                    <span className="font-bold text-xs text-[#111b21]">GET <span className="text-[#00a884]">/addon/api/messages</span></span>
                                    <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-black text-[9px] uppercase">History</span>
                                </div>
                                <div className="p-4 border-t border-[#f0f2f5] space-y-3">
                                    <div className="text-[10px] text-[#54656f]">
                                        <p className="font-bold text-[#111b21] mb-1">QUERY PARAMS</p>
                                        <code className="block bg-[#f8f9fa] p-2 rounded">?limit=50&contact=123456789@c.us</code>
                                    </div>
                                    <div className="text-[10px] text-[#54656f]">
                                        <p className="font-bold text-[#111b21] mb-1">EXAMPLE CURL</p>
                                        <pre className="block bg-[#111b21] text-emerald-400 p-3 rounded font-mono whitespace-pre-wrap break-all">
                                            curl -X GET "http://localhost:3001/addon/api/messages" -H "x-api-key: YOUR_KEY"
                                        </pre>
                                    </div>
                                </div>
                            </div>

                            {/* Webhook Info */}
                            <div className="bg-white rounded-2xl border border-[#eceff1] overflow-hidden">
                                <div className="p-4 flex items-center justify-between bg-[#fcfdfd]">
                                    <span className="font-bold text-xs text-[#111b21]">WEBHOOK <span className="text-[#00a884]">Payload Structure</span></span>
                                    <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-black text-[9px] uppercase">Events</span>
                                </div>
                                <div className="p-4 border-t border-[#f0f2f5]">
                                    <div className="text-[10px] text-[#54656f]">
                                        <p className="font-bold text-[#111b21] mb-1">INCOMING MESSAGE SCHEMA</p>
                                        <pre className="block bg-[#111b21] text-emerald-400 p-3 rounded font-mono leading-relaxed">
                                            {`{
  "event": "message_received",
  "data": {
    "from": "123456789@c.us",
    "body": "Hello world",
    "timestamp": 1672531200
  }
}`}
                                        </pre>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-6 text-center">
                            <p className="text-[11px] font-bold text-[#111b21] bg-white border border-[#eceff1] py-3 px-4 rounded-2xl shadow-sm">
                                Use the <code className="text-[#00a884]">x-api-key</code> to authenticate external requests.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
