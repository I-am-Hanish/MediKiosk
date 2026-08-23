// MediKiosk Frontend Application Controller
// Orchestrates navigation, UI interactions, and API communications

// Active state
let activePatient = null;
let currentScreen = 'screen-registration';

// Page Title & Subtitle Mapping
const SCREEN_TITLES = {
    'screen-registration': {
        title: "Patient Registration",
        desc: "Register a new patient and generate their digital health card"
    },
    'screen-dashboard': {
        title: "Doctor Dashboard",
        desc: "Locate patient profiles and manage clinical consults"
    },
    'screen-history': {
        title: "Patient Case History",
        desc: "View comprehensive clinical history, timeline, and smart summaries"
    },
    'screen-consultation': {
        title: "Add New Consultation",
        desc: "Record patient symptoms, clinical diagnosis, and treatments"
    }
};

// Document Ready
document.addEventListener("DOMContentLoaded", () => {
    // Render initial icons
    lucide.createIcons();
    
    // Initialize default screen
    switchScreen('screen-registration');
});

// Screen Swapper
function switchScreen(screenId) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active-screen');
        screen.style.display = 'none';
    });

    // Show selected screen
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.style.display = 'block';
        setTimeout(() => {
            targetScreen.classList.add('active-screen');
        }, 50);
    }

    // Update active nav link
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // Match sidebar item
    let navId = '';
    if (screenId === 'screen-registration') navId = 'nav-registration';
    else if (screenId === 'screen-dashboard') navId = 'nav-dashboard';
    else if (screenId === 'screen-history') navId = 'nav-history';
    else if (screenId === 'screen-consultation') navId = 'nav-consultation';

    const activeNav = document.getElementById(navId);
    if (activeNav) {
        activeNav.classList.add('active');
    }

    // Update headers
    const headerInfo = SCREEN_TITLES[screenId];
    if (headerInfo) {
        document.getElementById('page-title').innerText = headerInfo.title;
        document.getElementById('page-desc').innerText = headerInfo.desc;
    }

    currentScreen = screenId;
    
    // Re-create icons for any newly rendered content
    lucide.createIcons();
}

// Navigation Guards
function tryNavigateHistory() {
    if (activePatient) {
        switchScreen('screen-history');
        renderCaseHistory();
    } else {
        showToast("Please search or scan a patient first.", "danger");
    }
}

function tryNavigateConsultation() {
    if (activePatient) {
        switchScreen('screen-consultation');
        prepareConsultationForm();
    } else {
        showToast("Please search or scan a patient first.", "danger");
    }
}

// Screen 1: Registration Handler
async function handleRegistration(event) {
    event.preventDefault();

    const name = document.getElementById('reg-name').value.trim();
    const age = parseInt(document.getElementById('reg-age').value);
    const gender = document.getElementById('reg-gender').value;
    const phone = document.getElementById('reg-phone').value.trim();
    const allergies = document.getElementById('reg-allergies').value.trim() || 'None';
    const conditions = document.getElementById('reg-conditions').value.trim() || 'None';

    if (!name || isNaN(age) || !gender || !phone) {
        showToast("Please fill all required fields.", "danger");
        return;
    }

    const patientData = {
        name: name,
        age: age,
        gender: gender,
        phone: phone,
        allergies: allergies,
        conditions: conditions
    };

    try {
        // API Call to register patient
        const response = await apiRegisterPatient(patientData);
        const registeredPatient = response.patient;

        // Update UI elements
        document.getElementById('success-patient-id').innerText = registeredPatient.id;
        
        // Generate QR Code URL
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${registeredPatient.id}`;
        document.getElementById('success-qr-code').src = qrCodeUrl;

        // Transition panels
        document.getElementById('registration-form-card').style.display = 'none';
        document.getElementById('registration-success-card').style.display = 'block';

        showToast("Patient registered successfully!");
        
        // Set active patient
        activePatient = registeredPatient;
        
        // Enable history & consultation menu tabs
        document.getElementById('nav-history').classList.remove('disabled');
        document.getElementById('nav-consultation').classList.remove('disabled');
    } catch (err) {
        showToast(err.message || "Registration failed", "danger");
    }
}

function copyPatientId() {
    const idText = document.getElementById('success-patient-id').innerText;
    navigator.clipboard.writeText(idText).then(() => {
        showToast("Patient ID copied to clipboard!");
        
        // Temporarily change icon to checkmark
        const copyIcon = document.getElementById('copy-icon');
        copyIcon.setAttribute('data-lucide', 'check');
        lucide.createIcons();
        
        setTimeout(() => {
            copyIcon.setAttribute('data-lucide', 'copy');
            lucide.createIcons();
        }, 2000);
    }).catch(err => {
        console.error("Failed to copy ID: ", err);
    });
}

function resetRegistrationForm() {
    document.getElementById('patient-registration-form').reset();
    document.getElementById('registration-success-card').style.display = 'none';
    document.getElementById('registration-form-card').style.display = 'block';
}

function goToDashboardWithId() {
    switchScreen('screen-dashboard');
    if (activePatient) {
        document.getElementById('dashboard-search-id').value = activePatient.id;
        searchPatient();
    }
}

// Screen 2: Doctor Dashboard (Search & QR Scan)
async function searchPatient() {
    const searchInput = document.getElementById('dashboard-search-id').value.trim();
    if (!searchInput) {
        showToast("Please enter a Patient ID.", "danger");
        return;
    }

    try {
        // Fetch patient from backend database
        const patient = await apiSearchPatient(searchInput);
        activePatient = patient;
        
        // Show details card
        document.getElementById('quick-name').innerText = patient.name;
        document.getElementById('quick-id').innerText = patient.id;
        document.getElementById('quick-gender').innerText = patient.gender;
        document.getElementById('quick-age').innerText = patient.age;
        document.getElementById('quick-phone').innerText = patient.phone;
        
        // Set gender badge text/class
        const genderBadge = document.getElementById('quick-gender-badge');
        genderBadge.innerText = patient.gender;

        // Allergies check
        const allergyBox = document.getElementById('quick-allergy-box');
        const allergyText = document.getElementById('quick-allergies');
        const allergyIcon = document.getElementById('quick-allergy-icon');
        
        if (patient.allergies && patient.allergies.toLowerCase() !== 'none') {
            allergyBox.className = 'quick-critical-box has-allergies';
            allergyText.innerText = patient.allergies;
            allergyIcon.setAttribute('data-lucide', 'alert-triangle');
        } else {
            allergyBox.className = 'quick-critical-box no-allergies';
            allergyText.innerText = "No known allergies listed.";
            allergyIcon.setAttribute('data-lucide', 'check-circle-2');
        }

        // Enable tabs
        document.getElementById('nav-history').classList.remove('disabled');
        document.getElementById('nav-consultation').classList.remove('disabled');

        // Show card
        document.getElementById('dashboard-patient-card').style.display = 'block';
        
        showToast("Patient record located.");
        lucide.createIcons();
    } catch (err) {
        showToast("Patient not found. Please check the Patient ID.", "danger");
        document.getElementById('dashboard-patient-card').style.display = 'none';
        
        // Disable tabs if no current patient
        if (!activePatient) {
            document.getElementById('nav-history').classList.add('disabled');
            document.getElementById('nav-consultation').classList.add('disabled');
        }
    }
}

// Simulated Camera Scanner Overlay
function openScanner() {
    const modal = document.getElementById('scanner-modal');
    const statusText = document.getElementById('scanner-status');
    
    modal.classList.add('modal-active');
    statusText.innerText = "Connecting camera feed...";
    statusText.className = "scanner-status scanning";

    // Step 1: Simulate connection
    setTimeout(() => {
        statusText.innerText = "Positioning viewfinder... Reading scanner feed.";
        
        // Step 2: Simulate scanning
        setTimeout(() => {
            statusText.innerText = "Scanning QR Code... Please hold card steady.";
            
            // Step 3: Fetch latest patient from live database dynamically!
            setTimeout(async () => {
                try {
                    const latest = await apiGetLatestPatient();
                    statusText.innerText = `Success! Scanned ID (${latest.id})`;
                    statusText.className = "scanner-status success";
                    
                    // Step 4: Load scanned patient
                    setTimeout(() => {
                        closeScanner();
                        document.getElementById('dashboard-search-id').value = latest.id;
                        searchPatient();
                    }, 1000);
                } catch (err) {
                    statusText.innerText = "Scanner Error: No registered patients found in system.";
                    statusText.className = "scanner-status error";
                    setTimeout(() => {
                        closeScanner();
                        showToast("Please register a patient first before using the scanner.", "danger");
                    }, 2000);
                }
            }, 1200);
        }, 1000);
    }, 800);
}

function closeScanner() {
    document.getElementById('scanner-modal').classList.remove('modal-active');
}

// Screen 3: Patient Case History Renderer
function goToCaseHistory() {
    if (!activePatient) return;
    switchScreen('screen-history');
    renderCaseHistory();
}

async function renderCaseHistory() {
    if (!activePatient) return;

    try {
        // Load fresh data from live API
        const data = await apiGetPatientHistory(activePatient.id);
        activePatient = data.patient;
        const consultations = data.consultations;

        // Profile header
        document.getElementById('history-patient-name').innerText = activePatient.name;
        document.getElementById('history-patient-id').innerText = activePatient.id;
        document.getElementById('history-patient-age').innerText = activePatient.age;
        document.getElementById('history-patient-gender').innerText = activePatient.gender;
        document.getElementById('history-patient-phone').innerText = activePatient.phone;

        // Allergy warnings
        const allergyBanner = document.getElementById('history-allergy-banner');
        const allergyText = document.getElementById('history-allergy-text');
        
        if (activePatient.allergies && activePatient.allergies.toLowerCase() !== 'none') {
            allergyBanner.style.display = 'flex';
            allergyText.innerText = activePatient.allergies;
        } else {
            allergyBanner.style.display = 'none';
        }

        // Sidebar cards
        document.getElementById('history-conditions').innerText = activePatient.conditions || 'None';
        
        // Smart Case Summary
        const summaryElement = document.getElementById('history-smart-summary');
        if (consultations.length === 0) {
            summaryElement.innerText = "No consultation history available yet.";
        } else {
            summaryElement.innerText = activePatient.summary;
        }

        // Chronological Timeline
        const timelineContainer = document.getElementById('patient-timeline');
        timelineContainer.innerHTML = '';

        if (consultations.length === 0) {
            timelineContainer.innerHTML = `
                <div class="empty-timeline">
                    <i data-lucide="folder-open"></i>
                    <p>No previous consultations found for this patient.</p>
                    <p style="font-size: 0.85rem; margin-top: 4px;">Click "+ Add New Consultation" to begin recording history.</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        // Render database entries
        consultations.forEach(consult => {
            const item = document.createElement('div');
            item.className = 'timeline-item';
            
            const notesSection = consult.notes ? `<div class="timeline-notes"><strong>Notes:</strong> ${consult.notes}</div>` : '';
            
            item.innerHTML = `
                <div class="timeline-node"></div>
                <div class="timeline-date-doctor">
                    <div class="timeline-date">${formatDate(consult.date)}</div>
                    <div class="timeline-doctor">
                        <i data-lucide="user-cog"></i>
                        ${consult.doctor_name} (${consult.specialization}) at ${consult.hospital_name}
                    </div>
                </div>
                <div class="timeline-card">
                    <div class="timeline-detail-row">
                        <div class="timeline-label">Symptoms</div>
                        <div class="timeline-content">${consult.symptoms}</div>
                    </div>
                    <div class="timeline-detail-row">
                        <div class="timeline-label">Diagnosis</div>
                        <div class="timeline-content" style="font-weight: 600; color: var(--danger);">${consult.diagnosis}</div>
                    </div>
                    <div class="timeline-detail-row">
                        <div class="timeline-label">Treatment Prescribed</div>
                        <div class="timeline-content" style="color: var(--accent-teal); font-weight: 500;">${consult.treatment}</div>
                    </div>
                    ${notesSection}
                    
                    <!-- Chronological Flow layout: Date -> Doctor -> Symptoms -> Diagnosis -> Treatment -->
                    <div class="flow-diagram">
                        <span class="flow-step date">${formatDate(consult.date)}</span>
                        <span class="flow-arrow"><i data-lucide="chevron-right" style="width:10px; height:10px;"></i></span>
                        <span class="flow-step doc">${consult.doctor_name}</span>
                        <span class="flow-arrow"><i data-lucide="chevron-right" style="width:10px; height:10px;"></i></span>
                        <span class="flow-step sym">Symptoms: ${truncateText(consult.symptoms, 15)}</span>
                        <span class="flow-arrow"><i data-lucide="chevron-right" style="width:10px; height:10px;"></i></span>
                        <span class="flow-step diag">Diag: ${truncateText(consult.diagnosis, 15)}</span>
                        <span class="flow-arrow"><i data-lucide="chevron-right" style="width:10px; height:10px;"></i></span>
                        <span class="flow-step treat">Treat: ${truncateText(consult.treatment, 15)}</span>
                    </div>
                </div>
            `;
            timelineContainer.appendChild(item);
        });

        lucide.createIcons();
    } catch (err) {
        showToast(err.message || "Failed to load timeline", "danger");
    }
}

// Screen 4: Add Consultation
function goToAddConsultation() {
    if (!activePatient) return;
    switchScreen('screen-consultation');
    prepareConsultationForm();
}

function prepareConsultationForm() {
    document.getElementById('consultation-active-patient').innerText = `${activePatient.name} (${activePatient.id})`;
    document.getElementById('consultation-form').reset();
    
    // Default the date input to today's date in local YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('consult-date').value = today;
}

async function handleSaveConsultation(event) {
    event.preventDefault();

    if (!activePatient) {
        showToast("Error: No active patient selected.", "danger");
        return;
    }

    const symptoms = document.getElementById('consult-symptoms').value.trim();
    const diagnosis = document.getElementById('consult-diagnosis').value.trim();
    const doctorName = document.getElementById('consult-doctor').value.trim();
    const specialization = document.getElementById('consult-specialization').value.trim();
    const hospitalName = document.getElementById('consult-hospital').value.trim();
    const date = document.getElementById('consult-date').value;
    const treatment = document.getElementById('consult-treatment').value.trim();
    const notes = document.getElementById('consult-notes').value.trim();

    if (!symptoms || !diagnosis || !doctorName || !specialization || !hospitalName || !date || !treatment) {
        showToast("Please fill all required clinical fields.", "danger");
        return;
    }

    const payload = {
        patient_id: activePatient.id,
        date: date,
        doctor_name: doctorName,
        specialization: specialization,
        hospital_name: hospitalName,
        symptoms: symptoms,
        diagnosis: diagnosis,
        treatment: treatment,
        notes: notes
    };

    try {
        await apiAddConsultation(payload);
        showToast("Consultation saved successfully!");
        
        // Reset form and return to patient history timeline
        document.getElementById('consultation-form').reset();
        switchScreen('screen-history');
        renderCaseHistory();
    } catch (err) {
        showToast(err.message || "Failed to save consultation", "danger");
    }
}

function cancelAddConsultation() {
    switchScreen('screen-history');
    renderCaseHistory();
}

// Toast Helper
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const iconName = type === 'success' ? 'check-circle' : 'alert-circle';
    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);
    lucide.createIcons();

    // Fade out and remove
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s ease';
        setTimeout(() => {
            toast.remove();
        }, 500);
    }, 3000);
}

// Formatting helpers
function formatDate(dateStr) {
    if (!dateStr) return '';
    
    // Parse YYYY-MM-DD correctly without timezone shifts
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const date = new Date(year, month, day);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function truncateText(text, maxChars) {
    if (!text) return '';
    if (text.length <= maxChars) return text;
    return text.substring(0, maxChars) + '...';
}
