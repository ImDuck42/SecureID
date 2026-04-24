/**
 * Satire. Please do not actually upload your ID to random websites.
 */

import { GitHubDB } from './github-db.js'

// ══ CONFIG ══════════════════════════════════════════════════════════════════
const CFG = {
  gh: {
    owner:        'ImDuck42',
    repo:         'secureID',
    publicTokens: ['ghdb_enc_ICEwKjIqGzImPBtzdgoFcBQOcAN3cTYzAHE2DRMZFissFzMNCyYdOAYEMRUVAXAkDg90AX8CHSoRegMWMH8CKjE7EgE9Ijw7MT4nMyYDHBIDfg4PHgByNyUrcyQj'],
    branch:       'main',
    rawBranches:  ['/refs/heads/main', 'main', 'master'],
    basePath:     'userData',
    useRaw:       true,
  },
  gemini: {
    apiKey: 'AIzaSyDZgdWeKg5JiZy9sZDK3Qep9x3URMT7ues', // Be cool and dont steal pls
    model:  'gemma-4-26b-a4b-it',
    url:    'https://generativelanguage.googleapis.com/v1beta/models/',
  },
}

// ══ DB Init ══════════════════════════════════════════════════════════════════
let db    = null
let idCol = null   // collection('idData')

async function initDb() {
  if (db) return
  db = await GitHubDB.public({
    owner:        CFG.gh.owner,
    repo:         CFG.gh.repo,
    publicTokens: CFG.gh.publicTokens,
    branch:       CFG.gh.branch,
    basePath:     CFG.gh.basePath,
    useRaw:       CFG.gh.useRaw,
    rawBranches:  CFG.gh.rawBranches,
  })
  idCol = db.collection('idData')
  db.permissions({
    idData: { read: 'public', write: 'auth' },
  })
}

// ══ DOM refs ══════════════════════════════════════════════════════════════════
const $ = id => document.getElementById(id)

const sections = {
  get hero()   { return $('hero') },
  get auth()   { return $('auth-panel') },
  get verify() { return $('id-verify-panel') },
  get dash()   { return $('dashboard') },
}

const views = {
  get register() { return $('view-register') },
  get login()    { return $('view-login') },
}

// ══ State ════════════════════════════════════════════════════════════════════
let pendingUser = null // username waiting for ID verification after register

// ══ Routing ══════════════════════════════════════════════════════════════════
function showSection(name) {
  Object.values(sections).forEach(s => s.classList.add('hidden'))
  sections[name]?.classList.remove('hidden')
}

function showView(name) {
  Object.values(views).forEach(v => v.classList.add('hidden'))
  views[name]?.classList.remove('hidden')
  showSection('auth')
}

function goDash() {
  const u = db?.auth?.currentUser
  if (!u) return
  $('badge-name').textContent = u.username
  $('user-badge').classList.remove('hidden')
  $('dash-username').textContent = u.username
  renderDash(u.username)
  showSection('dash')
}

// ══ Toast ════════════════════════════════════════════════════════════════════
function toast(msg, type = 'info', dur = 4000) {
  const icons = { ok: 'fa-circle-check', err: 'fa-circle-xmark', info: 'fa-circle-info' }
  const el = document.createElement('div')
  el.className = `toast toast-${type}`
  el.innerHTML = `<i class="fa-solid ${icons[type]}"></i><span>${msg}</span>`
  $('toast-container').appendChild(el)
  setTimeout(() => {
    el.classList.add('toast-out')
    el.addEventListener('animationend', () => el.remove())
  }, dur)
}

// ══ Overlay ══════════════════════════════════════════════════════════════════
function showOverlay(msg = 'Processing…') { $('overlay-msg').textContent = msg; $('overlay').classList.remove('hidden') }
function hideOverlay() { $('overlay').classList.add('hidden') }

// ══ Error helpers ════════════════════════════════════════════════════════════
function showErr(id, msg) { const el = $(id); el.textContent = msg; el.classList.remove('hidden') }
function clearErr(id)     { const el = $(id); el.textContent = '';  el.classList.add('hidden') }

// ══ Password strength ════════════════════════════════════════════════════════
function calcStrength(pw) {
  let s = 0
  if (pw.length >= 8)  s += 25
  if (pw.length >= 12) s += 15
  if (/[A-Z]/.test(pw)) s += 20
  if (/[0-9]/.test(pw)) s += 20
  if (/[^A-Za-z0-9]/.test(pw)) s += 20
  return Math.min(s, 100)
}

// ══ Upload zone helpers ══════════════════════════════════════════════════════
function setupUploadZone(zoneId, fileId, previewId) {
  const zone    = $(zoneId)
  const fileInp = $(fileId)
  const preview = $(previewId)

  if (!zone || !fileInp || !preview) return

  const show = file => {
    const url = URL.createObjectURL(file)
    preview.innerHTML = `<img src="${url}" alt="ID preview" />`
    preview.classList.remove('hidden')
    zone.querySelector('span').textContent = file.name
  }

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over') })
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'))
  zone.addEventListener('drop', e => {
    e.preventDefault()
    zone.classList.remove('drag-over')
    const f = e.dataTransfer.files[0]
    if (f) { fileInp.files = e.dataTransfer.files; show(f) }
  })
  fileInp.addEventListener('change', () => { if (fileInp.files[0]) show(fileInp.files[0]) })
}

// ══ Image → base64 ══════════════════════════════════════════════════════════
function fileToB64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload  = () => res(r.result.split(',')[1])
    r.onerror = () => rej(new Error('File read failed'))
    r.readAsDataURL(file)
  })
}

// ══ Tesseract OCR (via CDN) ══════════════════════════════════════════════════
let tesseractReady = false

async function ensureTesseract() {
  if (tesseractReady) return
  await new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract.min.js'
    s.onload = res
    s.onerror = rej
    document.head.appendChild(s)
  })
  tesseractReady = true
}

async function ocrImage(file) {
  await ensureTesseract()
  const worker = await Tesseract.createWorker('eng')
  const { data: { text } } = await worker.recognize(file)
  await worker.terminate()
  return text.trim()
}

// ══ Gemini calls ════════════════════════════════════════════════════════════
const GEMINI_URL = `${CFG.gemini.url}${CFG.gemini.model}:generateContent?key=${CFG.gemini.apiKey}`

async function geminiChat(systemPrompt, userMsg) {
  const body = {
    contents: [{
      role: 'user',
      parts: [{ text: `${systemPrompt}\n\n---\n\n${userMsg}` }]
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
  }
  const res = await fetch(GEMINI_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Gemini error ${res.status}`)
  const data = await res.json()
  // Model may return a thought part before the real answer — take the last non-empty part
  const parts = data.candidates?.[0]?.content?.parts ?? []
  return parts.filter(p => p.text && !p.thought).at(-1)?.text ?? ''
}

// ── System prompts ──────────────────────────────────────────────────────────

const SYS_EXTRACT = `
You are an identity document parser. The user will give you raw OCR text from an ID document.
Extract as many fields as possible. Return ONLY a valid JSON object with no markdown fences.
Use these keys (omit if not found): firstName, lastName, dateOfBirth, documentNumber,
expiryDate, nationality, address, gender, placeOfBirth, issuingAuthority.
If the text is too low quality to extract anything useful, return {"error":"unreadable"}.
`.trim()

const SYS_VERIFY = `
You are a biometric identity verification system. The user will give you:
1. "stored" — JSON object with identity data we have on file for this user
2. "scanned" — raw OCR text from an ID document they just uploaded

Decide if the scanned document plausibly belongs to the same person.
Be somewhat lenient about OCR errors. Look for matching name, date of birth, or document number.
Return ONLY a JSON object: {"match": true, "confidence": 0.95, "reason": "..."}
or {"match": false, "confidence": 0.2, "reason": "..."}
No markdown, no extra text.
`.trim()

// ══ Registration ════════════════════════════════════════════════════════════
async function register() {
  clearErr('reg-error')
  const user  = $('reg-user').value.trim()
  const pass  = $('reg-pass').value
  const pass2 = $('reg-pass2').value

  if (!user)         return showErr('reg-error', 'Username is required.')
  if (pass.length < 8) return showErr('reg-error', 'Password must be at least 8 characters.')
  if (pass !== pass2)  return showErr('reg-error', 'Passwords do not match.')

  showOverlay('Creating your account…')
  try {
    await initDb()
    await db.auth.register(user, pass)
  } catch (e) {
    hideOverlay()
    return showErr('reg-error', e.message ?? 'Registration failed.')
  }

  // Register succeeded
  try {
    await db.auth.login(user, pass)
  } catch (e) {
    // Account exists and we just created it, ignore login errors here
  }

  hideOverlay()
  pendingUser = user
  $('user-badge').classList.remove('hidden')
  $('badge-name').textContent = user
  showSection('verify')
  toast('Account created! Now verify your identity.', 'ok')
}

// ══ ID Verification (after register) ════════════════════════════════════════
function setVerifyStep(stepId, state) {
  const el = $(stepId)
  el.classList.remove('active', 'done')
  if (state) el.classList.add(state)
}

async function submitId() {
  clearErr('verify-error')
  const file = $('verify-id-file').files[0]
  if (!file) return showErr('verify-error', 'Please upload a photo of your ID.')

  const prog = $('verify-progress')
  prog.classList.remove('hidden')
  setVerifyStep('step-scan', 'active')
  setVerifyStep('step-ai',   '')
  setVerifyStep('step-store','')
  $('btn-submit-id').disabled = true

  try {
    // Step 1 — OCR
    toast('Running OCR on your document…', 'info')
    const ocrText = await ocrImage(file)
    setVerifyStep('step-scan', 'done')
    setVerifyStep('step-ai', 'active')

    // Step 2 — Gemini extraction
    toast('Asking the AI what it found…', 'info')
    const raw = await geminiChat(SYS_EXTRACT, `OCR text:\n${ocrText}`)
    let idData
    try { idData = JSON.parse(raw) } catch { idData = { raw: ocrText.slice(0, 500) } }

    if (idData.error === 'unreadable') {
      // Be lenient, store what we got anyway
      idData = { note: 'Document unreadable — user probably drew on themselves.', rawOcr: ocrText.slice(0, 300) }
    }

    setVerifyStep('step-ai', 'done')
    setVerifyStep('step-store', 'active')

    // Step 3 — Store
    await initDb()
    const u = db.auth.currentUser
    await idCol.upsert(u.id, {
      username:    u.username,
      idData,
      verifiedAt:  new Date().toISOString(),
    })

    setVerifyStep('step-store', 'done')
    $('verify-success').classList.remove('hidden')
    toast('Identity "verified". Welcome to the database.', 'ok')

    setTimeout(() => goDash(), 1800)
  } catch (e) {
    console.error(e)
    showErr('verify-error', `Verification failed: ${e.message}`)
    $('btn-submit-id').disabled = false
  }
}

// ══ Login ════════════════════════════════════════════════════════════════════
let loginIdVerified = false

async function verifyLoginId() {
  clearErr('login-error')
  const user = $('login-user').value.trim()
  const file = $('login-id-file').files[0]

  if (!user) return showErr('login-error', 'Enter your username first.')
  if (!file) return showErr('login-error', 'Upload your ID photo.')

  const prog    = $('login-id-progress')
  const status  = $('login-id-status')
  prog.classList.remove('hidden')
  $('btn-verify-id').disabled = true

  try {
    // OCR
    status.textContent = 'Running OCR scan…'
    const ocrText = await ocrImage(file)

    // Fetch stored ID data
    status.textContent = 'Fetching your records…'
    await initDb()
    const users    = await db.auth.listUsers()
    const userRec  = users.find(u => u.username === user)
    if (!userRec) throw new Error('Username not found.')

    const stored = await idCol.get(userRec.id)
    if (!stored) throw new Error('No identity record found. Please register first.')

    // Ask Gemini
    status.textContent = 'Verifying identity with AI…'
    const prompt = `stored: ${JSON.stringify(stored.idData)}\n\nscanned OCR text:\n${ocrText}`
    const raw    = await geminiChat(SYS_VERIFY, prompt)
    let verdict
    try { verdict = JSON.parse(raw) } catch { verdict = { match: false, reason: 'AI response parse error' } }

    if (!verdict.match) {
      throw new Error(`Identity mismatch: ${verdict.reason}`)
    }

    // Passed, show password step
    loginIdVerified = true
    $('login-id-step').classList.add('hidden')
    $('login-pass-step').classList.remove('hidden')
    toast(`Identity confirmed (${Math.round((verdict.confidence ?? 0.5) * 100)}% confidence). Enter password.`, 'ok')
  } catch (e) {
    showErr('login-error', e.message)
    $('btn-verify-id').disabled = false
  } finally {
    prog.classList.add('hidden')
  }
}

async function finalLogin() {
  clearErr('login-pass-error')
  const user = $('login-user').value.trim()
  const pass = $('login-pass').value

  if (!loginIdVerified) return showErr('login-pass-error', 'Complete ID verification first.')
  if (!pass)            return showErr('login-pass-error', 'Enter your password.')

  showOverlay('Signing you in…')
  try {
    await initDb()
    await db.auth.login(user, pass)
    $('user-badge').classList.remove('hidden')
    $('badge-name').textContent = user
    toast('Signed in successfully.', 'ok')
    goDash()
  } catch (e) {
    hideOverlay()
    showErr('login-pass-error', e.message ?? 'Login failed.')
  } finally {
    hideOverlay()
  }
}

// ══ Dashboard ════════════════════════════════════════════════════════════════
async function renderDash(username) {
  await initDb()
  const u     = db.auth.currentUser
  const pfDiv = $('profile-fields')
  pfDiv.innerHTML = profileRow('Username',   u.username)
                  + profileRow('Account ID', u.id)
                  + profileRow('Member Since', new Date(u.createdAt).toLocaleDateString())
                  + profileRow('Roles',       (u.roles || []).join(', ') || 'user')

  try {
    const rec = await idCol.get(u.id)
    if (rec?.idData) renderIdData(rec.idData)
  } catch { /* not critical */ }
}

function profileRow(label, val) {
  return `<div class="profile-row"><span class="pf-label">${label}</span><span class="pf-val">${val ?? '—'}</span></div>`
}

function renderIdData(data) {
  const el      = $('id-data-display')
  const display = {
    'First Name':         data.firstName,
    'Last Name':          data.lastName,
    'Date of Birth':      data.dateOfBirth,
    'Document Number':    data.documentNumber,
    'Expiry Date':        data.expiryDate,
    'Nationality':        data.nationality,
    'Address':            data.address,
    'Gender':             data.gender,
    'Place of Birth':     data.placeOfBirth,
    'Issuing Authority':  data.issuingAuthority,
    'Verification Note':  data.note,
  }
  el.innerHTML = Object.entries(display)
    .filter(([, v]) => v)
    .map(([k, v]) => `<div class="id-field"><div class="id-field-label">${k}</div><div class="id-field-val">${v}</div></div>`)
    .join('')

  if (!el.innerHTML) el.innerHTML = '<div class="id-field"><div class="id-field-label">Status</div><div class="id-field-val">Data stored securely™</div></div>'
}

// ══ Logout ══════════════════════════════════════════════════════════════════
function logout() {
  db?.auth?.logout()
  $('user-badge').classList.add('hidden')
  loginIdVerified = false
  $('login-id-step').classList.remove('hidden')
  $('login-pass-step').classList.add('hidden')
  showSection('hero')
  toast('Signed out. Your data remains with us forever.', 'info')
}

// ══ Session restore ══════════════════════════════════════════════════════════
async function tryRestoreSession() {
  try {
    await initDb()
    const ok = await db.auth.verifySession()
    if (ok && db.auth.isLoggedIn) {
      $('user-badge').classList.remove('hidden')
      $('badge-name').textContent = db.auth.currentUser.username
      goDash()
      return true
    }
  } catch { /* no session */ }
  return false
}

// ══ Event wiring + Boot ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Password strength
  const regPassEl = $('reg-pass')
  const passStrengthFill = $('pass-strength-fill')
  if (regPassEl && passStrengthFill) {
    regPassEl.addEventListener('input', () => {
      const v = calcStrength(regPassEl.value)
      passStrengthFill.style.width = v + '%'
      passStrengthFill.style.background = v < 40 ? 'var(--red)' : v < 70 ? 'var(--yellow)' : 'var(--green)'
    })
  }

  // Upload zones
  setupUploadZone('verify-id-zone',  'verify-id-file',  'verify-id-preview')
  setupUploadZone('login-id-zone',   'login-id-file',   'login-id-preview')

  // Button event listeners
  $('btn-go-register').addEventListener('click',  () => showView('register'))
  $('btn-go-login').addEventListener('click',     () => showView('login'))
  $('link-to-login').addEventListener('click',    () => showView('login'))
  $('link-to-register').addEventListener('click', () => showView('register'))

  $('btn-register').addEventListener('click',    register)
  $('btn-verify-id').addEventListener('click',   verifyLoginId)
  $('btn-login-final').addEventListener('click', finalLogin)
  $('btn-submit-id').addEventListener('click',   submitId)

  $('btn-logout').addEventListener('click',      logout)
  $('btn-dash-logout').addEventListener('click', logout)

  // Enter key support
  const regPass2 = $('reg-pass2')
  const regPass = $('reg-pass')
  if (regPass2 && regPass) {
    [regPass2, regPass].forEach(el =>
      el.addEventListener('keydown', e => { if (e.key === 'Enter') register() })
    )
  }
  const loginPassEl = $('login-pass')
  if (loginPassEl) {
    loginPassEl.addEventListener('keydown', e => { if (e.key === 'Enter') finalLogin() })
  }

  // Boot
  ;(async () => {
    const restored = await tryRestoreSession()
    if (!restored) showSection('hero')
  })()
})