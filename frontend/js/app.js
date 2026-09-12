
// ============================================================
// MediKiosk Frontend Application Controller
// ============================================================

let activePatient = null;
let currentScreen = "screen-registration";
let loadedConsultations = [];

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

    const storedPatientId =
        sessionStorage.getItem("activePatientId");

    const storedScreen =
        sessionStorage.getItem("currentScreen") ||
        "screen-registration";

    if (storedPatientId) {
        try {
            if (storedScreen === "screen-history") {
                const data = await apiGetPatientHistory(storedPatientId);
                activePatient = data.patient;
                loadedConsultations = data.consultations || [];
                enablePatientNavigation();
                populateDashboardCard(activePatient);
                switchScreen("screen-history");
                await renderCaseHistory();
            } else {
                const patient = await apiSearchPatient(storedPatientId);
                activePatient = patient;
                enablePatientNavigation();
                populateDashboardCard(patient);
                switchScreen(storedScreen);
                if (storedScreen === "screen-consultation") {
                    prepareConsultationForm();
                }
            }
            return;
        } catch (error) {
            console.warn("Could not restore patient session:", error);
            sessionStorage.removeItem("activePatientId");
            activePatient = null;
        }
    }


    switchScreen("screen-registration");
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

    const patientData = {
        name,
        age,
        gender,
        phone,
        email,
        allergies,
        conditions
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

            summaryElement.innerText =
                loadedConsultations.length === 0
                    ? "No consultation history available yet."
                    : activePatient.summary ||
                    "No consultation history available yet.";
        }

        // Render compact horizontal Automatic Medical Journey Timeline
        renderMedicalJourneyTimeline(activePatient, loadedConsultations);

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

                            <button
                                type="button"
                                class="btn btn-outline btn-sm"
                                onclick="openViewConsultation(${Number(consult.id)})"
                                title="View Prescription Details"
                            >

                                <i data-lucide="eye"></i>

                                View

                            </button>

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
// ADD CONSULTATION
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

function extractMedicalTimelineEvents(patient, consultations = []) {
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

    return events;
}

function renderMedicalJourneyTimeline(patient, consultations = []) {
    const card = document.getElementById("medical-journey-card");
    const track = document.getElementById("medical-journey-track");
    const countBadge = document.getElementById("timeline-milestone-count");

    if (!card || !track) return;

    if (!patient) {
        card.style.display = "none";
        return;
    }

    // Extract automatic chronological events
    activeTimelineEvents = extractMedicalTimelineEvents(patient, consultations);

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

