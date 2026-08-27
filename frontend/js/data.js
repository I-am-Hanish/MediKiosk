// MediKiosk API Client Module
// Handlers for interacting with the live FastAPI backend database

const API_BASE_URL = 'https://medikiosk-backend-gqfq.onrender.com';

/**
 * Registers a new patient with details entered by the user.
 * @param {Object} patientData - { name, age, gender, phone, allergies, conditions }
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
 * Updates an existing clinical consultation record.
 * @param {number|string} consultationId - The consultation primary key ID
 * @param {Object} consultationData - { date, doctor_name, specialization, hospital_name, symptoms, diagnosis, treatment, notes }
 * @returns {Promise<Object>} The response containing the updated smart summary
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
        let errorMsg = "Failed to update consultation.";
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