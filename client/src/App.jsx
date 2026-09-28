import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { BrowserQRCodeReader } from '@zxing/browser'
import './App.css'

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '')

function OrganizerPanel({ token, onToken, onCreateEvent }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [ticketCode, setTicketCode] = useState('')
  const [scanMessage, setScanMessage] = useState('')
  const [scanError, setScanError] = useState('')
  const [cameraOn, setCameraOn] = useState(false)
  const [checkingIn, setCheckingIn] = useState(false)
  const videoRef = useRef(null)
  const lastScannedRef = useRef('')

  useEffect(() => {
    if (!token || !cameraOn || !videoRef.current) return undefined
    const reader = new BrowserQRCodeReader()
    let controls
    let stopped = false
    reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
      if (result && !stopped) {
        const scannedValue = result.getText().trim()
        if (scannedValue && scannedValue !== lastScannedRef.current) {
          lastScannedRef.current = scannedValue
          setTicketCode(scannedValue)
          checkIn(scannedValue)
        }
      }
    }).then((cameraControls) => {
      controls = cameraControls
    }).catch(() => {
      setScanError('Could not start the camera. Allow camera access, or enter the ticket code manually.')
      setCameraOn(false)
    })
    return () => {
      stopped = true
      controls?.stop()
    }
    // Scanner starts and stops only when the signed-in organiser toggles the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, cameraOn])

  async function logIn(formEvent) {
    formEvent.preventDefault()
    setLoginError('')
    try {
      const response = await fetch(`${API_BASE_URL}/api/organizer/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const result = await readApiResponse(response)
      if (!response.ok) throw new Error(result.message || 'Could not sign in.')
      localStorage.setItem('gatherOrganizerToken', result.token)
      onToken(result.token)
      setPassword('')
    } catch (error) {
      setLoginError(error.message || 'Could not reach the server.')
    }
  }

  async function checkIn(code = ticketCode) {
    if (!code.trim() || checkingIn) return
    setCheckingIn(true)
    setScanMessage('')
    setScanError('')
    try {
      const response = await fetch(`${API_BASE_URL}/api/organizer/check-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ticketCode: code.trim() }),
      })
      const result = await readApiResponse(response)
      if (!response.ok) throw new Error(result.message || 'Could not check in this ticket.')
      setScanMessage(result.message)
      setTicketCode('')
      lastScannedRef.current = ''
    } catch (error) {
      setScanError(error.message || 'Could not reach the server.')
      if (error.message?.includes('Please sign in')) {
        localStorage.removeItem('gatherOrganizerToken')
        onToken('')
      }
      // Let the scanner read the same ticket again after the organiser handles the result.
      window.setTimeout(() => { lastScannedRef.current = '' }, 2200)
    } finally {
      setCheckingIn(false)
    }
  }

  function logOut() {
    setCameraOn(false)
    localStorage.removeItem('gatherOrganizerToken')
    onToken('')
  }

  return (
    <section className="organizer-panel" aria-label="Organizer tools">
      {!token ? (
        <form className="organizer-login" onSubmit={logIn}>
          <div className="form-heading"><h3>Organizer sign-in</h3><p>Sign in to manage events and scan tickets.</p></div>
          <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
          {loginError && <p className="form-error">{loginError}</p>}
          <button className="submit-event-button" type="submit">Sign in</button>
        </form>
      ) : (
        <div className="organizer-tools">
          <div className="form-heading"><h3>Organizer tools</h3><p>Signed in. Multiple organisers can use this screen on separate phones.</p></div>
          <div className="organizer-actions">
            <button className="submit-event-button" type="button" onClick={onCreateEvent}>Create an event</button>
            <button className="outline-button" type="button" onClick={logOut}>Sign out</button>
          </div>
          <h4>Event check-in</h4>
          <p className="scanner-help">Start the camera and point it at a student’s ticket QR code. You can also enter the ticket code manually.</p>
          <div className="scanner-actions">
            <button className="submit-event-button" type="button" onClick={() => { setScanError(''); setCameraOn((active) => !active) }}>
              {cameraOn ? 'Stop camera' : 'Start QR scanner'}
            </button>
          </div>
          {cameraOn && <video className="scanner-video" ref={videoRef} muted playsInline />}
          <form className="manual-checkin" onSubmit={(event) => { event.preventDefault(); checkIn() }}>
            <label>Ticket code<input value={ticketCode} onChange={(event) => setTicketCode(event.target.value)} placeholder="Scan a QR or type its code" /></label>
            <button className="register-button" type="submit" disabled={checkingIn || !ticketCode.trim()}>{checkingIn ? 'Checking…' : 'Check in ticket'}</button>
          </form>
          {scanMessage && <p className="checkin-success" role="status">{scanMessage}</p>}
          {scanError && <p className="form-error" role="alert">{scanError}</p>}
        </div>
      )}
    </section>
  )
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read that poster image.'))
    reader.readAsDataURL(file)
  })
}

async function readApiResponse(response) {
  const responseText = await response.text()
  try {
    return responseText ? JSON.parse(responseText) : {}
  } catch {
    if (response.status === 413) {
      throw new Error('The server rejected this upload as too large. Choose a poster under 10 MB; if it continues, restart the server.')
    }
    throw new Error(`The server returned an unexpected page (HTTP ${response.status}). Restart the server and try again.`)
  }
}

function App() {
  const [events, setEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [posterPreview, setPosterPreview] = useState('')
  const [registering, setRegistering] = useState(false)
  const [registrationError, setRegistrationError] = useState('')
  const [registrationMessage, setRegistrationMessage] = useState('')
  const [ticketQr, setTicketQr] = useState('')
  const [ticketCode, setTicketCode] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('ALL')
  const [organizerToken, setOrganizerToken] = useState(() => localStorage.getItem('gatherOrganizerToken') || '')
  const [showOrganizerPanel, setShowOrganizerPanel] = useState(false)

  // useEffect runs after the page appears. We use it to ask our server for events.
  useEffect(() => {
    async function loadEvents() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/events`)
        if (!response.ok) throw new Error('The server returned an error.')
        const eventList = await response.json()
        setEvents(eventList)
      } catch {
        setError('Could not load events. Make sure the server is running.')
      } finally {
        setLoading(false)
      }
    }

    loadEvents()
  }, [])

  async function createEvent(formEvent) {
    formEvent.preventDefault()
    setSaving(true)
    setSaveError('')

    const form = formEvent.currentTarget
    const formData = new FormData(form)
    const posterFile = formData.get('poster')
    const eventDetails = Object.fromEntries(
      [...formData.entries()].filter(([fieldName]) => fieldName !== 'poster'),
    )

    try {
      const posterData = posterFile instanceof File && posterFile.size > 0
        ? await readFileAsDataUrl(posterFile)
        : ''
      const response = await fetch(`${API_BASE_URL}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizerToken}` },
        body: JSON.stringify({ ...eventDetails, posterData }),
      })
      const result = await readApiResponse(response)
      if (!response.ok) throw new Error(result.message || 'Could not save the event.')

      setEvents((currentEvents) => [result, ...currentEvents])
      form.reset()
      setPosterPreview('')
      setShowCreateForm(false)
    } catch (requestError) {
      setSaveError(requestError.message || 'Could not reach the server.')
    } finally {
      setSaving(false)
    }
  }

  async function registerForEvent(formEvent) {
    formEvent.preventDefault()
    setRegistering(true)
    setRegistrationError('')

    const form = formEvent.currentTarget
    const studentDetails = Object.fromEntries(new FormData(form).entries())

    try {
      const response = await fetch(`${API_BASE_URL}/api/events/${selectedEvent.id}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(studentDetails),
      })
      const result = await readApiResponse(response)
      if (!response.ok) throw new Error(result.message || 'Could not register for the event.')

      setRegistrationMessage(result.message)
      setTicketCode(result.ticketCode || '')
      if (result.ticketCode) {
        try {
          const qrImage = await QRCode.toDataURL(result.ticketCode, {
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 240,
          })
          setTicketQr(qrImage)
        } catch {
          setRegistrationError('Your registration is saved, but its QR image could not be created.')
        }
      } else {
        setRegistrationError('Your registration is saved, but the server needs a restart to create its QR ticket.')
      }
      form.reset()
    } catch (requestError) {
      setRegistrationError(requestError.message || 'Could not reach the server.')
    } finally {
      setRegistering(false)
    }
  }

  const categories = [...new Set(events.map((event) => event.type).filter(Boolean))].sort()
  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filteredEvents = events.filter((event) => {
    const matchesCategory = selectedCategory === 'ALL' || event.type === selectedCategory
    const searchableDetails = [event.name, event.type, event.description, event.place]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return matchesCategory && searchableDetails.includes(normalizedSearch)
  })

  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top"><span className="brand-mark">g</span> gather<span className="brand-dot">.</span></a>
        <nav aria-label="Main navigation"><a className="active" href="#events">Discover</a><a href="#about">About</a></nav>
        <button
          className="outline-button"
          type="button"
          onClick={() => setShowOrganizerPanel((isOpen) => !isOpen)}
        >
          {showOrganizerPanel ? 'Close organizer tools ×' : 'For organizers ↗'}
        </button>
      </header>

      <main id="top">
        <section className="hero">
          <p className="eyebrow">GOOD THINGS HAPPEN TOGETHER</p>
          <h1>Your campus,<br />a little more <em>alive.</em></h1>
          <p className="hero-copy">Find your people, try something new, and make the most of what’s happening around you.</p>
          <a className="browse-link" href="#events">Find your next thing <span>↓</span></a>
          <span className="sun" aria-hidden="true">✳</span>
        </section>

        <section className="events" id="events">
          <div className="section-heading"><div><p className="eyebrow">ON THE RADAR</p><h2>Coming up on campus</h2></div><span className="count">{filteredEvents.length} EVENTS ↘</span></div>
          {showOrganizerPanel && <OrganizerPanel token={organizerToken} onToken={setOrganizerToken} onCreateEvent={() => { setSaveError(''); setShowCreateForm(true) }} />}
          {showCreateForm && organizerToken && (
            <form className="organizer-form" onSubmit={createEvent}>
              <div className="form-heading"><h3>Create an event</h3><p>Fill in the details, then add it to the campus list.</p></div>
              <label>Event name<input name="name" type="text" placeholder="For example, Design Workshop" required /></label>
              <label>Category<input name="type" type="text" placeholder="Technology, Culture, Careers…" required /></label>
              <div className="form-row">
                <label>Date<input name="date" type="date" required /></label>
                <label>Time<input name="time" type="text" placeholder="2:00 PM" required /></label>
              </div>
              <div className="form-row">
                <label>Venue<input name="place" type="text" placeholder="Seminar Hall" required /></label>
                <label>Seat limit<input name="capacity" type="number" min="1" max="5000" defaultValue="50" required /></label>
              </div>
              <label>Description<textarea name="description" rows="3" placeholder="What will happen at the event?" required /></label>
              <label className="poster-field">Event poster (optional)
                <input
                  name="poster"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (changeEvent) => {
                    const file = changeEvent.currentTarget.files?.[0]
                    setSaveError('')
                    if (!file) {
                      setPosterPreview('')
                      return
                    }
                    if (file.size > 10 * 1024 * 1024) {
                      changeEvent.currentTarget.value = ''
                      setPosterPreview('')
                      setSaveError('Choose a poster image smaller than 10 MB.')
                      return
                    }
                    try {
                      setPosterPreview(await readFileAsDataUrl(file))
                    } catch (previewError) {
                      setPosterPreview('')
                      setSaveError(previewError.message)
                    }
                  }}
                />
                <span className="poster-help">PNG, JPG, or WebP. Maximum size: 10 MB.</span>
              </label>
              {posterPreview && <img className="poster-preview" src={posterPreview} alt="Preview of the selected event poster" />}
              {saveError && <p className="form-error">{saveError}</p>}
              <button className="submit-event-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add event'}</button>
            </form>
          )}

          <div className="event-filters">
            <label className="event-search">
              <span>Search events</span>
              <input
                type="search"
                value={searchTerm}
                onChange={(changeEvent) => setSearchTerm(changeEvent.target.value)}
                placeholder="Try a name, topic, or venue"
              />
            </label>
            <label className="event-category-filter">
              <span>Category</span>
              <select value={selectedCategory} onChange={(changeEvent) => setSelectedCategory(changeEvent.target.value)}>
                <option value="ALL">All categories</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
          </div>

          {loading && <p className="status-message">Loading events…</p>}
            {error && <p className="status-message error-message">{error}</p>}
            {!loading && !error && filteredEvents.length === 0 && (
              <p className="status-message empty-results">No events match your search. Try another word or choose “All categories.”</p>
            )}
            {!loading && !error && filteredEvents.length > 0 && <div className="event-grid">
            {filteredEvents.map((event) => (
              <article className="event-card" key={event.id}>
                <div className="card-labels"><span>{event.type}</span><span>{event.dateLabel}</span></div>
                <div className={`card-art ${event.color}`} aria-hidden="true">
                  {event.posterUrl
                    ? <img src={`${API_BASE_URL}${event.posterUrl}`} alt="" />
                    : <span>{event.symbol}</span>}
                </div>
                <div className="card-body">
                  <h3>{event.name}</h3>
                  <p>{event.description}</p>
                  <div className="event-info"><span>{event.time}</span><span>{event.place}</span></div>
                  <button
                    className="details-button"
                    type="button"
                    onClick={() => {
                      setSelectedEvent(event)
                      setRegistrationError('')
                      setRegistrationMessage('')
                      setTicketQr('')
                      setTicketCode('')
                    }}
                  >
                    Event details <span>↗</span>
                  </button>
                </div>
              </article>
            ))}
            </div>}
        </section>

        {selectedEvent && (
          <div className="dialog-backdrop" onClick={() => setSelectedEvent(null)}>
            <section
              className="event-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="dialog-title"
              onClick={(click) => click.stopPropagation()}
            >
              <button
                className="dialog-close"
                type="button"
                aria-label="Close event details"
                onClick={() => setSelectedEvent(null)}
              >
                ×
              </button>
              <p className="eyebrow">{selectedEvent.type} · {selectedEvent.dateLabel}</p>
              <h2 id="dialog-title">{selectedEvent.name}</h2>
              {selectedEvent.posterUrl && (
                <img
                  className="dialog-poster"
                  src={`${API_BASE_URL}${selectedEvent.posterUrl}`}
                  alt={`Poster for ${selectedEvent.name}`}
                />
              )}
              <p className="dialog-description">{selectedEvent.description}</p>
              <div className="dialog-info"><span>{selectedEvent.time}</span><span>{selectedEvent.place}</span><span>Up to {selectedEvent.capacity ?? 50} students</span></div>
              {registrationMessage ? (
                <>
                  <p className="registration-success">{registrationMessage}</p>
                  {ticketQr && (
                    <div className="ticket-qr">
                      <p>Keep this QR ticket for event check-in.</p>
                      <img src={ticketQr} alt="QR code ticket for this event registration" />
                      <span>Ticket code: {ticketCode}</span>
                    </div>
                  )}
                  {registrationError && <p className="registration-error">{registrationError}</p>}
                </>
              ) : (
                <form className="registration-form" onSubmit={registerForEvent}>
                  <p className="registration-heading">Want to join? Register here.</p>
                  <label>Your name<input name="studentName" type="text" autoComplete="name" required /></label>
                  <label>Roll number
                    <input
                      name="rollNumber"
                      type="text"
                      autoComplete="off"
                      placeholder="For example, 23CSE1042"
                      maxLength="30"
                      pattern="[A-Za-z0-9/-]{1,30}"
                      title="Use letters, numbers, hyphens, or slashes."
                      required
                    />
                  </label>
                  {registrationError && <p className="registration-error">{registrationError}</p>}
                  <button className="register-button" type="submit" disabled={registering}>
                    {registering ? 'Registering…' : 'Register for event'}
                  </button>
                </form>
              )}
            </section>
          </div>
        )}
      </main>

      <footer id="about"><span>GATHER YOUR CAMPUS.</span><span>GOOD THINGS HAPPEN HERE ✳</span></footer>
    </div>
  )
}

export default App
