
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

const CONTACTS_FILE = './contacts_db.json'

function loadContacts() {
    if (fs.existsSync(CONTACTS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf-8'))
        } catch (e) {
            return {}
        }
    }
    return {}
}

function saveContacts(contacts: any) {
    fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2))
}

let storedContacts = loadContacts()
const app = express()
app.use(cors())
const httpServer = createServer(app)
const io = new Server(httpServer, {
    cors: { origin: '*' }
})

const logger = pino({ level: 'info' })

let sockInstance: any = null
let connectionStatus: string = 'close'
let isStarting = false

async function startWhatsApp() {
    if (isStarting) return
    isStarting = true

    try {
        const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info')
        const { version } = await fetchLatestBaileysVersion()

        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            logger,
        })

        sockInstance = sock

        sock.ev.process(async (events) => {
            if (events['connection.update']) {
                const update = events['connection.update']
                const { connection, lastDisconnect, qr } = update

                if (qr) {
                    console.log('QR Code generated, emitting to clients...')
                    const qrDataURL = await QRCode.toDataURL(qr)
                    io.emit('qr', qrDataURL)
                }

                if (connection) {
                    connectionStatus = connection
                    console.log(`Connection status: ${connection}`)
                    io.emit('connection.update', { connection })
                    if (connection === 'open') {
                        isStarting = false
                    }
                }

                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
                    if (shouldReconnect) {
                        console.log('Reconnecting in 5s...')
                        isStarting = false
                        setTimeout(() => startWhatsApp(), 5000)
                    } else {
                        sockInstance = null
                        isStarting = false
                    }
                }
            }

            if (events['creds.update']) {
                await saveCreds()
            }

            if (events['messaging-history.set']) {
                const { contacts, messages } = events['messaging-history.set']
                contacts?.forEach(c => {
                    if (c.id) storedContacts[c.id] = c.name || c.notify || storedContacts[c.id]
                })
                saveContacts(storedContacts)
                io.emit('contacts.update', Object.entries(storedContacts).map(([id, name]) => ({ id, name })))
                io.emit('messaging-history.set', events['messaging-history.set'])
            }

            if (events['contacts.update']) {
                events['contacts.update'].forEach(c => {
                    if (c.id) storedContacts[c.id] = c.name || c.notify || storedContacts[c.id]
                })
                saveContacts(storedContacts)
                io.emit('contacts.update', events['contacts.update'])
            }

            if (events['messages.upsert']) {
                const upsert = events['messages.upsert']
                upsert.messages.forEach(msg => {
                    const jid = msg.key.remoteJid
                    if (jid && msg.pushName && !storedContacts[jid]) {
                        storedContacts[jid] = msg.pushName
                        saveContacts(storedContacts)
                        io.emit('contacts.update', [{ id: jid, name: msg.pushName }])
                    }
                })
                io.emit('messages.upsert', upsert)
            }
        })

        return sock
    } catch (err) {
        console.error('Failed to start WhatsApp:', err)
        isStarting = false
        setTimeout(() => startWhatsApp(), 5000)
        return null
    }
}

io.on('connection', async (socket) => {
    console.log('Client connected')

    // Send current status
    socket.emit('connection.update', { connection: connectionStatus })
    socket.emit('contacts.update', Object.entries(storedContacts).map(([id, name]) => ({ id, name })))

    if (!sockInstance && !isStarting) {
        startWhatsApp()
    }

    socket.on('logout', async () => {
        if (sockInstance) {
            await sockInstance.logout()
            sockInstance = null
            connectionStatus = 'close'
            io.emit('connection.update', { connection: 'close' })
        }
    })

    socket.on('sendMessage', async (data) => {
        const { jid, text } = data
        if (sockInstance && sockInstance.user) {
            await sockInstance.sendMessage(jid, { text })
        }
    })

    socket.on('downloadMedia', async (message) => {
        if (sockInstance) {
            try {
                const buffer = await downloadMediaMessage(message, 'buffer', {}, { logger, reuploadRequest: sockInstance.reuploadRequest })
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
})
