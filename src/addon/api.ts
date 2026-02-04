
import { Router } from 'express'
import { webhookService } from './webhook-service'
import { store } from '../store'

export function createAddonRouter(sessions: Map<string, any>, verifyApiKey: any) {
    const router = Router()

    // 1. Send Message API
    router.post('/api/send-message', verifyApiKey, async (req: any, res: any) => {
        try {
            const { phone, message, media, caption } = req.body
            const profileId = req.apiKeyInfo.profileId

            if (!phone) {
                return res.status(400).json({ success: false, error: 'Phone is required' })
            }
            if (!message && !media) {
                return res.status(400).json({ success: false, error: 'Message or media is required' })
            }

            // Format phone
            let jid = phone.includes('@') ? phone : `${phone.replace(/\D/g, '')}@s.whatsapp.net`

            const session = sessions.get(profileId)
            if (!session || !session.sock) {
                return res.status(503).json({ success: false, error: 'WhatsApp not connected' })
            }

            let responseMsg;

            if (media) {
                // Optimization: Pass URL to Baileys instead of buffering in memory
                // 1. Try to determine type via Extension (fastest)
                // 2. Fallback to HEAD request (light)

                let type = 'document'
                let mimetype = ''

                const ext = media.split('.').pop()?.toLowerCase() || ''
                if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) type = 'image'
                else if (['mp4', 'avi', 'mov'].includes(ext)) type = 'video'
                else if (['mp3', 'wav', 'ogg'].includes(ext)) type = 'audio'
                else {
                    // Fetch HEAD to check content-type
                    try {
                        const fetch = (await import('node-fetch')).default || global.fetch
                        const headRes = await fetch(media, { method: 'HEAD' })
                        const contentType = headRes.headers.get('content-type') || ''
                        if (contentType.includes('image')) type = 'image'
                        else if (contentType.includes('video')) type = 'video'
                        else if (contentType.includes('audio')) type = 'audio'
                        mimetype = contentType
                    } catch (e) {
                        console.warn('HEAD request failed, defaulting to document', e)
                    }
                }

                const msgPayload: any = { caption: caption || '' }

                if (type === 'image') msgPayload.image = { url: media }
                else if (type === 'video') msgPayload.video = { url: media }
                else if (type === 'audio') {
                    msgPayload.audio = { url: media }
                    if (mimetype) msgPayload.mimetype = mimetype
                } else {
                    msgPayload.document = { url: media }
                    // For documents, mimetype is often required
                    msgPayload.mimetype = mimetype || 'application/octet-stream'
                }

                responseMsg = await session.sock.sendMessage(jid, msgPayload)

            } else {
                // Text message
                responseMsg = await session.sock.sendMessage(jid, { text: message })
            }

            // Trigger event
            webhookService.trigger(profileId, 'message_sent', {
                to: jid,
                message: message || 'media',
                messageId: responseMsg?.key?.id
            })

            res.json({
                success: true,
                data: {
                    messageId: responseMsg?.key?.id,
                    status: 'sent',
                    timestamp: new Date().toISOString()
                }
            })

        } catch (error: any) {
            console.error('Addon Send Error:', error)

            // Trigger failed event
            if (req.apiKeyInfo?.profileId) {
                webhookService.trigger(req.apiKeyInfo.profileId, 'message_failed', {
                    error: error.message
                })
            }

            res.status(500).json({ success: false, error: error.message })
        }
    })

    // 2. Get Message History API
    router.get('/api/messages', verifyApiKey, (req: any, res: any) => {
        try {
            const profileId = req.apiKeyInfo.profileId
            const { phone, limit = 50 } = req.query

            let messages = store.getMessages(profileId)

            if (phone) {
                const cleanPhone = phone.replace(/\D/g, '')
                messages = messages.filter((m: any) => {
                    const remoteJid = m.key.remoteJid || ''
                    return remoteJid.includes(cleanPhone)
                })
            }

            // Sort desc (newest first) or asc? Usually history is desc.
            // Messages are stored via push(), so newest last.
            // Reverse for API response?
            const sliced = messages.slice(-parseInt(limit))

            res.json({
                success: true,
                data: sliced
            })
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message })
        }
    })

    // 3. Incoming Webhook Listener (Inject info)
    router.post('/webhook/incoming', verifyApiKey, async (req: any, res: any) => {
        try {
            const profileId = req.apiKeyInfo.profileId
            const body = req.body

            // "Capture incoming messages"
            // "Sync with current chat database"
            // "Forward data to registered webhooks"

            // Construct a fake message object compliant with Baileys/Store format if possible
            // Or just store raw? Store expects Baileys proto usually.
            // Let's create a synthetic record.

            const from = body.from
            const text = body.message
            const timestamp = body.time || new Date().toISOString()

            const syntheticMsg = {
                key: {
                    remoteJid: from.includes('@') ? from : `${from.replace(/\D/g, '')}@s.whatsapp.net`,
                    fromMe: false,
                    id: `ext_${Date.now()}`
                },
                messageTimestamp: Date.parse(timestamp) / 1000,
                pushName: body.senderName || 'External',
                message: {
                    conversation: text
                }
            }

            // Sync with DB
            store.addMessage(profileId, syntheticMsg)

            // Trigger Webhook (Outgoing)
            webhookService.trigger(profileId, 'message_received', {
                ...body,
                source: 'external_webhook'
            })

            res.json({ success: true, message: 'Processed' })

        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message })
        }
    })

    // 4. Admin Settings API (Webhooks)
    // We allow either a valid API Key OR the admin password
    const checkAdminAuth = (req: any, res: any, next: any) => {
        const adminPass = req.query.adminPassword || req.body.adminPassword
        if (adminPass === 'admin123') {
            // Mock api key info for profile context if needed
            // If admin is accessing, they likely want to manage a specific profile provided in query/body
            const targetProfile = req.query.profileId || req.body.profileId || 'default'
            req.apiKeyInfo = { profileId: targetProfile }
            return next()
        }
        return verifyApiKey(req, res, next)
    }

    router.get('/admin/webhooks', checkAdminAuth, (req: any, res: any) => {
        const profileId = req.apiKeyInfo.profileId
        res.json({
            success: true,
            data: webhookService.getWebhooks(profileId)
        })
    })

    router.post('/admin/webhooks', checkAdminAuth, (req: any, res: any) => {
        const profileId = req.apiKeyInfo.profileId
        const { url, events, enabled, secret } = req.body

        if (!url || !events) {
            return res.status(400).json({ success: false, error: 'URL and events required' })
        }

        webhookService.addWebhook(profileId, {
            url,
            events,
            enabled: enabled !== false, // default true
            secret
        })

        res.json({ success: true })
    })

    router.delete('/admin/webhooks', checkAdminAuth, (req: any, res: any) => {
        const profileId = req.apiKeyInfo.profileId
        const { url } = req.body
        webhookService.removeWebhook(profileId, url)
        res.json({ success: true })
    })

    return router
}
