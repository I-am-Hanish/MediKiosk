// MediKiosk API Client Module
// Handlers for interacting with the live FastAPI backend database

/**
 * Registers a new patient with details entered by the user.
 * @param {Object} patientData - { name, age, gender, phone, allergies, conditions }
 * @returns {Promise<Object>} The registered patient response
 */
async function apiRegisterPatient(patientData) {
    const response = await fetch('/api/patient/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(patientData)
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Registration failed. Please verify inputs.");
    }
    return await response.json();
}

/**
 * Searches for a patient using their Kiosk Patient ID.
 * @param {string} patientId - The patient ID or name query
 * @returns {Promise<Object>} The matching patient record
 */
async function apiSearchPatient(patientId) {
    const response = await fetch(`/api/patient/search?id=${encodeURIComponent(patientId)}`);
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Patient search failed.");
    }
    return await response.json();
}

/**
 * Fetches the latest registered patient from the database (for QR simulation).
 * @returns {Promise<Object>} { id } of the latest patient
 */
async function apiGetLatestPatient() {
    const response = await fetch('/api/patient/latest');
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "No patients registered yet.");
    }
    return await response.json();
}

/**
 * Fetches the demographic and chronological consultation history for a patient.
 * @param {string} patientId - The patient ID
 * @returns {Promise<Object>} { patient, consultations }
 */
async function apiGetPatientHistory(patientId) {
    const response = await fetch(`/api/patient/${encodeURIComponent(patientId)}/history`);
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to load patient history.");
    }
    return await response.json();
}

/**
 * Adds a new clinical consultation record to the patient.
 * @param {Object} consultationData - { patient_id, date, doctor_name, specialization, hospital_name, symptoms, diagnosis, treatment, notes }
 * @returns {Promise<Object>} The response containing the new smart summary
 */
async function apiAddConsultation(consultationData) {
    const response = await fetch('/api/patient/consultation', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(consultationData)
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to save consultation.");
    }
    return await response.json();
}
