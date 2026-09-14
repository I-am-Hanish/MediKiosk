
// ============================================================
// MediKiosk Frontend Application Controller
// ============================================================

let activePatient = null;
let currentScreen = "screen-registration";
let loadedConsultations = [];
let loadedDocuments = [];
let selectedDocumentFile = null;


let html5QrCode = null;
let isScanning = false;

// ============================================================
// GLOBAL HELPER — used by openViewConsultation and inline code
// ============================================================

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.innerText = value ?? "";
    }
}

// ============================================================
// PAGE TITLES
// ============================================================

const SCREEN_TITLES = {
    "screen-login": {
        title: "Secure Healthcare Access",
        desc: "Sign in to your MediKiosk account"
    },

    "screen-doctor-register": {
        title: "Doctor Account Registration",
        desc: "Create a new doctor account to access clinical features"
    },

    "screen-registration": {
        title: "Patient Registration",
        desc: "Register a new patient and generate their digital health card"
    },

    "screen-dashboard": {
        title: "Doctor Dashboard",
        desc: "Locate patient profiles and manage clinical consults"
    },

    "screen-history": {
        title: "Patient Case History",
        desc: "View comprehensive clinical history, timeline, and smart summaries"
    },

    "screen-consultation": {
        title: "Add New Consultation",
        desc: "Record patient symptoms, clinical diagnosis, and treatments"
    }
};

// ============================================================
// DOCUMENT READY
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    // ── Auth-gated startup ──────────────────────────────────────
    // If there is no valid auth token in session, send the user to
    // the login screen immediately regardless of any saved state.
    const token = typeof getAuthToken === "function" ? getAuthToken() : null;
    const role  = typeof getAuthRole  === "function" ? getAuthRole()  : null;

    if (!token) {
        // No session — always land on the login screen
        switchScreen("screen-login");
        updateSidebarForRole(null);
        return;
    }

    // Token exists — validate it against the server
    const userInfo = typeof apiGetCurrentUser === "function" ? await apiGetCurrentUser() : null;
    if (!userInfo) {
        // Token invalid or expired
        if (typeof clearAuthSession === "function") clearAuthSession();
        switchScreen("screen-login");
        updateSidebarForRole(null);
        return;
    }

    // Token is valid — restore session based on role
    updateSidebarForRole(role);
    updateAuthUserBar();

    const storedScreen = sessionStorage.getItem("currentScreen") || "";

    if (role === "PATIENT") {
        const patientId = typeof getAuthPatientId === "function" ? getAuthPatientId() : null;
        if (patientId) {
            try {
                if (storedScreen === "screen-history") {
                    const data = await apiGetPatientHistory(patientId);
                    activePatient = data.patient;
                    loadedConsultations = data.consultations || [];
                    enablePatientNavigation();
                    populateDashboardCard(activePatient);
                    switchScreen("screen-history");
                    await renderCaseHistory();
                } else {
                    const patient = await apiSearchPatient(patientId);
                    activePatient = patient;
                    enablePatientNavigation();
                    populateDashboardCard(patient);
                    switchScreen("screen-history");
                    await renderCaseHistory();
                }
                return;
            } catch (err) {
                console.warn("Could not restore patient session:", err);
            }
        }
        switchScreen("screen-history");
        return;
    }

    if (role === "DOCTOR") {
        const allowed = ["screen-dashboard", "screen-registration", "screen-history", "screen-consultation"];
        const targetScreen = allowed.includes(storedScreen) ? storedScreen : "screen-dashboard";

        if (storedScreen === "screen-history" && activePatient) {
            switchScreen("screen-history");
            await renderCaseHistory();
        } else {
            switchScreen(targetScreen);
        }
        return;
    }

    // Fallback
    switchScreen("screen-login");
});

// ============================================================
// NAVIGATION
// ============================================================

function switchScreen(screenId) {

    if (typeof closeMobileNav === "function") {
        closeMobileNav();
    }

    if (typeof closeMedicalJourneyModal === "function") {
        closeMedicalJourneyModal();
    }

    // ── Registration screen: always start fresh ──────────────────
    // Clear the previous patient's QR, ID, and success panel every
    // time the user enters the Registration page, regardless of how
    // they got here (nav click, back button, or page restore).
    if (screenId === "screen-registration") {
        resetRegistrationState();
    }

    // ── Doctor register: reset to form view ──────────────────────
    if (screenId === "screen-doctor-register") {
        const formCard    = document.getElementById("doctor-reg-form-card");
        const successCard = document.getElementById("doctor-reg-success-card");
        const regForm     = document.getElementById("doctor-registration-form");
        if (formCard)    formCard.style.display    = "block";
        if (successCard) successCard.style.display = "none";
        if (regForm)     regForm.reset();
        const errBanner = document.getElementById("doctor-reg-error-banner");
        if (errBanner)   errBanner.style.display = "none";
    }

    document.querySelectorAll(".screen").forEach(screen => {

        screen.classList.remove("active-screen");

        screen.style.display = "none";
    });

    const targetScreen =
        document.getElementById(screenId);

    if (targetScreen) {

        targetScreen.style.display = "block";

        setTimeout(() => {
            targetScreen.classList.add("active-screen");
        }, 50);
    }

    document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.remove("active");
    });

    let navId = "";

    switch (screenId) {

        case "screen-login":
        case "screen-doctor-register":
            navId = "nav-login";
            break;

        case "screen-registration":
            navId = "nav-registration";
            break;

        case "screen-dashboard":
            navId = "nav-dashboard";
            break;

        case "screen-history":
            navId = "nav-history";
            break;

        case "screen-consultation":
            navId = "nav-consultation";
            break;
    }

    const activeNav =
        document.getElementById(navId);

    if (activeNav) {
        activeNav.classList.add("active");
    }

    const headerInfo =
        SCREEN_TITLES[screenId];

    if (headerInfo) {

        const title =
            document.getElementById("page-title");

        const desc =
            document.getElementById("page-desc");

        if (title) {
            title.innerText = headerInfo.title;
        }

        if (desc) {
            desc.innerText = headerInfo.desc;
        }
    }

    currentScreen = screenId;

    sessionStorage.setItem(
        "currentScreen",
        screenId
    );

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

// ============================================================
// NAVIGATION GUARDS
// ============================================================

function enablePatientNavigation() {

    const historyNav =
        document.getElementById("nav-history");

    const consultationNav =
        document.getElementById("nav-consultation");

    if (historyNav) {
        historyNav.classList.remove("disabled");
    }

    if (consultationNav) {
        consultationNav.classList.remove("disabled");
    }
}

function disablePatientNavigation() {

    const historyNav =
        document.getElementById("nav-history");

    const consultationNav =
        document.getElementById("nav-consultation");

    if (historyNav) {
        historyNav.classList.add("disabled");
    }

    if (consultationNav) {
        consultationNav.classList.add("disabled");
    }
}

function tryNavigateHistory() {

    if (!activePatient) {

        showToast(
            "Please search or scan a patient first.",
            "danger"
        );

        return;
    }

    switchScreen("screen-history");

    renderCaseHistory();
}

function tryNavigateConsultation() {

    if (!activePatient) {

        showToast(
            "Please search or scan a patient first.",
            "danger"
        );

        return;
    }

    switchScreen("screen-consultation");

    prepareConsultationForm();
}

// ============================================================
// PATIENT REGISTRATION
// ============================================================

let isRegistering = false;

async function handleRegistration(event) {

    if (event) {
        event.preventDefault();
        if (typeof event.stopPropagation === "function") {
            event.stopPropagation();
        }
    }

    if (isRegistering) {
        return;
    }

    const name =
        document.getElementById("reg-name").value.trim();

    const age =
        parseInt(
            document.getElementById("reg-age").value,
            10
        );

    const gender =
        document.getElementById("reg-gender").value;

    const phone =
        document.getElementById("reg-phone").value.trim();

    const allergies =
        document.getElementById("reg-allergies").value.trim() ||
        "None";

    const conditions =
        document.getElementById("reg-conditions").value.trim() ||
        "None";

    const email =
        (document.getElementById("reg-email")?.value || "").trim() || null;

    const password =
        (document.getElementById("reg-password")?.value || "").trim();

    const confirmPassword =
        (document.getElementById("reg-confirm-password")?.value || "").trim();

    // Field Validations
    if (!name || isNaN(age) || !gender || !phone) {
        showToast("Please fill in all mandatory fields marked with *.", "danger");
        return;
    }

    if (age < 0 || age > 130) {
        showToast("Please enter a valid age between 0 and 130.", "danger");
        const ageInput = document.getElementById("reg-age");
        if (ageInput) ageInput.focus();
        return;
    }

    if (!/^\d{10}$/.test(phone)) {
        showToast("Phone number must be exactly 10 digits.", "danger");
        const phoneInput = document.getElementById("reg-phone");
        if (phoneInput) phoneInput.focus();
        return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast("Please enter a valid email address.", "danger");
        const emailInput = document.getElementById("reg-email");
        if (emailInput) emailInput.focus();
        return;
    }

    if (!password || password.length < 6) {
        showToast("Account password must be at least 6 characters.", "danger");
        const passInput = document.getElementById("reg-password");
        if (passInput) passInput.focus();
        return;
    }

    if (password !== confirmPassword) {
        showToast("Passwords do not match. Please re-enter your password.", "danger");
        const confirmInput = document.getElementById("reg-confirm-password");
        if (confirmInput) confirmInput.focus();
        return;
    }

    const patientData = {
        name,
        age,
        gender,
        phone,
        email,
        allergies,
        conditions,
        password
    };

    const submitBtn = document.querySelector("#patient-registration-form button[type='submit']");
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : "Register Patient";

    try {
        isRegistering = true;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span class="btn-spinner"></span> Registering & Generating Card...`;
        }

        const response = await apiRegisterPatient(patientData);

        if (!response || response.status !== "success" || !response.patient || !response.patient.id) {
            throw new Error(
                "Registration failed. Valid confirmation not received from server."
            );
        }

        const registeredPatient = response.patient;

        // ====================================================
        // QR CONTAINS ONLY PATIENT ID
        // Use local backend QR endpoint with external CDN fallback
        // ====================================================
        const localQrUrl = apiGetPatientQrUrl(registeredPatient.id);
        const fallbackQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(registeredPatient.id)}`;

        document.getElementById("success-patient-id").innerText =
            registeredPatient.id;

        const qrImg = document.getElementById("success-qr-code");
        if (qrImg) {
            qrImg.src = localQrUrl;
            qrImg.onerror = function () {
                this.onerror = null;
                this.src = fallbackQrUrl;
            };
        }

        // ====================================================
        // Show Success Panel
        // ====================================================
        document.getElementById("registration-form-card").style.display = "none";
        document.getElementById("registration-success-card").style.display = "block";

        activePatient = registeredPatient;

        sessionStorage.setItem(
            "activePatientId",
            registeredPatient.id
        );

        enablePatientNavigation();

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        if (response.existing_patient) {
            showToast(
                `Existing patient record found (${registeredPatient.id}).`,
                "success"
            );
        } else {
            showToast(
                registeredPatient.email
                    ? `Patient registered! Health ID card dispatched to ${registeredPatient.email}`
                    : `Patient registered successfully! ID: ${registeredPatient.id}`,
                "success"
            );
        }

    } catch (error) {
        console.error("Registration error:", error);
        showToast(error.message || "Registration failed. Please check inputs.", "danger");
    } finally {
        isRegistering = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHtml;
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
        }
    }
}

// ============================================================
// COPY PATIENT ID
// ============================================================

function copyPatientId() {

    const element =
        document.getElementById(
            "success-patient-id"
        );

    if (!element) return;

    const idText =
        element.innerText;

    if (
        navigator.clipboard &&
        navigator.clipboard.writeText
    ) {

        navigator.clipboard
            .writeText(idText)
            .then(() => {

                showToast(
                    "Patient ID copied to clipboard!"
                );

            })
            .catch(error => {

                console.error(
                    "Failed to copy ID:",
                    error
                );

                showToast(
                    "Unable to copy Patient ID.",
                    "danger"
                );
            });

    } else {

        showToast(
            "Clipboard is not available.",
            "danger"
        );
    }
}

// ============================================================
// RESET REGISTRATION
// ============================================================

/**
 * resetRegistrationState — full DOM wipe for the Registration screen.
 *
 * Called automatically by switchScreen() on every entry to screen-registration
 * so that no previous patient's QR code, Patient ID, or success message ever
 * leaks across navigation sessions.
 *
 * Also called by resetRegistrationForm() ("Register Another Patient" button)
 * for an equivalent clean slate within the same visit.
 *
 * Does NOT touch the database, activePatient, or sessionStorage.
 */
function resetRegistrationState() {

    // Clear the displayed Patient ID text
    const idDisplay = document.getElementById("success-patient-id");
    if (idDisplay) {
        idDisplay.innerText = "";
    }

    // Clear the QR image so the old image is not visible even for a frame
    const qrImg = document.getElementById("success-qr-code");
    if (qrImg) {
        qrImg.src = "";
        qrImg.onerror = null;
    }

    // Hide success card, show form card
    const successCard = document.getElementById("registration-success-card");
    if (successCard) {
        successCard.style.display = "none";
    }

    const formCard = document.getElementById("registration-form-card");
    if (formCard) {
        formCard.style.display = "block";
    }

    // Reset form fields to blank
    const form = document.getElementById("patient-registration-form");
    if (form) {
        form.reset();
    }
}

/**
 * resetRegistrationForm — triggered by the "Register Another Patient" button.
 * Delegates to the same full reset so behaviour is consistent.
 */
function resetRegistrationForm() {
    resetRegistrationState();
}

// ============================================================
// GO TO DASHBOARD
// ============================================================

function goToDashboardWithId() {

    switchScreen("screen-dashboard");

    if (activePatient) {

        const input =
            document.getElementById(
                "dashboard-search-id"
            );

        if (input) {
            input.value =
                activePatient.id;
        }

        searchPatient(
            activePatient.id
        );
    }
}

// ============================================================
// DASHBOARD / PATIENT SEARCH
// ============================================================

async function searchPatient(specificId = null) {

    const inputElement =
        document.getElementById(
            "dashboard-search-id"
        );

    const searchInput =
        (
            specificId ||
            inputElement?.value ||
            ""
        ).trim();

    if (!searchInput) {

        showToast(
            "Please enter a Patient ID.",
            "danger"
        );

        return;
    }

    const searchBtn = document.querySelector(".search-container button.btn-primary");
    const origSearchBtnHtml = searchBtn ? searchBtn.innerHTML : "Search Patient";

    try {
        if (searchBtn) {
            searchBtn.disabled = true;
            searchBtn.innerHTML = `<span class="btn-spinner"></span> Searching...`;
        }

        const patient =
            await apiSearchPatient(searchInput);

        if (!patient) {
            throw new Error(
                "Patient not found."
            );
        }

        activePatient =
            patient;

        sessionStorage.setItem(
            "activePatientId",
            patient.id
        );

        populateDashboardCard(patient);

        enablePatientNavigation();

        const patientCard =
            document.getElementById(
                "dashboard-patient-card"
            );

        if (patientCard) {
            patientCard.style.display =
                "block";
        }

        showToast(
            `Patient record located (${patient.id}).`,
            "success"
        );

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

    } catch (error) {

        console.error(
            "Patient search error:",
            error
        );

        showToast(
            error.message ||
            "Patient not found. Please check the Patient ID.",
            "danger"
        );

        const patientCard =
            document.getElementById(
                "dashboard-patient-card"
            );

        if (patientCard) {
            patientCard.style.display =
                "none";
        }

        activePatient = null;

        sessionStorage.removeItem(
            "activePatientId"
        );

        disablePatientNavigation();
    } finally {
        if (searchBtn) {
            searchBtn.disabled = false;
            searchBtn.innerHTML = origSearchBtnHtml;
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
        }
    }
}

// ============================================================
// DASHBOARD PATIENT CARD
// ============================================================

function populateDashboardCard(patient) {

    if (!patient) return;

    const setText =
        (id, value) => {

            const element =
                document.getElementById(id);

            if (element) {
                element.innerText =
                    value ?? "";
            }
        };

    setText(
        "quick-name",
        patient.name
    );

    setText(
        "quick-id",
        patient.id
    );

    setText(
        "quick-gender",
        patient.gender
    );

    setText(
        "quick-age",
        patient.age
    );

    setText(
        "quick-phone",
        patient.phone
    );

    const genderBadge =
        document.getElementById(
            "quick-gender-badge"
        );

    if (genderBadge) {
        genderBadge.innerText =
            patient.gender || "";
    }

    const allergyBox =
        document.getElementById(
            "quick-allergy-box"
        );

    const allergyText =
        document.getElementById(
            "quick-allergies"
        );

    const allergyIcon =
        document.getElementById(
            "quick-allergy-icon"
        );

    const allergyValue =
        String(patient.allergies || "")
            .trim();

    const hasAllergies =
        allergyValue &&
        allergyValue.toLowerCase() !== "none";

    if (hasAllergies) {

        if (allergyBox) {
            allergyBox.className =
                "quick-critical-box has-allergies";
        }

        if (allergyText) {
            allergyText.innerText =
                allergyValue;
        }

        if (allergyIcon) {
            allergyIcon.setAttribute(
                "data-lucide",
                "alert-triangle"
            );
        }

    } else {

        if (allergyBox) {
            allergyBox.className =
                "quick-critical-box no-allergies";
        }

        if (allergyText) {
            allergyText.innerText =
                "No known allergies listed.";
        }

        if (allergyIcon) {
            allergyIcon.setAttribute(
                "data-lucide",
                "check-circle-2"
            );
        }
    }

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

// ============================================================
// QR SCANNER
// ============================================================

async function openScanner() {

    const modal =
        document.getElementById(
            "scanner-modal"
        );

    const statusText =
        document.getElementById(
            "scanner-status"
        );

    const manualInput =
        document.getElementById(
            "scanner-manual-id"
        );

    if (!modal) return;

    modal.classList.add(
        "modal-active"
    );

    if (manualInput) {
        manualInput.value = "";
    }

    if (statusText) {

        statusText.innerText =
            "Initializing camera feed...";

        statusText.className =
            "scanner-status scanning";
    }

    if (
        typeof Html5Qrcode ===
        "undefined"
    ) {

        showScannerFallback();

        return;
    }

    try {

        if (html5QrCode && isScanning) {
            await stopScanner();
        }

        if (!html5QrCode) {

            html5QrCode =
                new Html5Qrcode(
                    "qr-reader"
                );
        }

        const qrReader =
            document.getElementById(
                "qr-reader"
            );

        const placeholder =
            document.getElementById(
                "scanner-camera-placeholder"
            );

        const laser =
            document.getElementById(
                "scanner-laser"
            );

        if (qrReader) {
            qrReader.style.display =
                "block";
        }

        if (placeholder) {
            placeholder.style.display =
                "none";
        }

        if (laser) {
            laser.style.display =
                "none";
        }

        await html5QrCode.start(

            {
                facingMode: "environment"
            },

            {
                fps: 10,
                qrbox: {
                    width: 220,
                    height: 220
                }
            },

            decodedText => {
                handleQrSuccess(decodedText);
            },

            () => {
                // QR not detected yet.
            }
        );

        isScanning = true;

        if (statusText) {

            statusText.innerText =
                "Camera active. Align patient QR code inside window.";

            statusText.className =
                "scanner-status scanning";
        }

    } catch (error) {

        console.warn(
            "Camera start failed:",
            error
        );

        showScannerFallback();
    }
}

// ============================================================
// SCANNER FALLBACK
// ============================================================

function showScannerFallback() {

    const qrReader =
        document.getElementById(
            "qr-reader"
        );

    const placeholder =
        document.getElementById(
            "scanner-camera-placeholder"
        );

    const laser =
        document.getElementById(
            "scanner-laser"
        );

    const statusText =
        document.getElementById(
            "scanner-status"
        );

    if (qrReader) {
        qrReader.style.display =
            "none";
    }

    if (placeholder) {
        placeholder.style.display =
            "block";
    }

    if (laser) {
        laser.style.display =
            "block";
    }

    if (statusText) {

        statusText.innerText =
            "Camera unavailable. Enter Patient ID manually below.";

        statusText.className =
            "scanner-status";
    }
}

// ============================================================
// QR SUCCESS
// ============================================================

async function handleQrSuccess(decodedText) {

    const rawText =
        String(decodedText || "").trim();

    if (!rawText) return;

    // ── Extract patient ID from the report URL encoded in the QR ──
    // QR encodes: http(s)://host/report/MK-2026-XXXX
    // Extract just the patient ID so the dashboard can search it.
    let cleanId = rawText;

    const reportUrlMatch =
        rawText.match(/\/report\/([A-Z0-9\-]+)$/i);

    if (reportUrlMatch) {
        cleanId = reportUrlMatch[1].toUpperCase();
    }

    if (!cleanId) return;

    const statusText =
        document.getElementById(
            "scanner-status"
        );

    if (statusText) {

        statusText.innerText =
            `QR Detected: ${cleanId}`;

        statusText.className =
            "scanner-status success";
    }

    await stopScanner();

    document.getElementById(
        "scanner-modal"
    ).classList.remove(
        "modal-active"
    );

    const searchInput =
        document.getElementById(
            "dashboard-search-id"
        );

    if (searchInput) {
        searchInput.value =
            cleanId;
    }

    await searchPatient(cleanId);
}

// ============================================================
// MANUAL SCANNER SUBMIT
// ============================================================

async function handleScannerManualSubmit() {

    const manualInput =
        document.getElementById(
            "scanner-manual-id"
        );

    const inputVal =
        manualInput?.value.trim() || "";

    if (!inputVal) {

        showToast(
            "Please enter a Patient ID.",
            "danger"
        );

        return;
    }

    if (manualInput) {
        manualInput.value = "";
    }

    await stopScanner();

    document.getElementById(
        "scanner-modal"
    ).classList.remove(
        "modal-active"
    );

    const searchInput =
        document.getElementById(
            "dashboard-search-id"
        );

    if (searchInput) {
        searchInput.value =
            inputVal;
    }

    await searchPatient(inputVal);
}

function submitScannerManualId() {
    return handleScannerManualSubmit();
}

// ============================================================
// MANUAL SCANNER ENTER KEY
// ============================================================

function handleScannerKeypress(event) {

    if (event.key === "Enter") {

        event.preventDefault();

        handleScannerManualSubmit();
    }
}

// ============================================================
// CLOSE SCANNER
// ============================================================
// Required structure

function closeScanner() {

    stopScanner();

    document.getElementById(
        "scanner-modal"
    ).classList.remove(
        "modal-active"
    );
}

// ============================================================
// STOP SCANNER
// ============================================================

async function stopScanner() {

    if (html5QrCode && isScanning) {

        try {

            await html5QrCode.stop();

        } catch (error) {

            console.warn(
                "Error stopping QR scanner:",
                error
            );
        }

        isScanning = false;
    }

    const qrReader =
        document.getElementById(
            "qr-reader"
        );

    if (qrReader) {

        qrReader.style.display =
            "none";
    }

    const placeholder =
        document.getElementById(
            "scanner-camera-placeholder"
        );

    if (placeholder) {

        placeholder.style.display =
            "block";
    }

    const laser =
        document.getElementById(
            "scanner-laser"
        );

    if (laser) {

        laser.style.display =
            "block";
    }
}

// ============================================================
// PATIENT HISTORY
// ============================================================

function goToCaseHistory() {

    if (!activePatient) {

        showToast(
            "Please select a patient first.",
            "danger"
        );

        return;
    }

    switchScreen(
        "screen-history"
    );

    renderCaseHistory();
}

async function renderCaseHistory() {

    if (!activePatient) return;

    try {

        const data =
            await apiGetPatientHistory(
                activePatient.id
            );

        activePatient =
            data.patient;

        loadedConsultations =
            data.consultations || [];

        loadedDocuments =
            data.documents || [];


        const setText =
            (id, value) => {

                const element =
                    document.getElementById(id);

                if (element) {
                    element.innerText =
                        value ?? "";
                }
            };

        setText(
            "history-patient-name",
            activePatient.name
        );

        setText(
            "history-patient-id",
            activePatient.id
        );

        setText(
            "history-patient-age",
            activePatient.age
        );

        setText(
            "history-patient-gender",
            activePatient.gender
        );

        setText(
            "history-patient-phone",
            activePatient.phone
        );

        const allergyBanner =
            document.getElementById(
                "history-allergy-banner"
            );

        const allergyText =
            document.getElementById(
                "history-allergy-text"
            );

        const allergyValue =
            String(
                activePatient.allergies || ""
            ).trim();

        const hasAllergies =
            allergyValue &&
            allergyValue.toLowerCase() !== "none";

        if (allergyBanner) {

            allergyBanner.style.display =
                hasAllergies
                    ? "flex"
                    : "none";
        }

        if (
            hasAllergies &&
            allergyText
        ) {
            allergyText.innerText =
                allergyValue;
        }

        setText(
            "history-conditions",
            activePatient.conditions || "None"
        );

        const summaryElement =
            document.getElementById(
                "history-smart-summary"
            );

        if (summaryElement) {
            const rawSummary =
                loadedConsultations.length === 0
                    ? "No consultation history available yet."
                    : activePatient.summary ||
                    "No consultation history available yet.";

            // Render compactly with View More toggle for long summaries
            const SUMMARY_LIMIT = 160;
            if (rawSummary.length <= SUMMARY_LIMIT) {
                summaryElement.innerHTML = `<span>${escapeHtml(rawSummary)}</span>`;
            } else {
                const preview = escapeHtml(rawSummary.slice(0, SUMMARY_LIMIT));
                const rest = escapeHtml(rawSummary.slice(SUMMARY_LIMIT));
                summaryElement.innerHTML = `
                    <span id="summary-preview-text">${preview}<span id="summary-rest-text" style="display:none;">${rest}</span>&hellip;</span>
                    <button
                        type="button"
                        class="btn-summary-toggle"
                        id="summary-toggle-btn"
                        onclick="toggleSmartSummary()"
                    >View More</button>
                `;
            }
        }

        // Render compact horizontal Automatic Medical Journey Timeline
        renderMedicalJourneyTimeline(activePatient, loadedConsultations, loadedDocuments);

        // Render Medical Documents Section
        renderPatientDocuments(loadedDocuments);


        const timelineContainer =
            document.getElementById(
                "patient-timeline"
            );

        if (!timelineContainer) return;

        timelineContainer.innerHTML = "";

        if (
            loadedConsultations.length === 0
        ) {

            timelineContainer.innerHTML = `
                <div class="empty-timeline">
                    <i data-lucide="folder-open"></i>

                    <p>
                        No previous consultations found for this patient.
                    </p>

                    <p style="font-size:0.85rem;margin-top:4px;">
                        Click "+ Add New Consultation" to begin recording history.
                    </p>
                </div>
            `;

            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }

            return;
        }

        loadedConsultations.forEach(
            consult => {

                const item =
                    document.createElement(
                        "div"
                    );

                item.className =
                    "timeline-item";

                const notesSection =
                    consult.notes
                        ? `
                            <div class="timeline-notes">
                                <strong>Notes:</strong>
                                ${escapeHtml(consult.notes)}
                            </div>
                        `
                        : "";

                item.innerHTML = `
                    <div class="timeline-node"></div>

                    <div class="timeline-date-doctor">

                        <div class="timeline-date">
                            ${formatDate(consult.date)}
                        </div>

                        <div style="
                            display:flex;
                            align-items:center;
                            gap:8px;
                        ">

                            <div class="timeline-doctor">

                                <i data-lucide="user-cog"></i>

                                ${escapeHtml(
                    consult.doctor_name
                )}

                                (${escapeHtml(
                    consult.specialization
                )})

                                at

                                ${escapeHtml(
                    consult.hospital_name
                )}

                            </div>

                        </div>

                    </div>

                    <div class="timeline-card">

                        <div class="timeline-detail-row">

                            <div class="timeline-label">
                                Symptoms
                            </div>

                            <div class="timeline-content">
                                ${escapeHtml(
                    consult.symptoms
                )}
                            </div>

                        </div>

                        <div class="timeline-detail-row">

                            <div class="timeline-label">
                                Diagnosis
                            </div>

                            <div
                                class="timeline-content"
                                style="
                                    font-weight:600;
                                    color:var(--danger);
                                "
                            >
                                ${escapeHtml(
                    consult.diagnosis
                )}
                            </div>

                        </div>

                        <div class="timeline-detail-row">

                            <div class="timeline-label">
                                Treatment Prescribed
                            </div>

                            <div
                                class="timeline-content"
                                style="
                                    color:var(--accent-teal);
                                    font-weight:500;
                                "
                            >
                                ${escapeHtml(
                    consult.treatment
                )}
                            </div>

                        </div>

                        ${notesSection}

                        <div class="flow-diagram">

                            <span class="flow-step date">
                                ${formatDate(
                    consult.date
                )}
                            </span>

                            <span class="flow-arrow">
                                <i data-lucide="chevron-right"></i>
                            </span>

                            <span class="flow-step doc">
                                ${escapeHtml(
                    consult.doctor_name
                )}
                            </span>

                            <span class="flow-arrow">
                                <i data-lucide="chevron-right"></i>
                            </span>

                            <span class="flow-step sym">
                                Symptoms:
                                ${escapeHtml(
                    truncateText(
                        consult.symptoms,
                        15
                    )
                )}
                            </span>

                            <span class="flow-arrow">
                                <i data-lucide="chevron-right"></i>
                            </span>

                            <span class="flow-step diag">
                                Diag:
                                ${escapeHtml(
                    truncateText(
                        consult.diagnosis,
                        15
                    )
                )}
                            </span>

                            <span class="flow-arrow">
                                <i data-lucide="chevron-right"></i>
                            </span>

                            <span class="flow-step treat">
                                Treat:
                                ${escapeHtml(
                    truncateText(
                        consult.treatment,
                        15
                    )
                )}
                            </span>

                        </div>

                        <div class="timeline-actions">

                            <button
                                type="button"
                                class="btn btn-outline btn-sm"
                                onclick="openViewConsultation(${Number(consult.id)})"
                                title="View Prescription Details"
                            >

                                <i data-lucide="eye"></i>

                                View Prescription

                            </button>

                        </div>

                    </div>
                `;

                timelineContainer.appendChild(
                    item
                );
            }
        );

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

    } catch (error) {

        console.error(
            "History loading error:",
            error
        );

        showToast(
            error.message ||
            "Failed to load timeline",
            "danger"
        );
    }
}

// ============================================================
// SMART SUMMARY VIEW MORE / LESS TOGGLE
// ============================================================

function toggleSmartSummary() {
    const restEl = document.getElementById("summary-rest-text");
    const ellipsisEl = document.querySelector("#summary-preview-text > span:last-child");
    const btn = document.getElementById("summary-toggle-btn");
    if (!restEl || !btn) return;

    const isCollapsed = restEl.style.display === "none";
    if (isCollapsed) {
        restEl.style.display = "inline";
        // hide the ellipsis span if present
        const previewSpan = document.getElementById("summary-preview-text");
        if (previewSpan) {
            const hellip = previewSpan.querySelector(".summary-ellipsis");
            if (hellip) hellip.style.display = "none";
        }
        btn.innerText = "View Less";
    } else {
        restEl.style.display = "none";
        btn.innerText = "View More";
    }
}

// ============================================================

function goToAddConsultation() {

    if (!activePatient) {

        showToast(
            "Please select a patient first.",
            "danger"
        );

        return;
    }

    switchScreen(
        "screen-consultation"
    );

    prepareConsultationForm();
}

function prepareConsultationForm() {

    if (!activePatient) return;

    const form =
        document.getElementById(
            "consultation-form"
        );

    if (form) {
        form.reset();
    }

    const patientLabel =
        document.getElementById(
            "consultation-active-patient"
        );

    if (patientLabel) {

        patientLabel.innerText =
            `${activePatient.name} (${activePatient.id})`;
    }

    const titleText =
        document.getElementById(
            "consultation-title-text"
        );

    if (titleText) {
        titleText.innerText =
            "New Clinical Consultation";
    }

    const btnText =
        document.getElementById(
            "consultation-btn-text"
        );

    if (btnText) {
        btnText.innerText =
            "Save Consultation";
    }

    const dateInput =
        document.getElementById(
            "consult-date"
        );

    if (dateInput) {

        const today =
            new Date()
                .toISOString()
                .split("T")[0];

        dateInput.value =
            today;
    }

    document.getElementById(
        "page-title"
    ).innerText =
        "Add New Consultation";

    document.getElementById(
        "page-desc"
    ).innerText =
        "Record patient symptoms, clinical diagnosis, and treatments";

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

// ============================================================
// EDIT CONSULTATION
// ============================================================

// ============================================================
// VIEW PRESCRIPTION (READ-ONLY MODAL)
// ============================================================

function openViewConsultation(consultId) {
    if (!activePatient) return;

    const consult = loadedConsultations.find(
        c => Number(c.id) === Number(consultId)
    );

    if (!consult) {
        showToast("Prescription record not found.", "danger");
        return;
    }

    setText("view-consult-id", consult.id);
    setText("view-consult-patient", `${activePatient.name} (${activePatient.id})`);
    setText("view-consult-date", formatDate(consult.date));
    setText("view-consult-doctor", `${consult.doctor_name} (${consult.specialization || 'General'})`);
    setText("view-consult-hospital", consult.hospital_name || 'MediKiosk Clinic');
    setText("view-consult-symptoms", consult.symptoms || 'None reported');
    setText("view-consult-diagnosis", consult.diagnosis || 'Pending');
    setText("view-consult-treatment", consult.treatment || 'None');

    const notesWrapper = document.getElementById("view-consult-notes-wrapper");
    if (consult.notes && consult.notes.trim()) {
        setText("view-consult-notes", consult.notes);
        if (notesWrapper) notesWrapper.style.display = "block";
    } else {
        if (notesWrapper) notesWrapper.style.display = "none";
    }

    const modal = document.getElementById("view-prescription-modal");
    if (modal) {
        modal.classList.add("modal-active");
    }

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

function closeViewPrescriptionModal() {
    const modal = document.getElementById("view-prescription-modal");
    if (modal) {
        modal.classList.remove("modal-active");
    }
}

// ============================================================
// AUTOMATIC HORIZONTAL MEDICAL JOURNEY TIMELINE
// ============================================================

const TIMELINE_EVENT_LABELS = {
    registration: "Registered",
    consultation: "Consultation",
    investigation: "Investigation",
    prescription: "Prescription",
    followup: "Follow-up",
    referral: "Referral",
    document: "Medical Document"
};

let activeTimelineEvents = [];

function formatTimelineDate(rawDate) {
    if (!rawDate) return "N/A";
    try {
        const d = new Date(rawDate);
        if (isNaN(d.getTime())) {
            return String(rawDate).slice(0, 10);
        }
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`;
    } catch (_) {
        return String(rawDate);
    }
}

function extractMedicalTimelineEvents(patient, consultations = [], documents = []) {
    if (!patient) return [];

    const events = [];

    // 1. REGISTRATION EVENT (Always present)
    const regDate = patient.created_at || (consultations.length > 0 ? consultations[consultations.length - 1].date : new Date().toISOString());
    events.push({
        id: `reg-${patient.id}`,
        type: 'registration',
        typeKey: 'registration',
        title: TIMELINE_EVENT_LABELS.registration,
        date: regDate,
        displayDate: formatTimelineDate(regDate),
        icon: 'user-check',
        colorClass: 'node-registration',
        subtext: `ID: ${patient.id}`,
        consultationId: null,
        data: {
            patientId: patient.id,
            name: patient.name,
            age: patient.age,
            gender: patient.gender,
            phone: patient.phone,
            email: patient.email || 'None',
            allergies: patient.allergies || 'None',
            conditions: patient.conditions || 'None',
            summary: patient.summary || 'None',
            registeredAt: regDate
        }
    });

    // 2. CONSULTATIONS / CLINICAL MILESTONES
    // Sort consultations chronologically (oldest to newest)
    const sortedConsults = [...consultations].sort((a, b) => {
        const dateA = new Date(a.date || 0).getTime();
        const dateB = new Date(b.date || 0).getTime();
        return dateA - dateB;
    });

    sortedConsults.forEach(c => {
        const combinedText = `${c.diagnosis || ''} ${c.symptoms || ''} ${c.notes || ''} ${c.specialization || ''}`.toLowerCase();

        // Check for Investigation
        const isInvestigation = /\b(investigation|lab|test|x-ray|xray|scan|mri|ct scan|ultrasound|ecg|biopsy|culture|pathology|radiology|blood|urine|screening|panel|report)\b/i.test(combinedText);

        // Check for Follow-up
        const isFollowup = /\b(follow-up|follow up|review visit|routine review|re-evaluation|post-op|check-up)\b/i.test(combinedText);

        // Check for Referral
        const isReferral = /\b(referral|referred to|transfer to|specialist referral)\b/i.test(combinedText);

        // Check for Medical Document
        const isDocument = /\b(medical certificate|fitness certificate|discharge summary|medical report|disability certificate)\b/i.test(combinedText);

        const hasTreatment = Boolean(c.treatment && c.treatment.trim() && c.treatment.toLowerCase() !== 'none');

        if (isInvestigation) {
            events.push({
                id: `inv-${c.id}`,
                type: 'investigation',
                typeKey: 'investigation',
                title: TIMELINE_EVENT_LABELS.investigation,
                date: c.date,
                displayDate: formatTimelineDate(c.date),
                icon: 'flask-conical',
                colorClass: 'node-investigation',
                subtext: c.diagnosis || c.doctor_name || 'Lab Findings',
                consultationId: c.id,
                data: c
            });
        } else if (isFollowup) {
            events.push({
                id: `fol-${c.id}`,
                type: 'followup',
                typeKey: 'followup',
                title: TIMELINE_EVENT_LABELS.followup,
                date: c.date,
                displayDate: formatTimelineDate(c.date),
                icon: 'calendar-check',
                colorClass: 'node-followup',
                subtext: c.diagnosis || 'Clinical Review',
                consultationId: c.id,
                data: c
            });
        } else if (isReferral) {
            events.push({
                id: `ref-${c.id}`,
                type: 'referral',
                typeKey: 'referral',
                title: TIMELINE_EVENT_LABELS.referral,
                date: c.date,
                displayDate: formatTimelineDate(c.date),
                icon: 'share-2',
                colorClass: 'node-referral',
                subtext: c.specialization || c.doctor_name || 'Specialist',
                consultationId: c.id,
                data: c
            });
        } else if (isDocument) {
            events.push({
                id: `doc-${c.id}`,
                type: 'document',
                typeKey: 'document',
                title: TIMELINE_EVENT_LABELS.document,
                date: c.date,
                displayDate: formatTimelineDate(c.date),
                icon: 'file-text',
                colorClass: 'node-document',
                subtext: c.diagnosis || 'Clinical Document',
                consultationId: c.id,
                data: c
            });
        } else {
            // General Clinical Consultation
            events.push({
                id: `con-${c.id}`,
                type: 'consultation',
                typeKey: 'consultation',
                title: TIMELINE_EVENT_LABELS.consultation,
                date: c.date,
                displayDate: formatTimelineDate(c.date),
                icon: 'stethoscope',
                colorClass: 'node-consultation',
                subtext: c.diagnosis || c.doctor_name,
                consultationId: c.id,
                data: c
            });

            // If treatment/medications were prescribed, emit the linked prescription milestone
            if (hasTreatment) {
                events.push({
                    id: `rx-${c.id}`,
                    type: 'prescription',
                    typeKey: 'prescription',
                    title: TIMELINE_EVENT_LABELS.prescription,
                    date: c.date,
                    displayDate: formatTimelineDate(c.date),
                    icon: 'pill',
                    colorClass: 'node-prescription',
                    subtext: c.treatment.length > 20 ? c.treatment.slice(0, 18) + '...' : c.treatment,
                    consultationId: c.id,
                    data: c
                });
            }
        }
    });

    // 3. MEDICAL DOCUMENTS (Prescriptions, Lab Reports, Discharge Summaries, Other)
    if (Array.isArray(documents) && documents.length > 0) {
        documents.forEach(doc => {
            let docTitle = doc.document_type || "Medical Document";
            let docIcon = "file-text";
            let docColor = "node-document";

            if (doc.document_type === "Lab Report") {
                docTitle = "Lab Report";
                docIcon = "flask-conical";
                docColor = "node-investigation";
            } else if (doc.document_type === "Prescription") {
                docTitle = "Prescription";
                docIcon = "pill";
                docColor = "node-prescription";
            } else if (doc.document_type === "Discharge Summary") {
                docTitle = "Discharge Summary";
                docIcon = "clipboard-list";
                docColor = "node-document";
            }

            let subtext = doc.investigation_name || doc.diagnosis || doc.title || doc.file_name || "Document";
            if (subtext.length > 20) subtext = subtext.slice(0, 18) + "...";

            events.push({
                id: `doc-${doc.id}`,
                type: 'document',
                typeKey: 'document',
                title: docTitle,
                date: doc.document_date,
                displayDate: formatTimelineDate(doc.document_date),
                icon: docIcon,
                colorClass: docColor,
                subtext: subtext,
                consultationId: null,
                documentId: doc.id,
                isDocument: true,
                data: doc
            });
        });
    }

    // Sort all events chronologically (registration milestone stays at start)
    const regEvent = events.shift();
    events.sort((a, b) => {
        const timeA = new Date(a.date || 0).getTime();
        const timeB = new Date(b.date || 0).getTime();
        return timeA - timeB;
    });
    if (regEvent) {
        events.unshift(regEvent);
    }

    return events;
}

function renderMedicalJourneyTimeline(patient, consultations = [], documents = []) {
    const card = document.getElementById("medical-journey-card");
    const track = document.getElementById("medical-journey-track");
    const countBadge = document.getElementById("timeline-milestone-count");

    if (!card || !track) return;

    if (!patient) {
        card.style.display = "none";
        return;
    }

    // Extract automatic chronological events including medical documents
    activeTimelineEvents = extractMedicalTimelineEvents(patient, consultations, documents);


    if (countBadge) {
        countBadge.innerText = `${activeTimelineEvents.length} Milestones`;
    }

    // Build timeline nodes HTML
    let trackHtml = `
        <div class="medical-journey-line"></div>
        <div class="medical-journey-line-progress" style="width: ${activeTimelineEvents.length > 1 ? '100%' : '0%'};"></div>
    `;

    activeTimelineEvents.forEach((ev, idx) => {
        const isLatest = idx === activeTimelineEvents.length - 1;
        trackHtml += `
            <button
                type="button"
                class="medical-journey-node ${ev.colorClass} ${isLatest ? 'is-latest' : ''}"
                onclick="openMedicalJourneyModal(${idx})"
                title="${escapeHtml(ev.title)} — ${escapeHtml(ev.displayDate)}"
            >
                ${isLatest ? `<span class="medical-journey-latest-tag">Latest</span>` : ''}
                <div class="medical-journey-date">${escapeHtml(ev.displayDate)}</div>
                <div class="medical-journey-dot">
                    <i data-lucide="${ev.icon}"></i>
                </div>
                <div class="medical-journey-label">${escapeHtml(ev.title)}</div>
                <div class="medical-journey-sub">${escapeHtml(ev.subtext)}</div>
            </button>
        `;
    });

    track.innerHTML = trackHtml;
    card.style.display = "block";

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    // Ensure the most recent event is visible by auto-scrolling
    const scrollContainer = document.getElementById("medical-journey-scroll-container");
    if (scrollContainer) {
        setTimeout(() => {
            scrollContainer.scrollLeft = scrollContainer.scrollWidth;
        }, 60);
    }
}

function openMedicalJourneyModal(eventIndex) {
    const ev = activeTimelineEvents[eventIndex];
    if (!ev) return;

    const modal = document.getElementById("medical-journey-modal");
    if (!modal) return;

    const badgeIcon = document.getElementById("journey-modal-badge-icon");
    const modalIcon = document.getElementById("journey-modal-icon");
    const titleEl = document.getElementById("journey-modal-type-title");
    const dateEl = document.getElementById("journey-modal-date");
    const contentEl = document.getElementById("journey-modal-content");
    const actionWrap = document.getElementById("journey-modal-action-wrap");

    if (titleEl) titleEl.innerText = `${ev.title} Milestone`;
    if (dateEl) dateEl.innerText = `${formatDate(ev.date)} • Patient ID: ${activePatient ? activePatient.id : ''}`;

    if (badgeIcon) {
        // Reset classes
        badgeIcon.className = `journey-modal-icon-wrap ${ev.colorClass}`;
    }
    if (modalIcon) {
        modalIcon.setAttribute("data-lucide", ev.icon);
    }

    // Populate content based on event type
    let bodyHtml = "";
    if (ev.type === "registration") {
        const d = ev.data;
        bodyHtml = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div class="detail-block" style="background: var(--bg-body); padding: 10px 14px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                    <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Patient Name</span>
                    <div style="font-weight: 600; color: var(--text-main); font-size: 0.9rem;">${escapeHtml(d.name)}</div>
                </div>
                <div class="detail-block" style="background: var(--bg-body); padding: 10px 14px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                    <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Patient ID</span>
                    <div style="font-weight: 700; color: var(--accent-blue); font-size: 0.9rem;">${escapeHtml(d.patientId)}</div>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div class="detail-block" style="background: var(--bg-body); padding: 10px 14px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                    <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Age / Gender</span>
                    <div style="color: var(--text-main); font-size: 0.88rem;">${escapeHtml(String(d.age))} yrs • ${escapeHtml(d.gender)}</div>
                </div>
                <div class="detail-block" style="background: var(--bg-body); padding: 10px 14px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                    <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Registered Phone</span>
                    <div style="color: var(--text-main); font-size: 0.88rem;">${escapeHtml(d.phone)}</div>
                </div>
            </div>
            <div class="detail-block" style="background: var(--bg-body); padding: 10px 14px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Known Allergies</span>
                <div style="color: ${d.allergies && d.allergies.toLowerCase() !== 'none' ? 'var(--danger)' : 'var(--text-main)'}; font-weight: 600; font-size: 0.88rem;">${escapeHtml(d.allergies)}</div>
            </div>
            <div class="detail-block" style="background: var(--bg-body); padding: 10px 14px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Chronic Medical Conditions</span>
                <div style="color: var(--text-main); font-size: 0.88rem;">${escapeHtml(d.conditions)}</div>
            </div>
        `;
        if (actionWrap) actionWrap.innerHTML = "";
    } else if (ev.isDocument || ev.typeKey === "document" || (ev.data && ev.data.file_name)) {
        // Medical Document Milestone
        const d = ev.data;
        let intelHtml = "";

        if (d.document_type === "Lab Report" || d.investigation_name || d.investigation_value) {
            const rangeClass = (d.range_status || "none").toLowerCase();
            let rangeBadgeHtml = "";
            if (rangeClass === "high") {
                rangeBadgeHtml = `<span class="range-badge high"><i data-lucide="alert-triangle"></i> Above Reference Range (High)</span>`;
            } else if (rangeClass === "low") {
                rangeBadgeHtml = `<span class="range-badge low"><i data-lucide="alert-triangle"></i> Below Reference Range (Low)</span>`;
            } else if (rangeClass === "normal") {
                rangeBadgeHtml = `<span class="range-badge normal"><i data-lucide="check-circle"></i> Within Reference Range</span>`;
            } else if (rangeClass === "out_of_range") {
                rangeBadgeHtml = `<span class="range-badge out_of_range"><i data-lucide="alert-triangle"></i> Outside Reference Range</span>`;
            }

            intelHtml += `
                <div class="detail-block" style="background: var(--bg-body); padding: 10px 14px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                    <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Investigation / Lab Test</span>
                    <div style="font-weight: 700; color: var(--accent-teal); font-size: 0.95rem;">${escapeHtml(d.investigation_name || d.title || 'Laboratory Report')}</div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div class="detail-block" style="background: var(--bg-body); padding: 10px 14px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                        <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Observed Value</span>
                        <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">${escapeHtml(d.investigation_value || 'Not specified')}</div>
                        ${rangeBadgeHtml}
                    </div>
                    <div class="detail-block" style="background: var(--bg-body); padding: 10px 14px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                        <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Reference Range</span>
                        <div style="color: var(--text-muted); font-weight: 600; font-size: 0.88rem;">${escapeHtml(d.reference_range || 'Not specified')}</div>
                        <div class="range-disclaimer">Clinical indicator only (no automated diagnosis)</div>
                    </div>
                </div>
            `;
        }

        if (d.diagnosis) {
            intelHtml += `
                <div class="detail-block" style="background: var(--bg-body); padding: 10px 14px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                    <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Clinical Diagnosis</span>
                    <div style="color: var(--danger); font-weight: 600; font-size: 0.88rem;">${escapeHtml(d.diagnosis)}</div>
                </div>
            `;
        }

        if (d.medicines) {
            intelHtml += `
                <div class="detail-block" style="background: var(--bg-body); padding: 10px 14px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                    <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Prescribed Medicines & Regimen</span>
                    <div style="color: var(--accent-teal); font-weight: 600; font-size: 0.88rem; white-space: pre-wrap;">${escapeHtml(d.medicines)}</div>
                </div>
            `;
        }

        if (d.notes) {
            intelHtml += `
                <div class="detail-block" style="background: var(--bg-body); padding: 10px 14px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                    <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Clinical Notes / Remarks</span>
                    <div style="color: var(--text-muted); font-size: 0.85rem; font-style: italic;">${escapeHtml(d.notes)}</div>
                </div>
            `;
        }

        bodyHtml = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div class="detail-block" style="background: var(--bg-body); padding: 10px 14px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                    <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Document Type</span>
                    <div style="font-weight: 700; color: var(--accent-blue); font-size: 0.9rem;">${escapeHtml(d.document_type || 'Medical Document')}</div>
                </div>
                <div class="detail-block" style="background: var(--bg-body); padding: 10px 14px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                    <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Document Date</span>
                    <div style="font-weight: 600; color: var(--text-main); font-size: 0.9rem;">${escapeHtml(d.document_date || 'N/A')}</div>
                </div>
            </div>
            <div class="detail-block" style="background: var(--bg-body); padding: 10px 14px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Attached File</span>
                <div style="font-weight: 600; color: var(--text-main); font-size: 0.86rem; display: flex; align-items: center; gap: 6px;">
                    <i data-lucide="file-text"></i> ${escapeHtml(d.file_name || 'Document File')} &bull; ${Math.round((d.file_size || 0) / 1024)} KB
                </div>
            </div>
            ${intelHtml}
        `;

        if (actionWrap && d.id) {
            actionWrap.innerHTML = `
                <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    onclick="closeMedicalJourneyModal(); openViewDocumentModal(${Number(d.id)});"
                >
                    <i data-lucide="eye"></i>
                    View Original Document
                </button>
            `;
        } else if (actionWrap) {
            actionWrap.innerHTML = "";
        }
    } else {
        const c = ev.data;
        bodyHtml = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div class="detail-block" style="background: var(--bg-body); padding: 10px 14px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                    <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Doctor</span>
                    <div style="font-weight: 600; color: var(--text-main); font-size: 0.88rem;">${escapeHtml(c.doctor_name)} (${escapeHtml(c.specialization || 'General')})</div>
                </div>
                <div class="detail-block" style="background: var(--bg-body); padding: 10px 14px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                    <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Facility</span>
                    <div style="font-weight: 600; color: var(--text-main); font-size: 0.88rem;">${escapeHtml(c.hospital_name || 'MediKiosk Clinic')}</div>
                </div>
            </div>
            <div class="detail-block" style="background: var(--bg-body); padding: 10px 14px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Clinical Diagnosis</span>
                <div style="color: var(--danger); font-weight: 600; font-size: 0.88rem;">${escapeHtml(c.diagnosis)}</div>
            </div>
            <div class="detail-block" style="background: var(--bg-body); padding: 10px 14px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Reported Symptoms</span>
                <div style="color: var(--text-main); font-size: 0.88rem;">${escapeHtml(c.symptoms)}</div>
            </div>
            <div class="detail-block" style="background: var(--bg-body); padding: 10px 14px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Prescribed Treatment & Regimen</span>
                <div style="color: var(--accent-teal); font-weight: 600; font-size: 0.88rem; white-space: pre-wrap;">${escapeHtml(c.treatment || 'None')}</div>
            </div>
            ${c.notes ? `
                <div class="detail-block" style="background: var(--bg-body); padding: 10px 14px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                    <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Clinical Notes</span>
                    <div style="color: var(--text-muted); font-size: 0.85rem; font-style: italic;">${escapeHtml(c.notes)}</div>
                </div>
            ` : ''}
        `;

        if (actionWrap && c.id) {
            actionWrap.innerHTML = `
                <button
                    type="button"
                    class="btn btn-outline btn-sm"
                    onclick="closeMedicalJourneyModal(); openViewConsultation(${Number(c.id)});"
                >
                    <i data-lucide="file-text"></i>
                    View Full Prescription
                </button>
            `;
        } else if (actionWrap) {
            actionWrap.innerHTML = "";
        }
    }

    if (contentEl) contentEl.innerHTML = bodyHtml;

    modal.classList.add("modal-active");

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

function closeMedicalJourneyModal() {
    const modal = document.getElementById("medical-journey-modal");
    if (modal) {
        modal.classList.remove("modal-active");
    }
}

// ============================================================
// SAVE CONSULTATION
// ============================================================

async function handleSaveConsultation(
    event
) {

    event.preventDefault();

    if (!activePatient) {

        showToast(
            "Error: No active patient selected.",
            "danger"
        );

        return;
    }

    const symptoms =
        document.getElementById(
            "consult-symptoms"
        ).value.trim();

    const diagnosis =
        document.getElementById(
            "consult-diagnosis"
        ).value.trim();

    const doctorName =
        document.getElementById(
            "consult-doctor"
        ).value.trim();

    const specialization =
        document.getElementById(
            "consult-specialization"
        ).value.trim();

    const hospitalName =
        document.getElementById(
            "consult-hospital"
        ).value.trim();

    const date =
        document.getElementById(
            "consult-date"
        ).value;

    const treatment =
        document.getElementById(
            "consult-treatment"
        ).value.trim();

    const notes =
        document.getElementById(
            "consult-notes"
        ).value.trim();

    if (
        !symptoms ||
        !diagnosis ||
        !doctorName ||
        !specialization ||
        !hospitalName ||
        !date ||
        !treatment
    ) {

        showToast(
            "Please fill all required clinical fields.",
            "danger"
        );

        return;
    }

    const payload = {

        date,

        doctor_name:
            doctorName,

        specialization,

        hospital_name:
            hospitalName,

        symptoms,

        diagnosis,

        treatment,

        notes
    };

    const saveBtn = document.getElementById("consultation-save-btn");
    const saveBtnText = document.getElementById("consultation-btn-text");
    const originalText = saveBtnText ? saveBtnText.innerText : "Save New Prescription";

    try {
        if (saveBtn) {
            saveBtn.disabled = true;
            if (saveBtnText) {
                saveBtnText.innerHTML = `<span class="btn-spinner"></span> Saving Prescription...`;
            }
        }

        payload.patient_id = activePatient.id;

        await apiAddConsultation(payload);

        showToast("New prescription saved successfully!", "success");

        switchScreen("screen-history");

        await renderCaseHistory();

    } catch (error) {
        console.error("Consultation save error:", error);
        showToast(
            error.message || "Failed to save consultation. Please try again.",
            "danger"
        );
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            if (saveBtnText) {
                saveBtnText.innerText = originalText;
            }
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
        }
    }
}

// ============================================================
// CANCEL CONSULTATION
// ============================================================

function cancelAddConsultation() {

    switchScreen(
        "screen-history"
    );

    renderCaseHistory();
}

// ============================================================
// TOAST
// ============================================================

function showToast(
    message,
    type = "success"
) {

    const container =
        document.getElementById(
            "toast-container"
        );

    if (!container) {

        console.log(message);

        return;
    }

    const toast =
        document.createElement(
            "div"
        );

    toast.className =
        `toast toast-${type}`;

    const iconName =
        type === "success"
            ? "check-circle"
            : "alert-circle";

    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <span>${escapeHtml(message)}</span>
    `;

    container.appendChild(
        toast
    );

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    setTimeout(() => {

        toast.style.opacity =
            "0";

        toast.style.transition =
            "opacity 0.5s ease";

        setTimeout(() => {

            toast.remove();

        }, 500);

    }, 3000);
}

// ============================================================
// HELPERS
// ============================================================

function formatDate(dateStr) {

    if (!dateStr) return "";

    const parts =
        dateStr.split("-");

    if (parts.length === 3) {

        const year =
            parseInt(
                parts[0],
                10
            );

        const month =
            parseInt(
                parts[1],
                10
            ) - 1;

        const day =
            parseInt(
                parts[2],
                10
            );

        const date =
            new Date(
                year,
                month,
                day
            );

        return date.toLocaleDateString(
            "en-US",
            {
                year: "numeric",
                month: "short",
                day: "numeric"
            }
        );
    }

    const date =
        new Date(dateStr);

    return date.toLocaleDateString(
        "en-US",
        {
            year: "numeric",
            month: "short",
            day: "numeric"
        }
    );
}

function truncateText(
    text,
    maxChars
) {

    if (!text) return "";

    if (
        text.length <= maxChars
    ) {
        return text;
    }

    return (
        text.substring(
            0,
            maxChars
        ) + "..."
    );
}

function escapeHtml(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    const div =
        document.createElement(
            "div"
        );

    div.textContent =
        String(value);

    return div.innerHTML;
}

// ============================================================
// PATIENT REGISTRATION PHONE INPUT RESTRICTIONS
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
    const regPhone = document.getElementById("reg-phone");
    if (regPhone) {
        regPhone.addEventListener("input", function () {
            this.value = this.value.replace(/\D/g, "").slice(0, 10);
        });

        regPhone.addEventListener("keypress", function (e) {
            if (e.key && !/[0-9]/.test(e.key)) {
                e.preventDefault();
            }
        });

        regPhone.addEventListener("paste", function (e) {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData("text");
            const digits = text.replace(/\D/g, "").slice(0, 10);
            this.value = digits;
        });
    }

    // Dashboard Search Input Enter Key
    const searchInput = document.getElementById("dashboard-search-id");
    if (searchInput) {
        searchInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                searchPatient();
            }
        });
    }
});

// ============================================================
// MOBILE NAVIGATION DRAWER
// ============================================================

function toggleMobileNav() {
    const aside = document.querySelector("aside");
    const overlay = document.getElementById("mobile-nav-overlay");
    if (aside) {
        aside.classList.toggle("open");
    }
    if (overlay) {
        overlay.classList.toggle("active");
    }
}

function closeMobileNav() {
    const aside = document.querySelector("aside");
    const overlay = document.getElementById("mobile-nav-overlay");
    if (aside) {
        aside.classList.remove("open");
    }
    if (overlay) {
        overlay.classList.remove("active");
    }
}

// ============================================================
// MEDICAL DOCUMENTS & SIMPLE INTELLIGENCE CONTROLLER
// ============================================================

function renderPatientDocuments(documents = []) {
    const section = document.getElementById("patient-documents-section");
    const countBadge = document.getElementById("patient-documents-count");
    const listContainer = document.getElementById("patient-documents-list");

    if (!section || !listContainer) return;

    if (countBadge) {
        countBadge.innerText = `${documents.length} Document${documents.length === 1 ? '' : 's'}`;
    }

    if (!documents || documents.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-documents">
                <i data-lucide="folder-open"></i>
                <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 4px; color: var(--text-main);">
                    No medical documents uploaded yet
                </div>
                <div style="font-size: 0.8rem; margin-bottom: 14px; max-width: 320px;">
                    Upload lab reports, prescriptions, or discharge summaries to store against this patient profile.
                </div>
                <button type="button" class="btn btn-outline btn-sm" onclick="openUploadDocumentModal()">
                    <i data-lucide="upload-cloud"></i> Upload Medical Document
                </button>
            </div>
        `;
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
        return;
    }

    let cardsHtml = "";
    documents.forEach(doc => {
        const typeClass = (doc.document_type || "other").toLowerCase().replace(/\s+/g, "-");
        let typeBadge = `<span class="doc-type-badge doc-type-${typeClass}">${escapeHtml(doc.document_type || 'Document')}</span>`;

        let intelContent = "";
        if (doc.document_type === "Lab Report" || doc.investigation_name || doc.investigation_value) {
            const rangeClass = (doc.range_status || "none").toLowerCase();
            let rangeBadge = "";
            if (rangeClass === "high") {
                rangeBadge = `<span class="range-badge high"><i data-lucide="alert-triangle"></i> Above Reference Range (High)</span>`;
            } else if (rangeClass === "low") {
                rangeBadge = `<span class="range-badge low"><i data-lucide="alert-triangle"></i> Below Reference Range (Low)</span>`;
            } else if (rangeClass === "normal") {
                rangeBadge = `<span class="range-badge normal"><i data-lucide="check-circle"></i> Within Reference Range</span>`;
            } else if (rangeClass === "out_of_range") {
                rangeBadge = `<span class="range-badge out_of_range"><i data-lucide="alert-triangle"></i> Outside Reference Range</span>`;
            }

            intelContent = `
                <div class="doc-card-intel">
                    <div class="doc-intel-row">
                        <span class="doc-intel-label">Test:</span>
                        <span class="doc-intel-value" style="color: var(--accent-teal);">${escapeHtml(doc.investigation_name || doc.title || 'Lab Test')}</span>
                    </div>
                    <div class="doc-intel-row">
                        <span class="doc-intel-label">Observed:</span>
                        <span class="doc-intel-value">${escapeHtml(doc.investigation_value || 'N/A')}</span>
                    </div>
                    ${doc.reference_range ? `
                        <div class="doc-intel-row">
                            <span class="doc-intel-label">Reference:</span>
                            <span class="doc-intel-value" style="color: var(--text-muted);">${escapeHtml(doc.reference_range)}</span>
                        </div>
                    ` : ''}
                    ${rangeBadge}
                    ${rangeBadge ? `<div class="range-disclaimer">Clinical indicator only (no automated diagnosis)</div>` : ''}
                </div>
            `;
        } else if (doc.diagnosis || doc.medicines) {
            intelContent = `
                <div class="doc-card-intel">
                    ${doc.diagnosis ? `
                        <div class="doc-intel-row">
                            <span class="doc-intel-label">Diagnosis:</span>
                            <span class="doc-intel-value" style="color: var(--danger);">${escapeHtml(doc.diagnosis)}</span>
                        </div>
                    ` : ''}
                    ${doc.medicines ? `
                        <div class="doc-intel-row">
                            <span class="doc-intel-label">Medicines:</span>
                            <span class="doc-intel-value" style="color: var(--accent-teal);">${escapeHtml(doc.medicines.length > 50 ? doc.medicines.slice(0, 48) + '...' : doc.medicines)}</span>
                        </div>
                    ` : ''}
                </div>
            `;
        } else if (doc.notes) {
            intelContent = `
                <div class="doc-card-intel">
                    <div class="doc-intel-row">
                        <span class="doc-intel-label">Notes:</span>
                        <span class="doc-intel-value" style="color: var(--text-muted); font-style: italic;">${escapeHtml(doc.notes.length > 60 ? doc.notes.slice(0, 58) + '...' : doc.notes)}</span>
                    </div>
                </div>
            `;
        }

        cardsHtml += `
            <div class="document-card">
                <div class="document-card-top">
                    ${typeBadge}
                    <span class="doc-card-date">${formatDate(doc.document_date)}</span>
                </div>

                <div class="doc-card-file-info">
                    <div class="doc-file-icon">
                        <i data-lucide="${(doc.file_type || '').includes('pdf') ? 'file-text' : (doc.file_type || '').startsWith('image/') ? 'image' : 'file'}"></i>
                    </div>
                    <div style="min-width: 0;">
                        <div class="doc-card-title">${escapeHtml(doc.title || doc.file_name)}</div>
                        <div class="doc-card-filename">${escapeHtml(doc.file_name)} &bull; ${Math.round((doc.file_size || 0) / 1024)} KB</div>
                    </div>
                </div>

                ${intelContent}

                <div class="doc-card-actions">
                    <button type="button" class="btn btn-primary btn-sm" onclick="openViewDocumentModal(${doc.id})">
                        <i data-lucide="file-search"></i> View Document
                    </button>
                </div>
            </div>
        `;
    });

    listContainer.innerHTML = cardsHtml;

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

function openUploadDocumentModal() {
    if (!activePatient) {
        showToast("Please search or select a patient before uploading a document.", "warning");
        return;
    }

    const modal = document.getElementById("upload-document-modal");
    if (!modal) return;

    // Set Patient context in modal header
    const patientNameEl = document.getElementById("upload-doc-patient-name");
    const patientIdEl = document.getElementById("upload-doc-patient-id");
    if (patientNameEl) patientNameEl.innerText = activePatient.name || "Unknown";
    if (patientIdEl) patientIdEl.innerText = activePatient.id || "--";

    // Reset form inputs
    const form = document.getElementById("upload-document-form");
    if (form) form.reset();

    // Default document date to today
    const dateInput = document.getElementById("doc-date-input");
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    // Reset file selection state
    clearSelectedDocumentFile();

    // Reset range indicator
    const indicator = document.getElementById("doc-verify-range-indicator");
    if (indicator) indicator.style.display = "none";

    // Setup drag and drop on dropzone
    const dropzone = document.getElementById("doc-dropzone");
    if (dropzone && !dropzone._listenersAdded) {
        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('dragover');
            }, false);
        });

        dropzone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files.length > 0) {
                const fileInput = document.getElementById('doc-file-input');
                if (fileInput) {
                    fileInput.files = files;
                    handleDocumentFileSelected({ target: fileInput });
                }
            }
        }, false);

        dropzone._listenersAdded = true;
    }

    handleDocTypeChange();

    modal.classList.add("modal-active");

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

function closeUploadDocumentModal() {
    const modal = document.getElementById("upload-document-modal");
    if (modal) {
        modal.classList.remove("modal-active");
    }
    clearSelectedDocumentFile();
}

function handleDocTypeChange() {
    const typeSelect = document.getElementById("doc-type-select");
    const labContainer = document.getElementById("doc-lab-fields-container");
    const medicinesGroup = document.getElementById("doc-medicines-group");

    if (!typeSelect) return;
    const val = typeSelect.value;

    if (val === "Lab Report") {
        if (labContainer) labContainer.style.display = "block";
    } else {
        if (labContainer) labContainer.style.display = "none";
    }

    if (val === "Prescription" || val === "Discharge Summary") {
        if (medicinesGroup) medicinesGroup.style.display = "block";
    }

    handleLabRangeLiveCheck();

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

function handleDocumentFileSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
        showToast("File size exceeds 10MB limit. Please choose a smaller file.", "danger");
        event.target.value = "";
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        selectedDocumentFile = {
            file: file,
            base64: e.target.result,
            name: file.name,
            size: file.size,
            type: file.type || "application/octet-stream"
        };

        const nameEl = document.getElementById("preview-file-name");
        const metaEl = document.getElementById("preview-file-meta");
        const dropzone = document.getElementById("doc-dropzone");
        const previewBar = document.getElementById("doc-file-preview-bar");

        if (nameEl) nameEl.innerText = file.name;
        if (metaEl) {
            const sizeKb = Math.round(file.size / 1024);
            const ext = file.name.split('.').pop().toUpperCase();
            metaEl.innerText = `${sizeKb} KB • ${ext}`;
        }

        if (dropzone) dropzone.style.display = "none";
        if (previewBar) previewBar.style.display = "flex";

        // Auto-fill Title if blank
        const titleInput = document.getElementById("doc-title-input");
        if (titleInput && !titleInput.value) {
            const cleanBase = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
            titleInput.value = cleanBase;
        }

        // If it's a text file, read text and auto-extract!
        if (file.type.startsWith("text/") || file.name.endsWith(".txt")) {
            const textReader = new FileReader();
            textReader.onload = function (te) {
                const text = te.target.result;
                const rawEl = document.getElementById("doc-raw-text");
                if (rawEl) rawEl.value = text;
                runDocumentTextExtraction();
            };
            textReader.readAsText(file);
        }

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    };

    reader.readAsDataURL(file);
}

function clearSelectedDocumentFile(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    selectedDocumentFile = null;

    const fileInput = document.getElementById("doc-file-input");
    if (fileInput) fileInput.value = "";

    const dropzone = document.getElementById("doc-dropzone");
    const previewBar = document.getElementById("doc-file-preview-bar");

    if (dropzone) dropzone.style.display = "block";
    if (previewBar) previewBar.style.display = "none";
}

function evaluateLabRangeClient(valStr, rangeStr) {
    if (!valStr || !rangeStr) return { status: "none" };

    const valClean = String(valStr).trim();
    const rangeClean = String(rangeStr).trim();

    const valMatch = valClean.match(/[-+]?\d+(?:\.\d+)?/);
    if (!valMatch) return { status: "none" };

    const val = parseFloat(valMatch[0]);
    if (isNaN(val)) return { status: "none" };

    // Case 1: Min - Max
    const rangeMatch = rangeClean.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)/i);
    if (rangeMatch) {
        const low = parseFloat(rangeMatch[1]);
        const high = parseFloat(rangeMatch[2]);
        if (!isNaN(low) && !isNaN(high)) {
            if (val < low) return { status: "low", val, low, high, label: `Observed ${val} is below reference range (${low} - ${high})` };
            if (val > high) return { status: "high", val, low, high, label: `Observed ${val} is above reference range (${low} - ${high})` };
            return { status: "normal", val, low, high, label: `Observed ${val} is within normal reference range (${low} - ${high})` };
        }
    }

    // Case 2: Upper limit (< 200, <= 200, under 200)
    const maxMatch = rangeClean.match(/(?:<|<=|less\s+than|under)\s*(\d+(?:\.\d+)?)/i);
    if (maxMatch) {
        const maxVal = parseFloat(maxMatch[1]);
        if (!isNaN(maxVal)) {
            if (val > maxVal) return { status: "high", val, maxVal, label: `Observed ${val} exceeds reference limit (< ${maxVal})` };
            return { status: "normal", val, maxVal, label: `Observed ${val} is within reference limit (< ${maxVal})` };
        }
    }

    // Case 3: Lower limit (> 50, >= 50, over 50)
    const minMatch = rangeClean.match(/(?:>|>=|greater\s+than|over)\s*(\d+(?:\.\d+)?)/i);
    if (minMatch) {
        const minVal = parseFloat(minMatch[1]);
        if (!isNaN(minVal)) {
            if (val < minVal) return { status: "low", val, minVal, label: `Observed ${val} is below reference limit (> ${minVal})` };
            return { status: "normal", val, minVal, label: `Observed ${val} is within reference limit (> ${minVal})` };
        }
    }

    return { status: "none" };
}

function handleLabRangeLiveCheck() {
    const valInput = document.getElementById("doc-verify-inv-value");
    const rangeInput = document.getElementById("doc-verify-ref-range");
    const indicator = document.getElementById("doc-verify-range-indicator");
    const content = document.getElementById("range-indicator-content");

    if (!indicator || !content) return;

    const valStr = valInput ? valInput.value : "";
    const rangeStr = rangeInput ? rangeInput.value : "";

    const res = evaluateLabRangeClient(valStr, rangeStr);

    indicator.className = `range-indicator-preview ${res.status}`;

    if (res.status === "high" || res.status === "low") {
        indicator.style.display = "block";
        content.innerHTML = `
            <div style="font-weight: 700; display: flex; align-items: center; gap: 6px;">
                <i data-lucide="alert-triangle" style="width: 16px; height: 16px;"></i>
                ⚠️ Outside Reference Range (${res.status === "high" ? "High" : "Low"})
            </div>
            <div style="font-size: 0.78rem; margin-top: 2px;">
                ${escapeHtml(res.label)}
            </div>
            <div class="range-disclaimer">
                Reference indicator only. Clinical correlation advised (no automated diagnosis).
            </div>
        `;
    } else if (res.status === "normal") {
        indicator.style.display = "block";
        content.innerHTML = `
            <div style="font-weight: 700; display: flex; align-items: center; gap: 6px;">
                <i data-lucide="check-circle" style="width: 16px; height: 16px;"></i>
                ✅ Within Normal Reference Range
            </div>
            <div style="font-size: 0.78rem; margin-top: 2px;">
                ${escapeHtml(res.label)}
            </div>
            <div class="range-disclaimer">
                Clinical indicator only (no automated diagnosis).
            </div>
        `;
    } else {
        indicator.style.display = "none";
        content.innerHTML = "";
    }

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

function handleReportTextInput() {
    const ta = document.getElementById("doc-raw-text");
    if (!ta) return;
    // Reset height so shrinkage is measured correctly
    ta.style.height = "auto";
    const MIN_H = 120;
    const MAX_H = 300;
    const natural = ta.scrollHeight;
    if (natural <= MIN_H) {
        ta.style.height = MIN_H + "px";
        ta.style.overflowY = "hidden";
    } else if (natural <= MAX_H) {
        ta.style.height = natural + "px";
        ta.style.overflowY = "hidden";
    } else {
        ta.style.height = MAX_H + "px";
        ta.style.overflowY = "auto";
    }
}

function runDocumentTextExtraction() {
    const rawEl = document.getElementById("doc-raw-text");
    if (!rawEl) return;
    const text = rawEl.value;
    if (!text || !text.trim()) {
        showToast("Please enter or paste report text to extract fields.", "warning");
        return;
    }

    let extractedCount = 0;

    // Diagnosis
    const diagMatch = text.match(/(?:diagnosis|dx|impression|condition|finding)[:\s]+([^\n\r]+)/i);
    if (diagMatch && diagMatch[1]) {
        const diagInput = document.getElementById("doc-verify-diagnosis");
        if (diagInput) {
            diagInput.value = diagMatch[1].trim();
            extractedCount++;
        }
    }

    // Medicines
    const medMatch = text.match(/(?:medicines|medication|rx|treatment|prescribed|drugs)[:\s]+([\s\S]*?)(?=(?:diagnosis|investigation|test|result|range|notes|remarks|\n\n|$))/i);
    if (medMatch && medMatch[1]) {
        const medInput = document.getElementById("doc-verify-medicines");
        if (medInput) {
            medInput.value = medMatch[1].trim();
            extractedCount++;
        }
    }

    // Investigation Name
    const invMatch = text.match(/(?:investigation|test name|test|panel|parameter)[:\s]+([^\n\r]+)/i);
    if (invMatch && invMatch[1]) {
        const invInput = document.getElementById("doc-verify-inv-name");
        if (invInput) {
            invInput.value = invMatch[1].trim();
            extractedCount++;
            const typeSelect = document.getElementById("doc-type-select");
            if (typeSelect && typeSelect.value !== "Lab Report") {
                typeSelect.value = "Lab Report";
                handleDocTypeChange();
            }
        }
    }

    // Result / Value
    const valMatch = text.match(/(?:result|observed value|value|finding)[:\s]+([^\n\r]+)/i);
    if (valMatch && valMatch[1]) {
        const valInput = document.getElementById("doc-verify-inv-value");
        if (valInput) {
            valInput.value = valMatch[1].trim();
            extractedCount++;
        }
    }

    // Reference Range
    const rangeMatch = text.match(/(?:reference range|ref range|normal range|biological reference|limits|interval)[:\s]+([^\n\r]+)/i);
    if (rangeMatch && rangeMatch[1]) {
        const rangeInput = document.getElementById("doc-verify-ref-range");
        if (rangeInput) {
            rangeInput.value = rangeMatch[1].trim();
            extractedCount++;
        }
    }

    // Notes
    const notesMatch = text.match(/(?:notes|remarks|comments|advice|instructions)[:\s]+([^\n\r]+)/i);
    if (notesMatch && notesMatch[1]) {
        const notesInput = document.getElementById("doc-verify-notes");
        if (notesInput) {
            notesInput.value = notesMatch[1].trim();
            extractedCount++;
        }
    }

    handleLabRangeLiveCheck();

    if (extractedCount > 0) {
        showToast(`Identified ${extractedCount} clinical field(s). Please review and verify.`, "success");
    } else {
        showToast("No structured patterns recognized. You can enter details manually in the verification form.", "info");
    }
}

async function handleSaveMedicalDocument(event) {
    if (event) event.preventDefault();

    if (!activePatient) {
        showToast("Error: No active patient selected.", "danger");
        return;
    }

    if (!selectedDocumentFile || !selectedDocumentFile.base64) {
        showToast("Please attach a medical document file (PDF, image, or text).", "warning");
        return;
    }

    const typeSelect = document.getElementById("doc-type-select");
    const dateInput = document.getElementById("doc-date-input");
    const titleInput = document.getElementById("doc-title-input");
    const diagInput = document.getElementById("doc-verify-diagnosis");
    const medInput = document.getElementById("doc-verify-medicines");
    const invNameInput = document.getElementById("doc-verify-inv-name");
    const invValInput = document.getElementById("doc-verify-inv-value");
    const refRangeInput = document.getElementById("doc-verify-ref-range");
    const notesInput = document.getElementById("doc-verify-notes");
    const submitBtn = document.getElementById("btn-save-doc-submit");

    const docType = typeSelect ? typeSelect.value : "Other";
    const docDate = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];

    if (!docDate) {
        showToast("Please provide a valid document date.", "warning");
        return;
    }

    const payload = {
        document_type: docType,
        document_date: docDate,
        title: titleInput && titleInput.value.trim() ? titleInput.value.trim() : selectedDocumentFile.name,
        file_name: selectedDocumentFile.name,
        file_data: selectedDocumentFile.base64,
        file_type: selectedDocumentFile.type,
        diagnosis: diagInput ? diagInput.value.trim() : "",
        medicines: medInput ? medInput.value.trim() : "",
        investigation_name: invNameInput ? invNameInput.value.trim() : "",
        investigation_value: invValInput ? invValInput.value.trim() : "",
        reference_range: refRangeInput ? refRangeInput.value.trim() : "",
        notes: notesInput ? notesInput.value.trim() : ""
    };

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `Saving Document...`;
    }

    try {
        await apiUploadMedicalDocument(activePatient.id, payload);

        showToast("Medical document saved successfully!", "success");
        closeUploadDocumentModal();

        // Refresh patient case history to reload documents & timeline
        await renderCaseHistory();
    } catch (err) {
        showToast(`Failed to save document: ${err.message}`, "danger");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i data-lucide="check"></i> Save Medical Document`;
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
        }
    }
}

function openViewDocumentModal(documentId) {
    const doc = loadedDocuments.find(d => Number(d.id) === Number(documentId));
    if (!doc) {
        showToast("Document details not found.", "warning");
        return;
    }

    const modal = document.getElementById("view-document-modal");
    if (!modal) return;

    const titleEl = document.getElementById("view-doc-modal-title");
    const metaEl = document.getElementById("view-doc-modal-meta");
    const statusBadge = document.getElementById("view-doc-status-badge");
    const fileFrame = document.getElementById("view-doc-file-frame");
    const openExtLink = document.getElementById("view-doc-open-external");
    const downloadBtn = document.getElementById("view-doc-download-btn");
    const intelContainer = document.getElementById("view-doc-intelligence-content");

    const fileUrl = apiGetDocumentFileUrl(doc.id);

    if (titleEl) titleEl.innerText = doc.title || doc.document_type || "Medical Document";
    if (metaEl) metaEl.innerText = `${formatDate(doc.document_date)} • Patient ID: ${doc.patient_id} • File: ${doc.file_name}`;

    if (statusBadge) {
        statusBadge.className = `doc-type-badge doc-type-${(doc.document_type || 'other').toLowerCase().replace(/\s+/g, '-')}`;
        statusBadge.innerText = doc.document_type || "Medical Document";
    }

    if (openExtLink) openExtLink.href = fileUrl;
    if (downloadBtn) {
        downloadBtn.href = fileUrl;
        downloadBtn.download = doc.file_name;
    }

    // Render file preview in left pane
    if (fileFrame) {
        const mime = (doc.file_type || "").toLowerCase();
        const fname = (doc.file_name || "").toLowerCase();

        if (mime.includes("pdf") || fname.endsWith(".pdf")) {
            fileFrame.innerHTML = `
                <iframe src="${fileUrl}" title="${escapeHtml(doc.file_name)}"></iframe>
            `;
        } else if (mime.startsWith("image/") || fname.match(/\.(png|jpg|jpeg|webp|gif|svg)$/)) {
            fileFrame.innerHTML = `
                <img src="${fileUrl}" alt="${escapeHtml(doc.file_name)}" />
            `;
        } else {
            fileFrame.innerHTML = `
                <div style="text-align: center; padding: 24px; color: var(--text-muted);">
                    <i data-lucide="file-text" style="width: 48px; height: 48px; margin-bottom: 12px; color: var(--accent-blue);"></i>
                    <p style="font-weight: 600; color: var(--text-main); margin-bottom: 6px;">${escapeHtml(doc.file_name)}</p>
                    <p style="font-size: 0.8rem; margin-bottom: 14px;">Direct preview not embedded for this format.</p>
                    <a href="${fileUrl}" target="_blank" class="btn btn-outline btn-sm">
                        <i data-lucide="external-link"></i> Open / Download File
                    </a>
                </div>
            `;
        }
    }

    // Render verified clinical intelligence in right pane
    if (intelContainer) {
        let intelHtml = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div class="detail-block" style="background: var(--bg-body); padding: 8px 12px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                    <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block;">Document Type</span>
                    <div style="font-weight: 700; color: var(--accent-blue); font-size: 0.88rem;">${escapeHtml(doc.document_type)}</div>
                </div>
                <div class="detail-block" style="background: var(--bg-body); padding: 8px 12px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                    <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block;">Document Date</span>
                    <div style="font-weight: 600; color: var(--text-main); font-size: 0.88rem;">${escapeHtml(doc.document_date)}</div>
                </div>
            </div>
        `;

        if (doc.document_type === "Lab Report" || doc.investigation_name || doc.investigation_value) {
            const rangeClass = (doc.range_status || "none").toLowerCase();
            let rangeBadge = "";
            if (rangeClass === "high") {
                rangeBadge = `<span class="range-badge high"><i data-lucide="alert-triangle"></i> Above Reference Range (High)</span>`;
            } else if (rangeClass === "low") {
                rangeBadge = `<span class="range-badge low"><i data-lucide="alert-triangle"></i> Below Reference Range (Low)</span>`;
            } else if (rangeClass === "normal") {
                rangeBadge = `<span class="range-badge normal"><i data-lucide="check-circle"></i> Within Reference Range</span>`;
            } else if (rangeClass === "out_of_range") {
                rangeBadge = `<span class="range-badge out_of_range"><i data-lucide="alert-triangle"></i> Outside Reference Range</span>`;
            }

            intelHtml += `
                <div class="detail-block" style="background: var(--bg-body); padding: 10px 12px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                    <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Investigation / Lab Test</span>
                    <div style="font-weight: 700; color: var(--accent-teal); font-size: 0.95rem;">${escapeHtml(doc.investigation_name || doc.title || 'Laboratory Report')}</div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div class="detail-block" style="background: var(--bg-body); padding: 10px 12px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                        <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Observed Value</span>
                        <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">${escapeHtml(doc.investigation_value || 'Not specified')}</div>
                        ${rangeBadge}
                    </div>
                    <div class="detail-block" style="background: var(--bg-body); padding: 10px 12px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                        <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Reference Range</span>
                        <div style="color: var(--text-muted); font-weight: 600; font-size: 0.88rem;">${escapeHtml(doc.reference_range || 'Not specified')}</div>
                        <div class="range-disclaimer">Reference indicator only (no automated diagnosis)</div>
                    </div>
                </div>
            `;
        }

        if (doc.diagnosis) {
            intelHtml += `
                <div class="detail-block" style="background: var(--bg-body); padding: 10px 12px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                    <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Clinical Diagnosis</span>
                    <div style="color: var(--danger); font-weight: 600; font-size: 0.88rem;">${escapeHtml(doc.diagnosis)}</div>
                </div>
            `;
        }

        if (doc.medicines) {
            intelHtml += `
                <div class="detail-block" style="background: var(--bg-body); padding: 10px 12px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                    <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Prescribed Medicines & Regimen</span>
                    <div style="color: var(--accent-teal); font-weight: 600; font-size: 0.88rem; white-space: pre-wrap;">${escapeHtml(doc.medicines)}</div>
                </div>
            `;
        }

        if (doc.notes) {
            intelHtml += `
                <div class="detail-block" style="background: var(--bg-body); padding: 10px 12px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color);">
                    <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px;">Clinical Notes / Remarks</span>
                    <div style="color: var(--text-muted); font-size: 0.82rem; font-style: italic;">${escapeHtml(doc.notes)}</div>
                </div>
            `;
        }

        intelContainer.innerHTML = intelHtml;
    }

    modal.classList.add("modal-active");

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

function closeViewDocumentModal() {
    const modal = document.getElementById("view-document-modal");
    if (modal) {
        modal.classList.remove("modal-active");
    }
    const fileFrame = document.getElementById("view-doc-file-frame");
    if (fileFrame) {
        fileFrame.innerHTML = "";
    }
}


// ============================================================
// AUTHENTICATION — UI LAYER (Phase 3)
// ============================================================

// ── Role tab switcher ──────────────────────────────────────

function switchLoginRole(role) {
    const patientForm   = document.getElementById("patient-login-form");
    const doctorForm    = document.getElementById("doctor-login-form");
    const tabPatient    = document.getElementById("tab-patient-login");
    const tabDoctor     = document.getElementById("tab-doctor-login");
    const errorBanner   = document.getElementById("login-error-banner");

    if (errorBanner) errorBanner.style.display = "none";

    if (role === "DOCTOR") {
        if (patientForm) patientForm.style.display = "none";
        if (doctorForm)  doctorForm.style.display  = "block";
        if (tabPatient)  tabPatient.classList.remove("active");
        if (tabDoctor)   tabDoctor.classList.add("active");
    } else {
        if (patientForm) patientForm.style.display = "block";
        if (doctorForm)  doctorForm.style.display  = "none";
        if (tabPatient)  tabPatient.classList.add("active");
        if (tabDoctor)   tabDoctor.classList.remove("active");
    }

    if (typeof lucide !== "undefined") lucide.createIcons();
}

// ── Show login error banner ───────────────────────────────

function showLoginError(message) {
    const banner = document.getElementById("login-error-banner");
    const text   = document.getElementById("login-error-text");
    if (banner && text) {
        text.innerText = message;
        banner.style.display = "flex";
    }
}

function hideLoginError() {
    const banner = document.getElementById("login-error-banner");
    if (banner) banner.style.display = "none";
}

// ── Patient login ─────────────────────────────────────────

async function handlePatientLogin(event) {
    if (event) event.preventDefault();

    hideLoginError();

    const patientIdInput = document.getElementById("login-patient-id");
    const passwordInput  = document.getElementById("login-patient-password");
    const submitBtn      = document.getElementById("btn-patient-login-submit");

    const patientId = (patientIdInput?.value || "").trim().toUpperCase();
    const password  = (passwordInput?.value  || "").trim();

    if (!patientId || !password) {
        showLoginError("Please enter your Patient ID and password.");
        return;
    }

    if (submitBtn) {
        submitBtn.disabled    = true;
        submitBtn.innerHTML   = "<span style='opacity:0.7;'>Signing in…</span>";
    }

    try {
        const data = await apiLogin(patientId, password);

        if (!data || data.role !== "PATIENT") {
            showLoginError("Access denied. This login is for patients only.");
            return;
        }

        // Session is stored by apiLogin → setAuthSession
        updateSidebarForRole("PATIENT");
        updateAuthUserBar();

        const pid = data.patient_id || patientId;
        try {
            const histData = await apiGetPatientHistory(pid);
            activePatient       = histData.patient;
            loadedConsultations = histData.consultations || [];
            enablePatientNavigation();
            populateDashboardCard(activePatient);
        } catch (_) {
            // History load failed — still redirect
        }

        showToast("Welcome back! Signed in as Patient.", "success");
        switchScreen("screen-history");
        if (activePatient) await renderCaseHistory();

    } catch (err) {
        showLoginError(err.message || "Login failed. Please check your credentials.");
    } finally {
        if (submitBtn) {
            submitBtn.disabled  = false;
            submitBtn.innerHTML = "<i data-lucide='log-in'></i> Log In as Patient";
            if (typeof lucide !== "undefined") lucide.createIcons();
        }
    }
}

// ── Doctor login ──────────────────────────────────────────

async function handleDoctorLogin(event) {
    if (event) event.preventDefault();

    hideLoginError();

    const doctorIdInput = document.getElementById("login-doctor-id");
    const passwordInput = document.getElementById("login-doctor-password");
    const submitBtn     = document.getElementById("btn-doctor-login-submit");

    const doctorId = (doctorIdInput?.value || "").trim().toUpperCase();
    const password = (passwordInput?.value  || "").trim();

    if (!doctorId || !password) {
        showLoginError("Please enter your Doctor ID and password.");
        return;
    }

    if (submitBtn) {
        submitBtn.disabled  = true;
        submitBtn.innerHTML = "<span style='opacity:0.7;'>Signing in…</span>";
    }

    try {
        const data = await apiLogin(doctorId, password);

        if (!data || data.role !== "DOCTOR") {
            showLoginError("Access denied. This login is for doctors only.");
            return;
        }

        updateSidebarForRole("DOCTOR");
        updateAuthUserBar();

        showToast("Welcome, Doctor! Access granted.", "success");
        switchScreen("screen-dashboard");

    } catch (err) {
        showLoginError(err.message || "Login failed. Please check your credentials.");
    } finally {
        if (submitBtn) {
            submitBtn.disabled  = false;
            submitBtn.innerHTML = "<i data-lucide='log-in'></i> Log In as Doctor";
            if (typeof lucide !== "undefined") lucide.createIcons();
        }
    }
}

// ── Doctor registration ───────────────────────────────────

async function handleDoctorRegistration(event) {
    if (event) event.preventDefault();

    const errorBanner = document.getElementById("doctor-reg-error-banner");
    const errorText   = document.getElementById("doctor-reg-error-text");
    const submitBtn   = document.getElementById("btn-doctor-reg-submit");

    const hideError = () => { if (errorBanner) errorBanner.style.display = "none"; };
    const showError = (msg) => {
        if (errorBanner && errorText) {
            errorText.innerText = msg;
            errorBanner.style.display = "flex";
        }
    };

    hideError();

    const doctorId       = (document.getElementById("doc-reg-id")?.value               || "").trim().toUpperCase();
    const password       = (document.getElementById("doc-reg-password")?.value          || "").trim();
    const confirmPwd     = (document.getElementById("doc-reg-confirm-password")?.value  || "").trim();

    if (!doctorId) {
        showError("Doctor ID is required.");
        return;
    }
    if (!password || password.length < 6) {
        showError("Password must be at least 6 characters long.");
        return;
    }
    if (password !== confirmPwd) {
        showError("Passwords do not match. Please re-enter your password.");
        return;
    }

    if (submitBtn) {
        submitBtn.disabled  = true;
        submitBtn.innerHTML = "<span style='opacity:0.7;'>Registering…</span>";
    }

    try {
        const result = await apiRegisterDoctor({
            doctor_id: doctorId,
            password:  password
        });

        // Show success card
        const formCard    = document.getElementById("doctor-reg-form-card");
        const successCard = document.getElementById("doctor-reg-success-card");
        const successId   = document.getElementById("success-doctor-id");

        if (formCard)    formCard.style.display    = "none";
        if (successCard) successCard.style.display = "block";
        if (successId)   successId.innerText       = result.doctor_id || doctorId;

        if (typeof lucide !== "undefined") lucide.createIcons();

    } catch (err) {
        showError(err.message || "Registration failed. Please try again.");
    } finally {
        if (submitBtn) {
            submitBtn.disabled  = false;
            submitBtn.innerHTML = "<i data-lucide='user-check'></i> Register Doctor Account";
            if (typeof lucide !== "undefined") lucide.createIcons();
        }
    }
}

// ── Logout ────────────────────────────────────────────────

function handleLogout() {
    if (typeof clearAuthSession === "function") clearAuthSession();
    sessionStorage.removeItem("activePatientId");
    sessionStorage.removeItem("currentScreen");

    activePatient       = null;
    loadedConsultations = [];
    loadedDocuments     = [];

    disablePatientNavigation();
    updateSidebarForRole(null);

    // Reset user bar
    const bar = document.getElementById("auth-user-bar");
    if (bar) bar.style.display = "none";

    showToast("You have been signed out.", "success");
    switchLoginRole("PATIENT");
    switchScreen("screen-login");
}

// ── Password show/hide toggle ─────────────────────────────

function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";

    if (btn) {
        btn.innerHTML = isHidden
            ? "<i data-lucide='eye-off' style='width:18px;height:18px;'></i>"
            : "<i data-lucide='eye'    style='width:18px;height:18px;'></i>";
        if (typeof lucide !== "undefined") lucide.createIcons();
    }
}

// ── Sidebar visibility based on role ─────────────────────

function updateSidebarForRole(role) {
    const navLogin        = document.getElementById("nav-login");
    const navDashboard    = document.getElementById("nav-dashboard");
    const navRegistration = document.getElementById("nav-registration");
    const navHistory      = document.getElementById("nav-history");
    const navConsultation = document.getElementById("nav-consultation");
    const navLogout       = document.getElementById("nav-logout");

    // Helper — show/hide sidebar items
    const show = (el) => { if (el) el.style.display = ""; };
    const hide = (el) => { if (el) el.style.display = "none"; };

    if (!role) {
        // Unauthenticated — show only Sign In
        show(navLogin);
        hide(navDashboard);
        hide(navRegistration);
        hide(navHistory);
        hide(navConsultation);
        hide(navLogout);
        return;
    }

    // Authenticated — hide Sign In, show Logout
    hide(navLogin);
    show(navLogout);

    if (role === "DOCTOR") {
        show(navDashboard);
        show(navRegistration);
        show(navHistory);
        show(navConsultation);
    } else if (role === "PATIENT") {
        // Patients only see their own case history
        hide(navDashboard);
        hide(navRegistration);
        show(navHistory);
        hide(navConsultation);    // Patients cannot add consultations
    }
}

// ── Auth user bar in header ───────────────────────────────

function updateAuthUserBar() {
    const bar      = document.getElementById("auth-user-bar");
    const nameSpan = document.getElementById("auth-user-name");

    if (!bar) return;

    const username = typeof getAuthUsername === "function" ? getAuthUsername() : null;
    const role     = typeof getAuthRole     === "function" ? getAuthRole()     : null;

    if (username && role) {
        bar.style.display = "flex";
        if (nameSpan) nameSpan.innerText = `${username} (${role})`;
    } else {
        bar.style.display = "none";
    }
}


