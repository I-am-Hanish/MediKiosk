// MediKiosk API Client Module
// Handlers for interacting with the live FastAPI backend database

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

/**
 * Returns the URL for the local backend QR endpoint.
 */
function apiGetPatientQrUrl(patientId) {
    const cleanId = encodeURIComponent(String(patientId || '').trim().toUpperCase());
    return `${API_BASE_URL}/api/patient/${cleanId}/qr`;
}

/**
 * Registers a new patient with details entered by the user.
 * @param {Object} patientData - { name, age, gender, phone, email, allergies, conditions }
 * @returns {Promise<Object>} The registered patient response
 */
async function apiRegisterPatient(patientData) {
    const response = await fetch(`${API_BASE_URL}/api/patient/register`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
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
        `${API_BASE_URL}/api/patient/search?id=${encodeURIComponent(patientId)}`
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
        `${API_BASE_URL}/api/patient/${encodeURIComponent(patientId)}/history`
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
            headers: {
                'Content-Type': 'application/json'
            },
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
 * @param {number|string} consultationId - The consultation primary key ID
 * @param {Object} consultationData - { date, doctor_name, specialization, hospital_name, symptoms, diagnosis, treatment, notes }
 * @returns {Promise<Object>} The response
 */
async function apiUpdateConsultation(consultationId, consultationData) {
    const response = await fetch(
        `${API_BASE_URL}/api/patient/consultation/${encodeURIComponent(consultationId)}`,
        {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
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