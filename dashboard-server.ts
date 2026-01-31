
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
// @ts-ignore
import QRCode from 'qrcode'
import { FlowAssistant } from './src/flow-assistant/FlowAssistant'

const PROFILES_FILE = './profiles_db.json'

function loadProfiles() {
    if (fs.existsSync(PROFILES_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf-8'))
        } catch (e) {
            return []
        }
    }
    return [{ id: 'default', name: 'Default Profile', unreadCount: 0 }]
}

function saveProfiles(profiles: any[]) {
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2))
}

function loadContacts(profileId: string) {
    const file = `./contacts_${profileId}.json`
    if (fs.existsSync(file)) {
        try {
            return JSON.parse(fs.readFileSync(file, 'utf-8'))
        } catch (e) {
            return {}
        }
    }
    return {}
}

function saveContacts(profileId: string, contacts: any) {
    fs.writeFileSync(`./contacts_${profileId}.json`, JSON.stringify(contacts, null, 2))
}

function loadMessages(profileId: string) {
    const file = `./messages_${profileId}.json`
    if (fs.existsSync(file)) {
        try {
            return JSON.parse(fs.readFileSync(file, 'utf-8'))
        } catch (e) {
            return []
        }
    }
    return []
}

function saveMessage(profileId: string, message: any) {
    const messages = loadMessages(profileId)
    messages.push(message)
    if (messages.length > 1000) messages.shift()
    fs.writeFileSync(`./messages_${profileId}.json`, JSON.stringify(messages, null, 2))
}

const app = express()
app.use(cors())
app.use(express.json())

const FLOWS_FILE = './flows_db.json'
const httpServer = createServer(app)
const io = new Server(httpServer, {
    cors: { origin: '*' }
})

app.get('/api/flows', (req: any, res: any) => {
    const profileId = req.query.profileId || 'default'
    const flowFile = `./flows_${profileId}.json`
    const legacyFile = './flows_db.json'

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
    const flowFile = `./flows_${profileId}.json`
    fs.writeFileSync(flowFile, JSON.stringify(req.body, null, 2))
    res.json({ success: true })
})

// ============================================
// API KEY AUTHENTICATION MIDDLEWARE
// ============================================
const API_KEYS_FILE = './api_keys.json'

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
// ============================================
const WEBHOOKS_FILE = './webhooks.json'

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

let profilesList = loadProfiles()
const sessions = new Map<string, any>()
const connectionStatuses = new Map<string, string>()
const qrCodes = new Map<string, string>()
const pairingCodes = new Map<string, string>()
const FLOW_ASSISTANTS = new Map<string, FlowAssistant>()
const connectionTimeouts = new Map<string, NodeJS.Timeout>()
const logger = pino({ level: 'info' })

async function startWhatsApp(profileId: string = 'default') {
    if (sessions.has(profileId) && sessions.get(profileId).sock) return

    // Ensure auth directory exists for this profile
    const authDir = `baileys_auth_info_${profileId}`
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

    const flowAssistant = new FlowAssistant(sock, profileId)
    FLOW_ASSISTANTS.set(profileId, flowAssistant)

    sock.ev.process(async (events) => {
        if (events['connection.update']) {
            const update = events['connection.update']
            const { connection, lastDisconnect, qr } = update

            if (qr) {
                const qrDataURL = await QRCode.toDataURL(qr)
                qrCodes.set(profileId, qrDataURL)
                io.emit('qr.update', { profileId, qr: qrDataURL })
            }


            // Emit pairing code if available
            if ((update as any).pairingCode) {
                const code = (update as any).pairingCode
                pairingCodes.set(profileId, code)
                console.log(`[${profileId}] Pairing code: ${code}`)
                io.emit('pairing.code', { profileId, code })
            }

            if (connection) {
                connectionStatuses.set(profileId, connection)
                console.log(`[${profileId}] Connection status: ${connection}`)
                io.emit('connection.update', { profileId, connection })
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
                        const authDir = `baileys_auth_info_${profileId}`
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
            const contacts = loadContacts(profileId)
            events['contacts.update'].forEach(c => {
                if (c.id) contacts[c.id] = c.name || c.notify || contacts[c.id]
            })
            saveContacts(profileId, contacts)
            io.emit('contacts.update', { profileId, contacts: events['contacts.update'] })
        }

        if (events['messages.upsert']) {
            const upsert = events['messages.upsert']
            upsert.messages.forEach(async msg => {
                const jid = msg.key.remoteJid
                if (!jid) return

                saveMessage(profileId, msg)

                // Unread notification logic
                if (!msg.key.fromMe) {
                    const profile = profilesList.find((p: any) => p.id === profileId)
                    if (profile) {
                        profile.unreadCount = (profile.unreadCount || 0) + 1
                        saveProfiles(profilesList)
                        io.emit('profiles.update', profilesList)
                    }
                }

                const contacts = loadContacts(profileId)
                if (msg.pushName && !contacts[jid]) {
                    contacts[jid] = msg.pushName
                    saveContacts(profileId, contacts)
                    io.emit('contacts.update', { profileId, contacts: [{ id: jid, name: msg.pushName }] })
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
                if (!msg.key.fromMe && assistant) {
                    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''
                    if (text) await assistant.handleMessage(jid, text)
                }
            })
            io.emit('messages.upsert', { profileId, ...upsert })
        }
    })
    return sock
}

io.on('connection', async (socket) => {
    console.log('Client connected')

    socket.emit('profiles.update', profilesList)

    socket.on('switchProfile', (profileId) => {
        const contacts = loadContacts(profileId)
        socket.emit('connection.update', { profileId, connection: connectionStatuses.get(profileId) || 'close' })
        if (qrCodes.has(profileId)) {
            socket.emit('qr.update', { profileId, qr: qrCodes.get(profileId) })
        }
        if (pairingCodes.has(profileId)) {
            socket.emit('pairing.code', { profileId, code: pairingCodes.get(profileId) })
        }
        socket.emit('contacts.update', { profileId, contacts: Object.entries(contacts).map(([id, name]) => ({ id, name })) })
        socket.emit('messages.history', { profileId, messages: loadMessages(profileId) })

        // Reset unread for this profile when switched to
        const profile = profilesList.find((p: any) => p.id === profileId)
        if (profile) {
            profile.unreadCount = 0
            saveProfiles(profilesList)
            io.emit('profiles.update', profilesList)
        }
    })

    socket.on('addProfile', (name) => {
        const id = `profile-${Date.now()}`
        profilesList.push({ id, name, unreadCount: 0 })
        saveProfiles(profilesList)
        io.emit('profiles.update', profilesList)
        startWhatsApp(id)
        socket.emit('profile.added', id) // Tell the specific client the new ID
    })

    socket.on('updateProfileName', ({ profileId, name }) => {
        const profile = profilesList.find((p: any) => p.id === profileId)
        if (profile) {
            profile.name = name
            saveProfiles(profilesList)
            io.emit('profiles.update', profilesList)
        }
    })

    socket.on('deleteProfile', async (profileId: string) => {
        // 1. Revert from profiles list
        profilesList = profilesList.filter((p: any) => p.id !== profileId)
        saveProfiles(profilesList)

        // 2. Terminate session
        const session = sessions.get(profileId)
        if (session && session.sock) {
            try { session.sock.end(undefined) } catch (e) { }
            sessions.delete(profileId)
        }

        // 3. Clean up files
        const authDir = `baileys_auth_info_${profileId}`
        if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true })
        if (fs.existsSync(`./contacts_${profileId}.json`)) fs.unlinkSync(`./contacts_${profileId}.json`)
        if (fs.existsSync(`./messages_${profileId}.json`)) fs.unlinkSync(`./messages_${profileId}.json`)
        if (fs.existsSync(`./flows_${profileId}.json`)) fs.unlinkSync(`./flows_${profileId}.json`)
        if (fs.existsSync(`./sessions_${profileId}.json`)) fs.unlinkSync(`./sessions_${profileId}.json`)

        io.emit('profiles.update', profilesList)
    })

    socket.on('logout', async (profileId) => {
        const session = sessions.get(profileId)
        if (session && session.sock) {
            try { await session.sock.logout() } catch (e) { }
            sessions.delete(profileId)
            connectionStatuses.set(profileId, 'close')
            io.emit('connection.update', { profileId, connection: 'close' })
        }
    })

    socket.on('refreshQR', async (profileId) => {
        const session = sessions.get(profileId)
        if (session && session.sock) {
            try { session.sock.end(new Error('Manual refresh')) } catch (e) { }
            sessions.delete(profileId)
        }
        const authDir = `baileys_auth_info_${profileId}`
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
                io.emit('pairing.code', { profileId, code })
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
})

const PORT = 3001
httpServer.listen(PORT, () => {
    console.log(`Dashboard Server listening on port ${PORT}`)
    profilesList.forEach((p: any) => {
        startWhatsApp(p.id)
    })
})
