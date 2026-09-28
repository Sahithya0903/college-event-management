import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Event from './models/Event.js'
import Registration from './models/Registration.js'
import { connectDatabase } from './config/database.js'
import { events } from './data/events.js'
import { registrations } from './data/registrations.js'
const app = express()
const port = process.env.PORT || 5000
const clientOrigin = process.env.CLIENT_ORIGIN || ''
const apiTokenSecret = process.env.ORGANIZER_TOKEN_SECRET || ''
const uploadsDirectory = fileURLToPath(new URL('../uploads/', import.meta.url))
let databaseConnected = false

// Let our React website (running on port 5173) read responses from this API.
app.use(cors({ origin(origin, callback) {
  if (!origin) return callback(null, true)
  let url
  try { url = new URL(origin) } catch { return callback(null, false) }
  const localHost = ['localhost', '127.0.0.1'].includes(url.hostname)
  const lanHost = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/.test(url.hostname)
  const developmentOrigin = (localHost || lanHost) && ['5173', '4173'].includes(url.port)
  callback(null, developmentOrigin || origin === clientOrigin)
} }))
// This lets Express read JSON sent in a request body.
// Base64 encoding makes an image about one third larger in the JSON request.
app.use(express.json({ limit: '15mb' }))
app.use('/uploads', express.static(uploadsDirectory))
// A route is an address where the server responds to a request.
function formatEvent(event) {
  const savedEvent = typeof event.toObject === 'function' ? event.toObject() : event
  return { ...savedEvent, id: savedEvent._id ? savedEvent._id.toString() : savedEvent.id }
}

function signOrganizerToken(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', apiTokenSecret).update(encodedPayload).digest('base64url')
  return `${encodedPayload}.${signature}`
}

function isOrganizerAuthorized(request) {
  if (!apiTokenSecret) return false
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return false
  const [encodedPayload, suppliedSignature, extra] = token.split('.')
  if (!encodedPayload || !suppliedSignature || extra) return false
  const expectedSignature = createHmac('sha256', apiTokenSecret).update(encodedPayload).digest()
  let actualSignature
  try { actualSignature = Buffer.from(suppliedSignature, 'base64url') } catch { return false }
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) return false
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString())
    return payload.role === 'organizer' && Number(payload.expiresAt) > Date.now()
  } catch { return false }
}

app.post('/api/organizer/login', (request, response) => {
  const expectedUsername = process.env.ORGANIZER_USERNAME || ''
  const expectedPassword = process.env.ORGANIZER_PASSWORD || ''
  const { username, password } = request.body
  if (!expectedUsername || !expectedPassword || !apiTokenSecret) {
    return response.status(503).json({ message: 'Organizer login is not configured yet. Add the organizer settings to server/.env and restart the API.' })
  }
  const usernameMatches = typeof username === 'string' && username === expectedUsername
  const passwordMatches = typeof password === 'string' && password === expectedPassword
  if (!usernameMatches || !passwordMatches) return response.status(401).json({ message: 'Username or password is incorrect.' })
  const token = signOrganizerToken({ role: 'organizer', expiresAt: Date.now() + 8 * 60 * 60 * 1000 })
  return response.json({ token, expiresInHours: 8 })
})

app.post('/api/organizer/check-in', async (request, response) => {
  if (!isOrganizerAuthorized(request)) return response.status(401).json({ message: 'Please sign in as an organiser before checking in tickets.' })
  const ticketCode = typeof request.body.ticketCode === 'string' ? request.body.ticketCode.trim() : ''
  if (!ticketCode || ticketCode.length > 80) return response.status(400).json({ message: 'Scan a valid event ticket QR code.' })

  if (databaseConnected) {
    try {
      const registration = await Registration.findOneAndUpdate(
        { ticketCode, checkedInAt: null },
        { $set: { checkedInAt: new Date() } },
        { new: true },
      )
      if (registration) return response.json({ message: `${registration.studentName} checked in successfully.`, studentName: registration.studentName, eventName: registration.eventName })
      const existing = await Registration.findOne({ ticketCode })
      if (!existing) return response.status(404).json({ message: 'This ticket was not found. Check that it belongs to this event system.' })
      return response.status(409).json({ message: `This ticket was already checked in${existing.checkedInAt ? ` at ${new Date(existing.checkedInAt).toLocaleString()}` : ''}.`, studentName: existing.studentName, eventName: existing.eventName })
    } catch (error) {
      console.error('Could not check in ticket:', error.message)
      return response.status(500).json({ message: 'Could not check in this ticket.' })
    }
  }

  const registration = registrations.find((item) => item.ticketCode === ticketCode)
  if (!registration) return response.status(404).json({ message: 'This ticket was not found. Check that it belongs to this event system.' })
  if (registration.checkedInAt) return response.status(409).json({ message: 'This ticket was already checked in.', studentName: registration.studentName, eventName: registration.eventName })
  registration.checkedInAt = new Date().toISOString()
  return response.json({ message: `${registration.studentName} checked in successfully.`, studentName: registration.studentName, eventName: registration.eventName })
})

app.get('/api/events', async (request, response) => {
  if (!databaseConnected) return response.json(events)

  try {
    const savedEvents = await Event.find().sort({ createdAt: -1 })
    response.json(savedEvents.map(formatEvent))
  } catch (error) {
    console.error('Could not read events from MongoDB:', error.message)
    response.status(500).json({ message: 'Could not load events from the database.' })
  }
})

app.post('/api/events', async (request, response) => {
  if (!isOrganizerAuthorized(request)) {
    return response.status(401).json({ message: 'Please sign in as an organiser before creating events.' })
  }
  const { name, type, date, time, place, description, capacity, posterData = '' } = request.body

  const fieldsAreFilled = [name, type, date, time, place, description]
    .every((value) => typeof value === 'string' && value.trim())
  const dateIsValid = typeof date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && !Number.isNaN(Date.parse(`${date}T00:00:00Z`))
  const capacityNumber = Number(capacity)
  const capacityIsValid = Number.isInteger(capacityNumber) && capacityNumber >= 1 && capacityNumber <= 5000

  if (!fieldsAreFilled || !dateIsValid || !capacityIsValid) {
    return response.status(400).json({ message: 'Fill in every event field and choose a seat limit between 1 and 5000.' })
  }

  let posterUrl = ''
  if (posterData) {
    const posterMatch = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(posterData)
    if (!posterMatch) {
      return response.status(400).json({ message: 'Choose a PNG, JPG, or WebP poster image.' })
    }

    const posterBuffer = Buffer.from(posterMatch[2], 'base64')
    if (posterBuffer.length === 0 || posterBuffer.length > 10 * 1024 * 1024) {
      return response.status(400).json({ message: 'The poster must be smaller than 10 MB.' })
    }

    const extensionByType = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
    const posterFilename = `${randomUUID()}.${extensionByType[posterMatch[1]]}`
    try {
      await mkdir(uploadsDirectory, { recursive: true })
      await writeFile(join(uploadsDirectory, posterFilename), posterBuffer, { flag: 'wx' })
      posterUrl = `/uploads/${posterFilename}`
    } catch (error) {
      console.error('Could not save event poster:', error.message)
      return response.status(500).json({ message: 'Could not save the event poster.' })
    }
  }

  const dateLabel = new Intl.DateTimeFormat('en', {
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`)).toUpperCase()

  const newEvent = {
    id: Date.now(),
    name: name.trim(),
    type: type.trim().toUpperCase(),
    date,
    dateLabel,
    time: time.trim(),
    place: place.trim(),
    description: description.trim(),
    capacity: capacityNumber,
    color: 'mint',
    symbol: '✦',
    posterUrl,
  }

  if (databaseConnected) {
    try {
      const { id, ...eventFields } = newEvent
      const savedEvent = await Event.create(eventFields)
      return response.status(201).json(formatEvent(savedEvent))
    } catch (error) {
      console.error('Could not save event to MongoDB:', error.message)
      return response.status(500).json({ message: 'Could not save the event to the database.' })
    }
  }

  events.unshift(newEvent)
  response.status(201).json(newEvent)
})

app.post('/api/events/:eventId/register', async (request, response) => {
  const { studentName, rollNumber } = request.body
  const nameIsValid = typeof studentName === 'string' && studentName.trim()
  const rollNumberIsValid = typeof rollNumber === 'string'
    && /^[A-Z0-9/-]{1,30}$/i.test(rollNumber.trim())

  if (!nameIsValid || !rollNumberIsValid) {
    return response.status(400).json({ message: 'Enter your name and a valid roll number (letters, numbers, hyphens, or slashes).' })
  }

  const normalizedRollNumber = rollNumber.trim().toUpperCase()

  if (databaseConnected) {
    try {
      const event = await Event.findById(request.params.eventId)
      if (!event) return response.status(404).json({ message: 'This event could not be found.' })

      const eventId = event._id.toString()
      const existingRegistration = await Registration.exists({ eventId, rollNumber: normalizedRollNumber })
      if (existingRegistration) {
        return response.status(409).json({ message: 'That roll number is already registered for this event.' })
      }

      const registrationCount = await Registration.countDocuments({ eventId })
      if (registrationCount >= event.capacity) {
        return response.status(409).json({ message: 'This event is full and can’t accept more registrations.' })
      }

      const registration = await Registration.create({
        eventId,
        eventName: event.name,
        studentName: studentName.trim(),
        rollNumber: normalizedRollNumber,
        ticketCode: randomUUID(),
      })

      return response.status(201).json({
        message: `You’re registered for ${event.name}.`,
        ticketCode: registration.ticketCode,
      })
    } catch (error) {
      if (error.code === 11000) {
        return response.status(409).json({ message: 'That roll number is already registered for this event.' })
      }
      if (error.name === 'CastError') {
        return response.status(404).json({ message: 'This event could not be found.' })
      }
      console.error('Could not save registration:', error.message)
      return response.status(500).json({ message: 'Could not save your registration.' })
    }
  }

  const event = events.find((item) => String(item.id) === request.params.eventId)
  if (!event) return response.status(404).json({ message: 'This event could not be found.' })

  const alreadyRegistered = registrations.some(
    (item) => item.eventId === request.params.eventId && item.rollNumber === normalizedRollNumber,
  )
  if (alreadyRegistered) {
    return response.status(409).json({ message: 'That roll number is already registered for this event.' })
  }

  const registrationCount = registrations.filter((item) => item.eventId === request.params.eventId).length
  if (registrationCount >= (event.capacity ?? 50)) {
    return response.status(409).json({ message: 'This event is full and can’t accept more registrations.' })
  }

  const ticketCode = randomUUID()
  registrations.push({
    eventId: request.params.eventId,
    eventName: event.name,
    studentName: studentName.trim(),
    rollNumber: normalizedRollNumber,
    ticketCode,
  })
  response.status(201).json({ message: `You’re registered for ${event.name}.`, ticketCode })
})

// Keep Express parser errors in JSON format so the React app can show a useful message.
app.use((error, request, response, next) => {
  if (response.headersSent) return next(error)
  if (error.type === 'entity.too.large') {
    return response.status(413).json({ message: 'The request is too large. Choose a poster under 10 MB.' })
  }
  if (error.type === 'entity.parse.failed') {
    return response.status(400).json({ message: 'The server could not read the submitted data. Please try again.' })
  }
  console.error('Request failed:', error.message)
  return response.status(500).json({ message: 'The server could not complete the request.' })
})

async function updateRegistrationIndexes() {
  let existingIndexes = []
  try {
    existingIndexes = await Registration.collection.indexes()
  } catch (error) {
    // A new project may not have a registrations collection until its first registration.
    if (error.code !== 26 && error.codeName !== 'NamespaceNotFound') throw error
  }

  const oldEmailIndex = existingIndexes.find((index) => (
    index.unique && index.key.eventId === 1 && index.key.email === 1
  ))
  if (oldEmailIndex) {
    await Registration.collection.dropIndex(oldEmailIndex.name)
    console.log('Updated the registration index to use roll numbers.')
  }

  await Registration.createIndexes()
}

async function startServer() {
  await mkdir(uploadsDirectory, { recursive: true })
  if (process.env.MONGODB_URI) {
    try {
      await connectDatabase(process.env.MONGODB_URI)
      databaseConnected = true
      await updateRegistrationIndexes()
      const savedEventCount = await Event.countDocuments()
      if (savedEventCount === 0) {
        await Event.insertMany(events)
        console.log('Added the starter events to the empty database.')
      }
    } catch {
      databaseConnected = false
      console.error('MongoDB could not be reached. The app will use temporary data until the connection works.')
    }
  } else {
    console.log('MONGODB_URI is empty; using temporary sample data for now.')
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Event API is running at http://localhost:${port}`)
  })
}

startServer().catch((error) => {
  console.error('Server could not start:', error.message)
  process.exit(1)
})
