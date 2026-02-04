
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    downloadMediaMessage
} from './src'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import fs from 'fs'
import path from 'path'
// @ts-ignore
import QRCode from 'qrcode'
import { FlowAssistant } from './src/flow-assistant/FlowAssistant'
import * as addon from './src/addon'


import { store } from './src/store'
import { resolvePath, DATA_DIR } from './src/config'
import { supabase } from './src/supabase'

const PROFILES_FILE = resolvePath('profiles_db.json')

// Helper functions replaced by store methods


const app = express()
app.use(cors())
app.use(express.json())

const FLOWS_FILE = resolvePath('flows_db.json')
const httpServer = createServer(app)
const io = new Server(httpServer, {
    cors: { origin: '*' }
})

app.get('/', (req: any, res: any) => {
    res.send('Dashboard Server Running')
})


app.get('/api/flows', (req: any, res: any) => {
    const profileId = req.query.profileId || 'default'
    const flowFile = resolvePath(`flows_${profileId}.json`)
    const legacyFile = resolvePath('flows_db.json')

    if (fs.existsSync(flowFile)) {
        res.json(JSON.parse(fs.readFileSync(flowFile, 'utf-8')))
    } else if (profileId === 'default' && fs.existsSync(legacyFile)) {
        // Fallback for default profile if legacy file exists
        const data = JSON.parse(fs.readFileSync(legacyFile, 'utf-8'))
        fs.writeFileSync(flowFile, JSON.stringify(data, null, 2))
        res.json(data)
    } else {
        res.json({ flows: [] })
    }
})

app.post('/api/flows', (req: any, res: any) => {
    const profileId = req.query.profileId || 'default'
    const flowFile = resolvePath(`flows_${profileId}.json`)
    fs.writeFileSync(flowFile, JSON.stringify(req.body, null, 2))
    res.json({ success: true })
})

// ============================================
// API KEY AUTHENTICATION MIDDLEWARE
// API KEY AUTHENTICATION MIDDLEWARE
// ============================================
const API_KEYS_FILE = resolvePath('api_keys.json')

function loadApiKeys() {
    if (fs.existsSync(API_KEYS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(API_KEYS_FILE, 'utf-8'))
        } catch (e) {
            return {}
        }
    }
    // Default API key for testing
    return { 'default-api-key': { profileId: 'default', name: 'Default Key' } }
}

function saveApiKeys(keys: any) {
    fs.writeFileSync(API_KEYS_FILE, JSON.stringify(keys, null, 2))
}

let apiKeys = loadApiKeys()

// Middleware to verify API key
const verifyApiKey = (req: any, res: any, next: any) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey

    if (!apiKey) {
        return res.status(401).json({
            success: false,
            error: 'API key required. Provide via X-API-Key header or apiKey query parameter.'
        })
    }

    const keyInfo = apiKeys[apiKey]
    if (!keyInfo) {
        return res.status(403).json({
            success: false,
            error: 'Invalid API key'
        })
    }

    req.apiKeyInfo = keyInfo
    next()
}




// ============================================
// WEBHOOK CONFIGURATION
// WEBHOOK CONFIGURATION
// ============================================
const WEBHOOKS_FILE = resolvePath('webhooks.json')

function loadWebhooks() {
    if (fs.existsSync(WEBHOOKS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(WEBHOOKS_FILE, 'utf-8'))
        } catch (e) {
            return {}
        }
    }
    return {}
}

function saveWebhooks(webhooks: any) {
    fs.writeFileSync(WEBHOOKS_FILE, JSON.stringify(webhooks, null, 2))
}

let webhooks = loadWebhooks()

async function sendWebhook(profileId: string, event: string, data: any) {
    const webhook = webhooks[profileId]
    if (!webhook || !webhook.url) return

    try {
        const fetch = (await import('node-fetch')).default
        await fetch(webhook.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Event': event,
                'X-Profile-Id': profileId
            },
            body: JSON.stringify({
                event,
                profileId,
                timestamp: new Date().toISOString(),
                data
            })
        })
    } catch (error) {
        console.error(`Webhook error for ${profileId}:`, error)
    }
}

// ============================================
// PUBLIC API ENDPOINTS
// ============================================

// Send text message
app.post('/api/send-message', verifyApiKey, async (req: any, res: any) => {
    try {
        const { phone, message } = req.body
        const profileId = req.apiKeyInfo.profileId

        if (!phone || !message) {
            return res.status(400).json({
                success: false,
                error: 'Phone and message are required'
            })
        }

        // Format phone number
        let jid = phone.includes('@') ? phone : `${phone.replace(/\D/g, '')}@s.whatsapp.net`

        const session = sessions.get(profileId)
        if (!session || !session.sock || !session.sock.user) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp not connected. Please scan QR code first.'
            })
        }

        await session.sock.sendMessage(jid, { text: message })

        res.json({
            success: true,
            data: {
                messageId: Date.now().toString(),
                phone: jid,
                message,
                timestamp: new Date().toISOString()
            }
        })
    } catch (error: any) {
        console.error('Send message error:', error)
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to send message'
        })
    }
})

// Send image message
app.post('/api/send-image', verifyApiKey, async (req: any, res: any) => {
    try {
        const { phone, imageUrl, caption } = req.body
        const profileId = req.apiKeyInfo.profileId

        if (!phone || !imageUrl) {
            return res.status(400).json({
                success: false,
                error: 'Phone and imageUrl are required'
            })
        }

        // Format phone number
        let jid = phone.includes('@') ? phone : `${phone.replace(/\D/g, '')}@s.whatsapp.net`

        const session = sessions.get(profileId)
        if (!session || !session.sock || !session.sock.user) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp not connected. Please scan QR code first.'
            })
        }

        // Download image
        const fetch = (await import('node-fetch')).default
        const response = await fetch(imageUrl)
        const buffer = await response.buffer()

        // Send image
        await session.sock.sendMessage(jid, {
            image: buffer,
            caption: caption || ''
        })

        res.json({
            success: true,
            data: {
                messageId: Date.now().toString(),
                phone: jid,
                imageUrl,
                caption,
                timestamp: new Date().toISOString()
            }
        })
    } catch (error: any) {
        console.error('Send image error:', error)
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to send image'
        })
    }
})

// Get connection status
app.get('/api/status', verifyApiKey, (req: any, res: any) => {
    const profileId = req.apiKeyInfo.profileId
    const status = connectionStatuses.get(profileId) || 'close'
    const session = sessions.get(profileId)

    res.json({
        success: true,
        data: {
            profileId,
            status,
            connected: status === 'open',
            user: session?.sock?.user || null
        }
    })
})

// Configure webhook
app.post('/api/webhook', verifyApiKey, (req: any, res: any) => {
    const { url, events } = req.body
    const profileId = req.apiKeyInfo.profileId

    if (!url) {
        return res.status(400).json({
            success: false,
            error: 'Webhook URL is required'
        })
    }

    webhooks[profileId] = {
        url,
        events: events || ['message', 'status']
    }
    saveWebhooks(webhooks)

    res.json({
        success: true,
        data: {
            profileId,
            webhook: webhooks[profileId]
        }
    })
})

// Get webhook config
app.get('/api/webhook', verifyApiKey, (req: any, res: any) => {
    const profileId = req.apiKeyInfo.profileId
    res.json({
        success: true,
        data: webhooks[profileId] || null
    })
})

// Delete webhook
app.delete('/api/webhook', verifyApiKey, (req: any, res: any) => {
    const profileId = req.apiKeyInfo.profileId
    delete webhooks[profileId]
    saveWebhooks(webhooks)
    res.json({ success: true })
})

// API Key management endpoints
app.post('/api/admin/api-keys', (req: any, res: any) => {
    const { adminPassword, profileId, name } = req.body

    // Simple admin password (you should change this!)
    if (adminPassword !== 'admin123') {
        return res.status(403).json({ success: false, error: 'Invalid admin password' })
    }

    const apiKey = `barly_${Date.now()}_${Math.random().toString(36).substring(7)}`
    apiKeys[apiKey] = { profileId, name }
    saveApiKeys(apiKeys)

    res.json({ success: true, data: { apiKey, profileId, name } })
})

app.get('/api/admin/api-keys', (req: any, res: any) => {
    const { adminPassword } = req.query

    if (adminPassword !== 'admin123') {
        return res.status(403).json({ success: false, error: 'Invalid admin password' })
    }

    res.json({ success: true, data: apiKeys })
})

// let profilesList = store.getProfiles(PROFILES_FILE) -- REMOVED FOR SAAS
const sessions = new Map<string, any>()
app.use('/addon', addon.createAddonRouter(sessions, verifyApiKey))

const connectionStatuses = new Map<string, string>()
const qrCodes = new Map<string, string>()
const pairingCodes = new Map<string, string>()
const FLOW_ASSISTANTS = new Map<string, FlowAssistant>()
const connectionTimeouts = new Map<string, NodeJS.Timeout>()
const logger = pino({ level: 'info' })

async function startWhatsApp(profileId: string = 'default', providedUserId?: string) {
    if (!profileId || profileId === 'null') return
    if (sessions.has(profileId) && sessions.get(profileId).sock) return

    console.log(`[${profileId}] Initializing WhatsApp session...`)

    // Ensure auth directory exists for this profile
    const authDir = resolvePath(`baileys_auth_info_${profileId}`)
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true })

    const { state, saveCreds } = await useMultiFileAuthState(authDir)
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        logger,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        shouldSyncHistoryMessage: () => false,
        printQRInTerminal: false,
        browser: ['Barly WhatsApp', 'Chrome', '1.0.0'],
    })

    sessions.set(profileId, { sock, profileId })
    connectionStatuses.set(profileId, 'connecting')

    // Find owner once and keep in memory for faster emits
    let ownerId: string | null = providedUserId || null
    if (!ownerId) {
        const { data: profile } = await supabase.from('profiles').select('user_id').eq('id', profileId).single()
        if (profile) ownerId = profile.user_id
    }
    console.log(`[${profileId}] Session initialized. Owner ID: ${ownerId || 'UNKNOWN'}`)

    const flowAssistant = new FlowAssistant(sock, profileId)
    FLOW_ASSISTANTS.set(profileId, flowAssistant)

    sock.ev.process(async (events) => {
        addon.handleEvents(profileId, events)
        if (events['connection.update']) {
            const update = events['connection.update']
            const { connection, lastDisconnect, qr } = update

            if (qr) {
                console.log(`[${profileId}] QR Code received, emitting to ${ownerId}`)
                const qrDataURL = await QRCode.toDataURL(qr)
                qrCodes.set(profileId, qrDataURL)
                if (ownerId) io.to(ownerId).emit('qr.update', { profileId, qr: qrDataURL })
            }

            if ((update as any).pairingCode) {
                const code = (update as any).pairingCode
                console.log(`[${profileId}] Pairing code generated: ${code}`)
                pairingCodes.set(profileId, code)
                if (ownerId) io.to(ownerId).emit('pairing.code', { profileId, code })
            }

            if (connection) {
                connectionStatuses.set(profileId, connection)
                console.log(`[${profileId}] Connection status: ${connection} (Room: ${ownerId})`)
                if (ownerId) io.to(ownerId).emit('connection.update', { profileId, connection })
                sendWebhook(profileId, 'status', { status: connection })

                if (connection === 'open') {
                    qrCodes.delete(profileId)
                    pairingCodes.delete(profileId)
                    if (connectionTimeouts.has(profileId)) {
                        clearTimeout(connectionTimeouts.get(profileId))
                        connectionTimeouts.delete(profileId)
                    }
                } else if (connection === 'connecting') {
                    if (connectionTimeouts.has(profileId)) clearTimeout(connectionTimeouts.get(profileId))
                    const timeout = setTimeout(() => {
                        console.log(`[${profileId}] Connection timed out. Resetting...`)
                        const authDir = resolvePath(`baileys_auth_info_${profileId}`)
                        if (fs.existsSync(authDir)) {
                            fs.rmSync(authDir, { recursive: true, force: true })
                        }
                        const session = sessions.get(profileId)
                        if (session?.sock) {
                            try { session.sock.end(undefined) } catch (e) { }
                        }
                        sessions.delete(profileId)
                        startWhatsApp(profileId)
                    }, 30000)
                    connectionTimeouts.set(profileId, timeout)
                }
            }

            if (connection === 'close') {
                if (connectionTimeouts.has(profileId)) {
                    clearTimeout(connectionTimeouts.get(profileId))
                    connectionTimeouts.delete(profileId)
                }
                const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
                if (shouldReconnect) {
                    console.log(`[${profileId}] Reconnecting...`)
                    sessions.delete(profileId)
                    setTimeout(() => startWhatsApp(profileId), 5000)
                } else {
                    console.log(`[${profileId}] Logged out. Cleaning up...`)
                    sessions.delete(profileId)
                    if (fs.existsSync(authDir)) {
                        fs.rmSync(authDir, { recursive: true, force: true })
                    }
                    setTimeout(() => startWhatsApp(profileId), 2000)
                }
            }
        }

        if (events['creds.update']) {
            await saveCreds()
        }

        if (events['contacts.update']) {
            const contacts = store.getContacts(profileId)
            events['contacts.update'].forEach(c => {
                if (c.id) contacts[c.id] = c.name || c.notify || contacts[c.id]
            })
            store.saveContacts(profileId, contacts)
            io.emit('contacts.update', { profileId, contacts: events['contacts.update'] })
        }

        if (events['messages.upsert']) {
            const upsert = events['messages.upsert']
            upsert.messages.forEach(async msg => {
                const jid = msg.key.remoteJid
                if (!jid) return

                store.addMessage(profileId, msg)

                // Unread notification logic
                if (!msg.key.fromMe) {
                    const { data: profile } = await supabase.from('profiles').select('*').eq('id', profileId).single()
                    if (profile) {
                        const newCount = (profile.unreadCount || 0) + 1
                        await supabase.from('profiles').update({ unreadCount: newCount }).eq('id', profileId)
                        // Refresh user's profiles
                        const { data: userProfiles } = await supabase.from('profiles').select('*').eq('user_id', profile.user_id)
                        io.to(profile.user_id).emit('profiles.update', userProfiles)
                    }
                }

                const contacts = store.getContacts(profileId)
                if (msg.pushName && !contacts[jid]) {
                    contacts[jid] = msg.pushName
                    store.saveContacts(profileId, contacts)
                    const { data: profile } = await supabase.from('profiles').select('user_id').eq('id', profileId).single()
                    if (profile) io.to(profile.user_id).emit('contacts.update', { profileId, contacts: [{ id: jid, name: msg.pushName }] })
                }

                if (!msg.key.fromMe) {
                    sendWebhook(profileId, 'message', {
                        message: msg,
                        sender: {
                            jid,
                            name: contacts[jid] || msg.pushName || null
                        }
                    })
                }

                const assistant = FLOW_ASSISTANTS.get(profileId)
                // Only process if it's not from me, assistant exists, and NOT a group message
                if (!msg.key.fromMe && assistant && !jid.endsWith('@g.us')) {
                    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''
                    if (text) await assistant.handleMessage(jid, text)
                }
            })
            const { data: profile } = await supabase.from('profiles').select('user_id').eq('id', profileId).single()
            if (profile) io.to(profile.user_id).emit('messages.upsert', { profileId, ...upsert })
        }
    })
    return sock
}

// Auth Middleware for Socket.io
io.use(async (socket, next) => {
    try {
        const token = (socket.handshake.auth as any).token
        if (!token) return next(new Error('Authentication error: Token missing'))

        const { data: { user }, error } = await supabase.auth.getUser(token)
        if (error || !user) return next(new Error('Authentication error: Invalid session'))

        socket.data.user = user
        next()
    } catch (e) {
        next(new Error('Internal auth error'))
    }
})

io.on('connection', async (socket) => {
    const userId = socket.data.user.id
    console.log(`User connected: ${socket.data.user.email} (${userId})`)

    // Join user-specific room for private emits
    socket.join(userId)

    // Send initial profiles for this user
    const { data: userProfiles, error: fetchError } = await supabase.from('profiles').select('*').eq('user_id', userId).order('created_at', { ascending: true })
    if (fetchError) console.error(`[${userId}] Profile fetch error:`, fetchError.message)
    socket.emit('profiles.update', userProfiles || [])

    socket.on('switchProfile', async (profileId) => {
        if (!profileId) return

        // Auto-boot session if it died or server restarted
        if (!sessions.has(profileId)) {
            console.log(`[${userId}] Profile ${profileId} not running. Starting WhatsApp...`)
            startWhatsApp(profileId, userId)
        }

        const contacts = store.getContacts(profileId)
        socket.emit('connection.update', { profileId, connection: connectionStatuses.get(profileId) || 'close' })
        if (qrCodes.has(profileId)) {
            socket.emit('qr.update', { profileId, qr: qrCodes.get(profileId) })
        }
        if (pairingCodes.has(profileId)) {
            socket.emit('pairing.code', { profileId, code: pairingCodes.get(profileId) })
        }
        socket.emit('contacts.update', { profileId, contacts: Object.entries(contacts).map(([id, name]) => ({ id, name })) })
        socket.emit('messages.history', { profileId, messages: store.getMessages(profileId) })

        // Reset unread for this profile when switched to
        await supabase.from('profiles').update({ unreadCount: 0 }).eq('id', profileId).eq('user_id', userId)
        const { data: refreshed } = await supabase.from('profiles').select('*').eq('user_id', userId).order('created_at', { ascending: true })
        io.to(userId).emit('profiles.update', refreshed || [])
    })

    socket.on('addProfile', async (name) => {
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            socket.emit('profile.error', { message: 'CRITICAL: SUPABASE_SERVICE_ROLE_KEY is missing in .env! Backend cannot save bot data.' })
            return
        }
        const id = `profile-${Date.now()}`
        console.log(`[${userId}] Creating new profile: ${name} (${id})`)

        const { data: newProfile, error } = await supabase.from('profiles').insert({
            id,
            user_id: userId,
            name,
            unreadCount: 0
        }).select().single()

        if (error) {
            console.error('Add profile database error:', error)
            socket.emit('profile.error', { message: 'Failed to save profile to database. Check SQL setup.' })
            return
        }

        console.log(`[${userId}] Profile saved to DB, refreshing list...`)
        const { data: refreshed } = await supabase.from('profiles').select('*').eq('user_id', userId).order('created_at', { ascending: true })
        io.to(userId).emit('profiles.update', refreshed)

        console.log(`[${userId}] Starting WhatsApp session for ${id}`)
        startWhatsApp(id, userId)
        socket.emit('profile.added', id)
    })

    socket.on('updateProfileName', async ({ profileId, name }) => {
        await supabase.from('profiles').update({ name }).eq('id', profileId).eq('user_id', userId)
        const { data: refreshed } = await supabase.from('profiles').select('*').eq('user_id', userId).order('created_at', { ascending: true })
        io.to(userId).emit('profiles.update', refreshed)
    })

    socket.on('deleteProfile', async (profileId: string) => {
        // Security check: ensure user owns profile
        const { data: check } = await supabase.from('profiles').select('id').eq('id', profileId).eq('user_id', userId).single()
        if (!check) return

        // 1. Delete from Supabase
        await supabase.from('profiles').delete().eq('id', profileId)

        // 2. Terminate session
        const session = sessions.get(profileId)
        if (session && session.sock) {
            try { session.sock.end(undefined) } catch (e) { }
            sessions.delete(profileId)
        }

        // 3. Clean up files
        const authDir = resolvePath(`baileys_auth_info_${profileId}`)
        if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true })
        store.deleteProfileData(profileId)
        if (fs.existsSync(resolvePath(`flows_${profileId}.json`))) fs.unlinkSync(resolvePath(`flows_${profileId}.json`))
        if (fs.existsSync(resolvePath(`sessions_${profileId}.json`))) fs.unlinkSync(resolvePath(`sessions_${profileId}.json`))

        const { data: refreshed } = await supabase.from('profiles').select('*').eq('user_id', userId).order('created_at', { ascending: true })
        io.to(userId).emit('profiles.update', refreshed || [])
    })

    socket.on('logout', async (profileId) => {
        const session = sessions.get(profileId)
        if (session && session.sock) {
            try { await session.sock.logout() } catch (e) { }
            sessions.delete(profileId)
            connectionStatuses.set(profileId, 'close')
            io.to(userId).emit('connection.update', { profileId, connection: 'close' })
        }
    })

    socket.on('refreshQR', async (profileId) => {
        const session = sessions.get(profileId)
        if (session && session.sock) {
            try { session.sock.end(new Error('Manual refresh')) } catch (e) { }
            sessions.delete(profileId)
        }
        const authDir = resolvePath(`baileys_auth_info_${profileId}`)
        if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true })
        }
        startWhatsApp(profileId)
    })

    socket.on('requestPairingCode', async ({ profileId, phoneNumber }) => {
        const session = sessions.get(profileId)
        if (session && session.sock) {
            try {
                // Format phone number (remove any non-digits)
                const cleanNumber = phoneNumber.replace(/\D/g, '')
                console.log(`[${profileId}] Requesting pairing code for: ${cleanNumber}`)

                // Request pairing code from Baileys
                const code = await session.sock.requestPairingCode(cleanNumber)
                pairingCodes.set(profileId, code)
                console.log(`[${profileId}] Pairing code generated: ${code}`)
                io.to(userId).emit('pairing.code', { profileId, code })
            } catch (error) {
                console.error(`[${profileId}] Failed to request pairing code:`, error)
                socket.emit('pairing.error', { profileId, error: 'Failed to generate pairing code' })
            }
        } else {
            socket.emit('pairing.error', { profileId, error: 'Session not available' })
        }
    })

    socket.on('sendMessage', async (data) => {
        let { profileId, jid, text } = data
        if (!jid.includes('@')) jid = `${jid}@s.whatsapp.net`

        const session = sessions.get(profileId)
        if (session && session.sock && session.sock.user) {
            await session.sock.sendMessage(jid, { text })
        }
    })

    socket.on('downloadMedia', async (data) => {
        const { profileId, message } = data
        const session = sessions.get(profileId)
        if (session && session.sock) {
            try {
                const buffer = await downloadMediaMessage(message, 'buffer', {}, { logger, reuploadRequest: session.sock.reuploadRequest })
                socket.emit('mediaDownloaded', { messageId: message.key.id, data: buffer.toString('base64'), mimetype: message.message.imageMessage?.mimetype || message.message.documentMessage?.mimetype || 'application/octet-stream' })
            } catch (error) {
                console.error('Error downloading media:', error)
            }
        }
    })

    // ============================================
    // SUPER ADMIN HANDLERS
    // ============================================

    socket.on('admin.getStats', async () => {
        // Verify role in user_roles table
        const { data: userRole } = await supabase.from('user_roles').select('role').eq('user_id', userId).single()
        if (userRole?.role !== 'admin') {
            console.warn(`Unauthorized admin access attempt by ${socket.data.user.email}`)
            return
        }

        // Fetch all profiles
        const { data: allProfiles } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })

        const enriched = (allProfiles || []).map(p => ({
            ...p,
            status: connectionStatuses.get(p.id) || 'close',
            // In a real prod setup, you'd store email in a public profiles/user_meta table
            user_email: 'User ' + p.user_id.substring(0, 8)
        }))

        socket.emit('admin.statsUpdate', enriched)
    })

    socket.on('admin.profileAction', async ({ type, profileId }) => {
        const { data: userRole } = await supabase.from('user_roles').select('role').eq('user_id', userId).single()
        if (userRole?.role !== 'admin') return

        if (type === 'logout') {
            const session = sessions.get(profileId)
            if (session?.sock) {
                try { await session.sock.logout() } catch (e) { }
                sessions.delete(profileId)
                connectionStatuses.set(profileId, 'close')
            }
        } else if (type === 'delete') {
            // Security: Delete from DB
            await supabase.from('profiles').delete().eq('id', profileId)

            // Terminate session
            const session = sessions.get(profileId)
            if (session?.sock) {
                try { session.sock.end(undefined) } catch (e) { }
                sessions.delete(profileId)
            }

            // Cleanup files
            const authDir = resolvePath(`baileys_auth_info_${profileId}`)
            if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true })
            store.deleteProfileData(profileId)
            if (fs.existsSync(resolvePath(`flows_${profileId}.json`))) fs.unlinkSync(resolvePath(`flows_${profileId}.json`))
            if (fs.existsSync(resolvePath(`sessions_${profileId}.json`))) fs.unlinkSync(resolvePath(`sessions_${profileId}.json`))
        }

        // Refresh admin stats for all admins
        // We'll just refresh for the current socket for simplicity
        socket.emit('admin.getStats')
    })
})

// Serve Frontend (Deployment Support)
const frontendPath = path.join(process.cwd(), 'dashboard/dist')
if (fs.existsSync(frontendPath)) {
    console.log('Serving frontend from:', frontendPath)
    app.use(express.static(frontendPath))
    app.get('*', (req: any, res: any) => {
        // Skip API/Socket paths to avoid HTML response on 404s
        if (req.path.startsWith('/api') || req.path.startsWith('/addon') || req.path.startsWith('/socket.io')) {
            return res.status(404).json({ error: 'Not Found' })
        }
        res.sendFile(path.join(frontendPath, 'index.html'))
    })
}

const PORT = 3001
httpServer.listen(PORT, async () => {
    console.log(`Dashboard Server listening on port ${PORT}`)

    // Start only active profiles if you have a service key, 
    // otherwise they start when a user logs in.
    // For SaaS, we usually want to boot all sessions if possible.
    const { data: allProfiles } = await supabase.from('profiles').select('id, user_id')
    if (allProfiles) {
        console.log(`Booting ${allProfiles.length} WhatsApp sessions...`)
        allProfiles.forEach(p => startWhatsApp(p.id, p.user_id))
    }
})
