
// ============================================================
// MediKiosk Frontend Application Controller
// ============================================================

let activePatient = null;
let currentScreen = "screen-registration";
let editingConsultationId = null;
let loadedConsultations = [];

let html5QrCode = null;
let isScanning = false;

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

            const patient =
                await apiSearchPatient(storedPatientId);

            activePatient = patient;

            enablePatientNavigation();

            populateDashboardCard(patient);

            switchScreen(storedScreen);

            if (storedScreen === "screen-history") {
                await renderCaseHistory();
            }

            else if (storedScreen === "screen-consultation") {
                prepareConsultationForm();
            }

            return;

        } catch (error) {

            console.warn(
                "Could not restore patient session:",
                error
            );

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

async function handleRegistration(event) {

    event.preventDefault();

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

    if (
        !name ||
        isNaN(age) ||
        !gender ||
        !phone
    ) {

        showToast(
            "Please fill all required fields.",
            "danger"
        );

        return;
    }

    const patientData = {
        name,
        age,
        gender,
        phone,
        allergies,
        conditions
    };

    try {

        const response =
            await apiRegisterPatient(patientData);

        const registeredPatient =
            response.patient;

        if (!registeredPatient || !registeredPatient.id) {
            throw new Error(
                "Invalid patient data returned by server."
            );
        }

        // ====================================================
        // ONLY QR GENERATION IN THE APPLICATION
        // QR CONTAINS ONLY PATIENT ID
        // ====================================================

        const qrCodeUrl =
            `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(registeredPatient.id)}`;

        document.getElementById("success-patient-id").innerText =
            registeredPatient.id;

        document.getElementById("success-qr-code").src =
            qrCodeUrl;

        // ====================================================

        document.getElementById(
            "registration-form-card"
        ).style.display = "none";

        document.getElementById(
            "registration-success-card"
        ).style.display = "block";

        activePatient =
            registeredPatient;

        sessionStorage.setItem(
            "activePatientId",
            registeredPatient.id
        );

        enablePatientNavigation();

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        showToast(
            "Patient registered successfully!"
        );

    } catch (error) {

        console.error(
            "Registration error:",
            error
        );

        showToast(
            error.message ||
            "Registration failed",
            "danger"
        );
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

function resetRegistrationForm() {

    const form =
        document.getElementById(
            "patient-registration-form"
        );

    if (form) {
        form.reset();
    }

    document.getElementById(
        "registration-success-card"
    ).style.display = "none";

    document.getElementById(
        "registration-form-card"
    ).style.display = "block";

    // Do not remove active patient.
    // The newly registered patient remains active.
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

    try {

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
            "Patient record located."
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
            "scanner-manual-input"
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

    const cleanId =
        String(decodedText || "").trim();

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
            "scanner-manual-input"
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
                                class="btn btn-secondary btn-sm"
                                onclick="openEditConsultation(${Number(consult.id)})"
                                title="Edit Consultation"
                            >

                                <i data-lucide="edit-3"></i>

                                Edit

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
                                onclick="openEditConsultation(${Number(consult.id)})"
                                title="Edit this consultation"
                            >

                                <i data-lucide="pencil"></i>

                                Edit

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

    editingConsultationId = null;

    const form =
        document.getElementById(
            "consultation-form"
        );

    if (form) {
        form.reset();
    }

    const editId =
        document.getElementById(
            "edit-consultation-id"
        );

    if (editId) {
        editId.value = "";
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

function openEditConsultation(
    consultId
) {

    if (!activePatient) return;

    const consult =
        loadedConsultations.find(
            c =>
                Number(c.id) ===
                Number(consultId)
        );

    if (!consult) {

        showToast(
            "Consultation not found.",
            "danger"
        );

        return;
    }

    editingConsultationId =
        consult.id;

    switchScreen(
        "screen-consultation"
    );

    const patientLabel =
        document.getElementById(
            "consultation-active-patient"
        );

    if (patientLabel) {

        patientLabel.innerText =
            `${activePatient.name} (${activePatient.id})`;
    }

    const editId =
        document.getElementById(
            "edit-consultation-id"
        );

    if (editId) {
        editId.value =
            consult.id;
    }

    document.getElementById(
        "consult-symptoms"
    ).value =
        consult.symptoms || "";

    document.getElementById(
        "consult-diagnosis"
    ).value =
        consult.diagnosis || "";

    document.getElementById(
        "consult-doctor"
    ).value =
        consult.doctor_name || "";

    document.getElementById(
        "consult-specialization"
    ).value =
        consult.specialization || "";

    document.getElementById(
        "consult-hospital"
    ).value =
        consult.hospital_name || "";

    document.getElementById(
        "consult-date"
    ).value =
        consult.date || "";

    document.getElementById(
        "consult-treatment"
    ).value =
        consult.treatment || "";

    document.getElementById(
        "consult-notes"
    ).value =
        consult.notes || "";

    const titleText =
        document.getElementById(
            "consultation-title-text"
        );

    if (titleText) {
        titleText.innerText =
            "Edit Clinical Consultation";
    }

    const btnText =
        document.getElementById(
            "consultation-btn-text"
        );

    if (btnText) {
        btnText.innerText =
            "Update Consultation";
    }

    document.getElementById(
        "page-title"
    ).innerText =
        "Edit Consultation";

    document.getElementById(
        "page-desc"
    ).innerText =
        "Update clinical diagnosis, prescribed treatment, and doctor details";

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

// ============================================================
// SAVE / UPDATE CONSULTATION
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

    const editIdElement =
        document.getElementById(
            "edit-consultation-id"
        );

    const editId =
        editIdElement?.value.trim() || "";

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

    try {

        if (
            editingConsultationId ||
            editId
        ) {

            const consultationId =
                editingConsultationId ||
                editId;

            await apiUpdateConsultation(
                consultationId,
                payload
            );

            showToast(
                "Consultation updated successfully!"
            );

        } else {

            payload.patient_id =
                activePatient.id;

            await apiAddConsultation(
                payload
            );

            showToast(
                "Consultation saved successfully!"
            );
        }

        editingConsultationId =
            null;

        if (editIdElement) {
            editIdElement.value = "";
        }

        switchScreen(
            "screen-history"
        );

        await renderCaseHistory();

    } catch (error) {

        console.error(
            "Consultation save/update error:",
            error
        );

        showToast(
            error.message ||
            "Failed to save consultation",
            "danger"
        );
    }
}

// ============================================================
// CANCEL CONSULTATION
// ============================================================

function cancelAddConsultation() {

    editingConsultationId = null;

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