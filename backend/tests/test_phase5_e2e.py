"""
MediKiosk Phase 5 — Full Integration & Verification Test Suite (Steps A - K)

A. Register a new patient
B. Record the generated Patient ID
C. Login using that Patient ID and the same password
D. Confirm patient login succeeds
E. Confirm patient sees only their own case
F. Logout
G. Login as Doctor
H. Confirm Doctor login still works
I. Confirm Doctor can search the patient
J. Confirm existing QR, documents, timeline and consultations still work
K. Run the existing Phase 4 authorization tests again
"""

import sys
import os
import asyncio
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

import httpx
from app.main import app
from tests.test_authorization import run_security_tests


async def test_phase5_lifecycle():
    print("\n" + "=" * 70)
    print("  PHASE 5 — PATIENT LOGIN & FULL INTEGRATION TEST SEQUENCE")
    print("=" * 70 + "\n")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:

        # ------------------------------------------------------------
        # STEP A: Register a new patient with credentials
        # ------------------------------------------------------------
        print(">>> Step A: Registering new patient...")
        reg_password = "PatientSecurePass2026!"
        reg_payload = {
            "name": "Phase5 Verification Patient",
            "age": 34,
            "gender": "Female",
            "phone": "9887766554",
            "email": "phase5.patient@example.com",
            "allergies": "Sulfa drugs",
            "conditions": "Hypertension",
            "password": reg_password
        }
        res_reg = await client.post("/api/patient/register", json=reg_payload)
        assert res_reg.status_code == 200, f"Registration failed: {res_reg.status_code} {res_reg.text}"
        reg_data = res_reg.json()
        assert reg_data.get("status") == "success", "Registration status != success"

        # ------------------------------------------------------------
        # STEP B: Record the generated Patient ID
        # ------------------------------------------------------------
        new_patient_id = reg_data["patient"]["id"]
        print(f">>> Step B: Recorded generated Patient ID: {new_patient_id}")
        assert new_patient_id.startswith("MK-2026-"), f"Unexpected Patient ID format: {new_patient_id}"

        # ------------------------------------------------------------
        # STEP C: Login using that Patient ID and the same password
        # ------------------------------------------------------------
        print(f">>> Step C: Logging in as Patient ({new_patient_id})...")
        login_payload = {
            "identifier": new_patient_id,
            "password": reg_password
        }
        res_login = await client.post("/api/auth/login", json=login_payload)
        assert res_login.status_code == 200, f"Patient login failed: {res_login.status_code} {res_login.text}"
        login_data = res_login.json()

        # ------------------------------------------------------------
        # STEP D: Confirm patient login succeeds
        # ------------------------------------------------------------
        print(">>> Step D: Confirming patient login response & claims...")
        assert login_data.get("status") == "success", "Login response status not success"
        assert login_data.get("role") == "PATIENT", f"Expected role PATIENT, got {login_data.get('role')}"
        assert login_data.get("user_identifier") == new_patient_id, "User identifier does not match"
        assert login_data.get("patient_id") == new_patient_id, "Patient ID does not match"
        patient_token = login_data.get("token")
        assert patient_token, "No access token received"
        print(f"    [PASS] Patient login succeeded with valid JWT token (role: {login_data['role']})")

        # ------------------------------------------------------------
        # STEP E: Confirm patient sees only their own case
        # ------------------------------------------------------------
        print(">>> Step E: Verifying patient isolation boundaries...")
        patient_headers = {"Authorization": f"Bearer {patient_token}"}

        # E1. Access own history -> Allowed (200 OK)
        res_own_hist = await client.get(f"/api/patient/{new_patient_id}/history", headers=patient_headers)
        assert res_own_hist.status_code == 200, f"Own history failed: {res_own_hist.status_code}"
        own_hist_data = res_own_hist.json()
        assert own_hist_data["patient"]["id"] == new_patient_id
        assert own_hist_data["patient"]["name"] == "Phase5 Verification Patient"
        print("    [PASS] Patient accesses own history -> 200 OK (correct demographic record)")

        # E2. Access another patient's history (e.g. MK-2026-1001) -> Denied (403 Forbidden)
        res_other_hist = await client.get("/api/patient/MK-2026-1001/history", headers=patient_headers)
        assert res_other_hist.status_code == 403, f"Expected 403 on other history, got {res_other_hist.status_code}"
        print("    [PASS] Patient accesses another patient's history -> 403 Forbidden")

        # E3. Search another patient's ID -> Denied (403 Forbidden)
        res_other_search = await client.get("/api/patient/search?id=MK-2026-1001", headers=patient_headers)
        assert res_other_search.status_code == 403, f"Expected 403 on search other, got {res_other_search.status_code}"
        print("    [PASS] Patient searches another patient's ID -> 403 Forbidden")

        # E4. Search own patient ID -> Allowed (200 OK)
        res_own_search = await client.get(f"/api/patient/search?id={new_patient_id}", headers=patient_headers)
        assert res_own_search.status_code == 200, f"Expected 200 on search own, got {res_own_search.status_code}"
        print("    [PASS] Patient searches own patient ID -> 200 OK")

        # ------------------------------------------------------------
        # STEP F: Logout
        # ------------------------------------------------------------
        print(">>> Step F: Simulating logout (clearing patient session)...")
        del patient_headers
        print("    [PASS] Session cleared")

        # ------------------------------------------------------------
        # STEP G: Login as Doctor
        # ------------------------------------------------------------
        print(">>> Step G: Preparing doctor credentials & logging in as Doctor...")
        doctor_id = "DOC-PHASE5-01"
        doctor_password = "DoctorClinicalPass2026!"

        # Ensure doctor is registered
        await client.post("/api/auth/doctor/register", json={
            "doctor_id": doctor_id,
            "password": doctor_password,
            "name": "Dr. Sarah Mitchell",
            "specialization": "Internal Medicine",
            "hospital_name": "MediKiosk General Hospital"
        })

        res_doc_login = await client.post("/api/auth/login", json={
            "identifier": doctor_id,
            "password": doctor_password
        })
        assert res_doc_login.status_code == 200, f"Doctor login failed: {res_doc_login.status_code} {res_doc_login.text}"
        doc_data = res_doc_login.json()

        # ------------------------------------------------------------
        # STEP H: Confirm Doctor login still works
        # ------------------------------------------------------------
        print(">>> Step H: Confirming Doctor login response & role claims...")
        assert doc_data.get("status") == "success"
        assert doc_data.get("role") == "DOCTOR"
        assert doc_data.get("user_identifier") == doctor_id
        doctor_token = doc_data.get("token")
        assert doctor_token
        doc_headers = {"Authorization": f"Bearer {doctor_token}"}
        print(f"    [PASS] Doctor login works (role: {doc_data['role']}, doctor_id: {doctor_id})")

        # ------------------------------------------------------------
        # STEP I: Confirm Doctor can search the patient
        # ------------------------------------------------------------
        print(f">>> Step I: Doctor searching newly registered patient ({new_patient_id})...")
        res_doc_search = await client.get(f"/api/patient/search?id={new_patient_id}", headers=doc_headers)
        assert res_doc_search.status_code == 200, f"Doctor search failed: {res_doc_search.status_code}"
        search_result = res_doc_search.json()
        assert search_result["id"] == new_patient_id
        assert search_result["name"] == "Phase5 Verification Patient"
        print(f"    [PASS] Doctor successfully located patient {new_patient_id}")

        # ------------------------------------------------------------
        # STEP J: Confirm existing QR, documents, timeline & consultations still work
        # ------------------------------------------------------------
        print(">>> Step J: Confirming QR, documents, consultations, and timeline functionality...")

        # J1. QR generation contains Patient ID only
        res_qr = await client.get(f"/api/patient/{new_patient_id}/qr")
        assert res_qr.status_code == 200, f"QR endpoint failed: {res_qr.status_code}"
        assert res_qr.headers.get("content-type") == "image/png"
        print("    [PASS] QR generation endpoint returns 200 image/png")

        # J2. Doctor creates consultation for the patient
        res_consult = await client.post("/api/patient/consultation", headers=doc_headers, json={
            "patient_id": new_patient_id,
            "date": "2026-09-14",
            "doctor_name": "Dr. Sarah Mitchell",
            "specialization": "Internal Medicine",
            "hospital_name": "MediKiosk General Hospital",
            "symptoms": "Mild seasonal allergies",
            "diagnosis": "Allergic Rhinitis",
            "treatment": "Antihistamine 10mg daily as needed",
            "notes": "Patient advised to avoid known allergens."
        })
        assert res_consult.status_code == 200, f"Consultation creation failed: {res_consult.status_code}"
        consult_data = res_consult.json()
        assert consult_data["status"] == "success"
        print("    [PASS] Doctor created new consultation record")

        # J3. Doctor views patient timeline/history
        res_timeline = await client.get(f"/api/patient/{new_patient_id}/history", headers=doc_headers)
        assert res_timeline.status_code == 200
        tl_data = res_timeline.json()
        assert len(tl_data["consultations"]) == 1
        assert tl_data["consultations"][0]["diagnosis"] == "Allergic Rhinitis"
        print("    [PASS] Timeline and consultation history retrieved successfully")

        # J4. Document upload & listing
        import base64
        test_file_b64 = base64.b64encode(b"Dummy PDF blood report").decode("utf-8")
        res_doc_up = await client.post(f"/api/patient/{new_patient_id}/document", headers=doc_headers, json={
            "document_type": "Lab Report",
            "document_date": "2026-09-14",
            "title": "Complete Blood Count",
            "file_name": "cbc_report.pdf",
            "file_data": f"data:application/pdf;base64,{test_file_b64}",
            "investigation_name": "Hemoglobin",
            "investigation_value": "14.2",
            "reference_range": "12.0 - 16.0",
            "range_status": "normal"
        })
        assert res_doc_up.status_code == 200, f"Document upload failed: {res_doc_up.status_code}"
        doc_id = res_doc_up.json()["document"]["id"]
        print(f"    [PASS] Attached document uploaded (Doc ID: {doc_id})")

        # J5. View document file with doctor credentials
        res_doc_file = await client.get(f"/api/patient/document/{doc_id}/file", headers=doc_headers)
        assert res_doc_file.status_code == 200, f"View doc file failed: {res_doc_file.status_code}"
        print("    [PASS] Doctor successfully retrieved uploaded document file")

        # ------------------------------------------------------------
        # STEP K: Run the existing Phase 4 authorization tests again
        # ------------------------------------------------------------
        print("\n>>> Step K: Running Phase 4 authorization test suite for regression verification...")
        await run_security_tests()
        print("    [PASS] Phase 4 authorization regression test passed without errors")

    print("\n" + "=" * 70)
    print("  ALL STEPS A - K COMPLETED AND VERIFIED SUCCESSFULLY!")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    asyncio.run(test_phase5_lifecycle())
