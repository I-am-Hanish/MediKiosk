// MediKiosk API Client Module
// Handlers for interacting with the live FastAPI backend database & authentication

/**
 * Automatically detects whether MediKiosk is running locally (FastAPI server / Live Server)
 * or in production on Render / cloud, ensuring instantaneous local responses for demos.
 */
const API_BASE_URL = (function () {
    if (typeof window !== "undefined" && window.location) {
        const host = window.location.hostname;
        // Local developer environment
        if (host === 'localhost' || host === '127.0.0.1' || window.location.protocol === 'file:') {
            if (window.location.port === '8000') {
                return ''; // Relative path when served directly by FastAPI
            }
            return 'http://127.0.0.1:8000'; // Target local FastAPI backend
        }
        // Hosted on Render directly
        if (host.endsWith('onrender.com')) {
            return window.location.origin;
        }
    }
    // Fallback for static hosting (e.g. GitHub Pages / Vercel)
    return 'https://medikiosk-backend-gqfq.onrender.com';
})();

/**
 * Extracts clean user-facing error message from FastAPI responses.
 */
function parseApiError(errData, statusText, fallback) {
    if (errData) {
        if (typeof errData.detail === 'string') {
            return errData.detail;
        }
        if (Array.isArray(errData.detail)) {
            return errData.detail.map(d => (d.msg || d.message || JSON.stringify(d))).join('; ');
        }
        if (errData.message) {
            return errData.message;
        }
    }
    return statusText || fallback;
}

// ============================================================
// AUTHENTICATION STATE & SESSION STORAGE HELPERS
// ============================================================

function getAuthToken() {
    return sessionStorage.getItem("authToken");
}

function getAuthRole() {
    return sessionStorage.getItem("authRole");
}

function getAuthPatientId() {
    return sessionStorage.getItem("authPatientId");
}

function getAuthDoctorId() {
    return sessionStorage.getItem("authDoctorId");
}

function getAuthUsername() {
    return sessionStorage.getItem("authUsername");
}

function isAuthenticated() {
    return !!getAuthToken();
}

function setAuthSession(data) {
    if (!data) return;
    if (data.token) sessionStorage.setItem("authToken", data.token);
    if (data.role) sessionStorage.setItem("authRole", String(data.role).toUpperCase());
    if (data.user_identifier) sessionStorage.setItem("authUsername", data.user_identifier);
    if (data.patient_id) {
        sessionStorage.setItem("authPatientId", data.patient_id);
        sessionStorage.setItem("activePatientId", data.patient_id);
    }
    if (data.doctor_id) sessionStorage.setItem("authDoctorId", data.doctor_id);
}

function clearAuthSession() {
    sessionStorage.removeItem("authToken");
    sessionStorage.removeItem("authRole");
    sessionStorage.removeItem("authPatientId");
    sessionStorage.removeItem("authDoctorId");
    sessionStorage.removeItem("authUsername");
}

function getAuthHeaders(customHeaders = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...customHeaders
    };
    const token = getAuthToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

// ============================================================
// AUTHENTICATION ENDPOINTS
// ============================================================

/**
 * Logs in a user (Patient or Doctor).
 * @param {string} identifier - Patient ID (e.g. MK-2026-1001) or Doctor ID (e.g. DOC-101)
 * @param {string} password - Account password
 * @returns {Promise<Object>} TokenResponse with token, role, and identifier
 */
async function apiLogin(identifier, password) {
    const cleanId = String(identifier || '').trim().toUpperCase();
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            identifier: cleanId,
            password: String(password || '')
        })
    });

    if (!response.ok) {
        let errorMsg = "Login failed. Please check your credentials.";
        try {
            const err = await response.json();
            errorMsg = parseApiError(err, response.statusText, errorMsg);
        } catch (_) {
            errorMsg = response.statusText || errorMsg;
        }
        throw new Error(errorMsg);
    }

    const data = await response.json();
    setAuthSession(data);
    return data;
}

/**
 * Registers a new Doctor identity in the backend.
 * @param {Object} doctorData - { doctor_id, password, name, specialization, hospital_name }
 * @returns {Promise<Object>} Confirmation response
 */
async function apiRegisterDoctor(doctorData) {
    const response = await fetch(`${API_BASE_URL}/api/auth/doctor/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doctorData)
    });

    if (!response.ok) {
        let errorMsg = "Doctor registration failed.";
        try {
            const err = await response.json();
            errorMsg = parseApiError(err, response.statusText, errorMsg);
        } catch (_) {
            errorMsg = response.statusText || errorMsg;
        }
        throw new Error(errorMsg);
    }

    return await response.json();
}

/**
 * Retrieves profile of current active user via Bearer token.
 * @returns {Promise<Object|null>}
 */
async function apiGetCurrentUser() {
    const token = getAuthToken();
    if (!token) return null;

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            clearAuthSession();
            return null;
        }

        return await response.json();
    } catch (_) {
        return null;
    }
}

// ============================================================
// PATIENT MEDICAL ENDPOINTS
// ============================================================

/**
 * Returns the URL for the local backend QR endpoint.
 */
function apiGetPatientQrUrl(patientId) {
    const cleanId = encodeURIComponent(String(patientId || '').trim().toUpperCase());
    return `${API_BASE_URL}/api/patient/${cleanId}/qr`;
}

/**
 * Registers a new patient with demographic and optional password details.
 * @param {Object} patientData - { name, age, gender, phone, email, allergies, conditions, password }
 * @returns {Promise<Object>} The registered patient response
 */
async function apiRegisterPatient(patientData) {
    const response = await fetch(`${API_BASE_URL}/api/patient/register`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(patientData)
    });

    if (!response.ok) {
        let errorMsg = "Registration failed. Please verify inputs.";
        try {
            const err = await response.json();
            errorMsg = parseApiError(err, response.statusText, errorMsg);
        } catch (_) {
            errorMsg = response.statusText || errorMsg;
        }
        throw new Error(errorMsg);
    }

    return await response.json();
}

/**
 * Searches for a patient using their Kiosk Patient ID.
 * @param {string} patientId - The patient ID query
 * @returns {Promise<Object>} The matching patient record
 */
async function apiSearchPatient(patientId) {
    const response = await fetch(
        `${API_BASE_URL}/api/patient/search?id=${encodeURIComponent(patientId)}`,
        { headers: getAuthHeaders() }
    );

    if (!response.ok) {
        let errorMsg = "Patient search failed.";
        try {
            const err = await response.json();
            errorMsg = parseApiError(err, response.statusText, errorMsg);
        } catch (_) {
            errorMsg = response.statusText || errorMsg;
        }
        throw new Error(errorMsg);
    }

    return await response.json();
}

/**
 * Fetches the demographic and chronological consultation history for a patient.
 * @param {string} patientId - The patient ID
 * @returns {Promise<Object>} { patient, consultations }
 */
async function apiGetPatientHistory(patientId) {
    const response = await fetch(
        `${API_BASE_URL}/api/patient/${encodeURIComponent(patientId)}/history`,
        { headers: getAuthHeaders() }
    );

    if (!response.ok) {
        let errorMsg = "Failed to load patient history.";
        try {
            const err = await response.json();
            errorMsg = parseApiError(err, response.statusText, errorMsg);
        } catch (_) {
            errorMsg = response.statusText || errorMsg;
        }
        throw new Error(errorMsg);
    }

    return await response.json();
}

/**
 * Adds a new clinical consultation record to the patient.
 * @param {Object} consultationData - { patient_id, date, doctor_name, specialization, hospital_name, symptoms, diagnosis, treatment, notes }
 * @returns {Promise<Object>} The response containing the new smart summary
 */
async function apiAddConsultation(consultationData) {
    const response = await fetch(
        `${API_BASE_URL}/api/patient/consultation`,
        {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(consultationData)
        }
    );

    if (!response.ok) {
        let errorMsg = "Failed to save consultation.";
        try {
            const err = await response.json();
            errorMsg = parseApiError(err, response.statusText, errorMsg);
        } catch (_) {
            errorMsg = response.statusText || errorMsg;
        }
        throw new Error(errorMsg);
    }

    return await response.json();
}

/**
 * Updates an existing clinical consultation record (Disabled: Prescriptions are immutable).
 */
async function apiUpdateConsultation(consultationId, consultationData) {
    const response = await fetch(
        `${API_BASE_URL}/api/patient/consultation/${encodeURIComponent(consultationId)}`,
        {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(consultationData)
        }
    );

    if (!response.ok) {
        let errorMsg = "Prescription history is immutable. Existing records cannot be modified.";
        try {
            const err = await response.json();
            if (err && err.detail) {
                errorMsg = err.detail;
            }
        } catch (_) {
            errorMsg = response.statusText || errorMsg;
        }
        throw new Error(errorMsg);
    }

    return await response.json();
}

/**
 * Uploads a medical document with verified clinical intelligence for the given patient ID.
 */
async function apiUploadMedicalDocument(patientId, documentData) {
    const cleanId = encodeURIComponent(String(patientId || '').trim().toUpperCase());
    const response = await fetch(
        `${API_BASE_URL}/api/patient/${cleanId}/document`,
        {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(documentData)
        }
    );

    if (!response.ok) {
        let errorMsg = "Failed to upload medical document.";
        try {
            const err = await response.json();
            errorMsg = parseApiError(err, response.statusText, errorMsg);
        } catch (_) {
            errorMsg = response.statusText || errorMsg;
        }
        throw new Error(errorMsg);
    }

    return await response.json();
}

/**
 * Retrieves all medical documents attached to the given patient ID.
 */
async function apiGetPatientDocuments(patientId) {
    const cleanId = encodeURIComponent(String(patientId || '').trim().toUpperCase());
    const response = await fetch(
        `${API_BASE_URL}/api/patient/${cleanId}/documents`,
        { headers: getAuthHeaders() }
    );

    if (!response.ok) {
        let errorMsg = "Failed to load medical documents.";
        try {
            const err = await response.json();
            errorMsg = parseApiError(err, response.statusText, errorMsg);
        } catch (_) {
            errorMsg = response.statusText || errorMsg;
        }
        throw new Error(errorMsg);
    }

    return await response.json();
}

/**
 * Generates the direct URL for streaming/viewing the original medical document file.
 * Appends the active session token so direct browser iframes and links remain authorized.
 */
function apiGetDocumentFileUrl(documentId) {
    const token = getAuthToken();
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
    return `${API_BASE_URL}/api/patient/document/${encodeURIComponent(documentId)}/file${tokenParam}`;
}