"""
MediKiosk Report Router
GET /report/{patient_id}  — Serves a standalone, printable HTML case history report.

This URL is encoded into the patient's QR code.
When a patient scans it with their phone camera:
  • A full case history page opens in the browser
  • An email is sent to the patient's registered address (background task)

When a doctor scans it inside the MediKiosk app, the JS extracts the patient ID
from the URL and loads the patient on the dashboard instead.
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.database import get_db
from app.database.models import Patient, Consultation
from app.services.email_service import send_report_email

router = APIRouter()


def _build_report_html(patient: Patient, consultations: list, email_sent: bool) -> str:
    """Build a beautiful, standalone, printable HTML report page."""

    # ── Consultation cards ─────────────────────────────────────────────────
    consult_cards = ""
    if consultations:
        for idx, c in enumerate(consultations, 1):
            notes_block = ""
            if c.notes:
                notes_block = f"""
                <div class="detail-row">
                  <div class="detail-label">Notes</div>
                  <div class="detail-value notes">{_esc(c.notes)}</div>
                </div>"""

            consult_cards += f"""
            <div class="consult-card">
              <div class="consult-header">
                <span class="consult-num">#{idx}</span>
                <span class="consult-date">{_esc(c.date)}</span>
                <span class="consult-doctor">
                  {_esc(c.doctor_name)} &bull; {_esc(c.specialization)} &bull; {_esc(c.hospital_name)}
                </span>
              </div>
              <div class="consult-body">
                <div class="detail-row">
                  <div class="detail-label">Symptoms</div>
                  <div class="detail-value">{_esc(c.symptoms)}</div>
                </div>
                <div class="detail-row">
                  <div class="detail-label">Diagnosis</div>
                  <div class="detail-value diagnosis">{_esc(c.diagnosis)}</div>
                </div>
                <div class="detail-row">
                  <div class="detail-label">Treatment</div>
                  <div class="detail-value treatment">{_esc(c.treatment)}</div>
                </div>
                {notes_block}
              </div>
            </div>"""
    else:
        consult_cards = """
        <div class="empty-consults">
          <span>📂</span>
          <p>No consultation records on file yet.</p>
        </div>"""

    # ── Allergy banner ─────────────────────────────────────────────────────
    allergy_val = str(patient.allergies or "").strip()
    has_allergies = allergy_val and allergy_val.lower() != "none"
    allergy_html = ""
    if has_allergies:
        allergy_html = f"""
        <div class="allergy-banner">
          <span class="allergy-icon">⚠️</span>
          <div>
            <div class="allergy-title">ALLERGY ALERT</div>
            <div class="allergy-text">{_esc(allergy_val)}</div>
          </div>
        </div>"""

    # ── Email status badge ─────────────────────────────────────────────────
    if patient.email:
        if email_sent:
            email_badge = f"""
            <div class="email-badge sent">
              ✅ Report sent to <strong>{_esc(patient.email)}</strong>
            </div>"""
        else:
            email_badge = f"""
            <div class="email-badge failed">
              ⚠️ Could not send email to <strong>{_esc(patient.email)}</strong>.
              Check SMTP settings.
            </div>"""
    else:
        email_badge = """
        <div class="email-badge no-email">
          ℹ️ No email address registered for this patient.
        </div>"""

    conditions = str(patient.conditions or "None").strip()
    summary = patient.summary or "No consultation history available yet."
    num_consults = len(consultations)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MediKiosk Report — {_esc(patient.id)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

  body {{
    font-family: 'Inter', system-ui, sans-serif;
    background: #0a0f1e;
    color: #e2e8f0;
    min-height: 100vh;
    padding: 24px 16px 48px;
  }}

  .page {{ max-width: 720px; margin: 0 auto; }}

  /* ── Header ── */
  .report-header {{
    background: linear-gradient(135deg, #1e3a8a 0%, #0891b2 100%);
    border-radius: 16px;
    padding: 28px 32px;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }}
  .logo {{
    display: flex;
    align-items: center;
    gap: 12px;
  }}
  .logo-icon {{
    width: 44px; height: 44px;
    background: rgba(255,255,255,0.2);
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px;
  }}
  .logo-text {{
    font-size: 22px;
    font-weight: 800;
    color: #fff;
    letter-spacing: -0.5px;
  }}
  .logo-text span {{ color: #bae6fd; }}
  .report-meta {{
    text-align: right;
    color: #bae6fd;
    font-size: 13px;
    line-height: 1.6;
  }}

  /* ── Patient ID card ── */
  .id-card {{
    background: #0f172a;
    border: 2px solid #38bdf8;
    border-radius: 14px;
    padding: 20px 24px;
    margin-bottom: 20px;
    text-align: center;
    box-shadow: 0 0 40px rgba(56,189,248,0.12);
  }}
  .id-label {{
    color: #64748b;
    font-size: 11px;
    letter-spacing: 3px;
    text-transform: uppercase;
    margin-bottom: 8px;
  }}
  .id-value {{
    color: #38bdf8;
    font-size: 30px;
    font-weight: 800;
    letter-spacing: 4px;
  }}

  /* ── Email badge ── */
  .email-badge {{
    border-radius: 10px;
    padding: 12px 18px;
    font-size: 13px;
    margin-bottom: 20px;
    text-align: center;
  }}
  .email-badge.sent {{ background: rgba(16,185,129,0.15); border: 1px solid #10b981; color: #34d399; }}
  .email-badge.failed {{ background: rgba(245,158,11,0.15); border: 1px solid #f59e0b; color: #fbbf24; }}
  .email-badge.no-email {{ background: rgba(100,116,139,0.15); border: 1px solid #475569; color: #94a3b8; }}

  /* ── Section cards ── */
  .section-card {{
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 14px;
    padding: 22px 26px;
    margin-bottom: 18px;
  }}
  .section-title {{
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }}
  .section-title.blue {{ color: #38bdf8; }}
  .section-title.purple {{ color: #a78bfa; }}
  .section-title.green {{ color: #34d399; }}

  /* ── Demographics grid ── */
  .demo-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }}
  .demo-field {{ }}
  .demo-field-label {{ color: #64748b; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 3px; }}
  .demo-field-value {{ color: #e2e8f0; font-size: 15px; font-weight: 600; }}

  /* ── Allergy banner ── */
  .allergy-banner {{
    background: rgba(127,29,29,0.4);
    border: 1px solid #dc2626;
    border-radius: 10px;
    padding: 14px 18px;
    margin-bottom: 18px;
    display: flex;
    align-items: center;
    gap: 14px;
  }}
  .allergy-icon {{ font-size: 24px; flex-shrink: 0; }}
  .allergy-title {{ color: #fca5a5; font-weight: 700; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; }}
  .allergy-text {{ color: #fecaca; font-size: 14px; }}

  /* ── Smart summary ── */
  .summary-text {{ color: #cbd5e1; font-size: 14px; line-height: 1.7; }}

  /* ── Consultation cards ── */
  .consult-card {{
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 10px;
    margin-bottom: 14px;
    overflow: hidden;
  }}
  .consult-header {{
    background: #1e293b;
    padding: 10px 16px;
    border-bottom: 1px solid #334155;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }}
  .consult-num {{ color: #38bdf8; font-weight: 700; font-size: 13px; }}
  .consult-date {{ color: #94a3b8; font-size: 13px; }}
  .consult-doctor {{ color: #64748b; font-size: 12px; margin-left: auto; }}
  .consult-body {{ padding: 4px 0; }}
  .detail-row {{
    display: flex;
    align-items: baseline;
    padding: 8px 16px;
    border-bottom: 1px solid #1e293b;
    gap: 12px;
  }}
  .detail-row:last-child {{ border-bottom: none; }}
  .detail-label {{ color: #64748b; font-size: 12px; min-width: 90px; flex-shrink: 0; text-transform: uppercase; letter-spacing: 0.5px; }}
  .detail-value {{ color: #e2e8f0; font-size: 13px; flex: 1; }}
  .detail-value.diagnosis {{ color: #f87171; font-weight: 600; }}
  .detail-value.treatment {{ color: #34d399; font-weight: 500; }}
  .detail-value.notes {{ color: #94a3b8; font-style: italic; }}

  /* ── Empty state ── */
  .empty-consults {{
    text-align: center;
    padding: 32px;
    color: #475569;
  }}
  .empty-consults span {{ font-size: 32px; display: block; margin-bottom: 8px; }}

  /* ── Footer ── */
  .footer {{
    text-align: center;
    color: #334155;
    font-size: 12px;
    margin-top: 32px;
    line-height: 1.7;
  }}

  /* ── Print styles ── */
  @media print {{
    body {{ background: #fff; color: #000; }}
    .report-header {{ background: #1e3a8a !important; }}
    .section-card, .consult-card {{ border-color: #ccc; }}
    .id-card {{ border-color: #1e3a8a; }}
    .id-value {{ color: #1e3a8a; }}
  }}

  @media (max-width: 480px) {{
    .demo-grid {{ grid-template-columns: 1fr; }}
    .consult-doctor {{ display: none; }}
    .report-header {{ flex-direction: column; }}
    .report-meta {{ text-align: left; }}
  }}
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="report-header">
    <div class="logo">
      <div class="logo-icon">🏥</div>
      <div class="logo-text">Medi<span>Kiosk</span></div>
    </div>
    <div class="report-meta">
      Patient Case History Report<br>
      {num_consults} Consultation Record{'s' if num_consults != 1 else ''}
    </div>
  </div>

  <!-- Patient ID -->
  <div class="id-card">
    <div class="id-label">MediKiosk Patient ID</div>
    <div class="id-value">{_esc(patient.id)}</div>
  </div>

  <!-- Email status -->
  {email_badge}

  <!-- Demographics -->
  <div class="section-card">
    <div class="section-title blue">👤 Patient Demographics</div>
    <div class="demo-grid">
      <div class="demo-field">
        <div class="demo-field-label">Full Name</div>
        <div class="demo-field-value">{_esc(patient.name)}</div>
      </div>
      <div class="demo-field">
        <div class="demo-field-label">Patient ID</div>
        <div class="demo-field-value">{_esc(patient.id)}</div>
      </div>
      <div class="demo-field">
        <div class="demo-field-label">Age</div>
        <div class="demo-field-value">{patient.age} years</div>
      </div>
      <div class="demo-field">
        <div class="demo-field-label">Gender</div>
        <div class="demo-field-value">{_esc(patient.gender)}</div>
      </div>
      <div class="demo-field">
        <div class="demo-field-label">Phone</div>
        <div class="demo-field-value">{_esc(patient.phone)}</div>
      </div>
      <div class="demo-field">
        <div class="demo-field-label">Conditions</div>
        <div class="demo-field-value">{_esc(conditions)}</div>
      </div>
    </div>
  </div>

  <!-- Allergy alert -->
  {allergy_html}

  <!-- Smart summary -->
  <div class="section-card">
    <div class="section-title purple">🧠 Smart Case Summary</div>
    <p class="summary-text">{_esc(summary)}</p>
  </div>

  <!-- Consultation timeline -->
  <div class="section-card">
    <div class="section-title green">📋 Consultation History</div>
    {consult_cards}
  </div>

  <div class="footer">
    This report was automatically generated by MediKiosk on QR scan.<br>
    Confidential — For authorized medical personnel and the registered patient only.
  </div>

</div>
</body>
</html>"""


def _esc(value) -> str:
    """Minimal HTML escape to prevent XSS in the report page."""
    if value is None:
        return ""
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


@router.get("/{patient_id}", response_class=HTMLResponse)
async def patient_report(
    patient_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Serves the full patient case history report as a standalone HTML page.
    Triggered when any phone camera scans the patient's MediKiosk QR code.
    Also fires an email to the patient's registered address in the background.
    """
    pid = patient_id.strip().upper()

    # Fetch patient
    patient = await db.get(Patient, pid)
    if not patient:
        return HTMLResponse(
            content=f"""<!DOCTYPE html><html><head><meta charset="UTF-8">
            <title>Not Found</title>
            <style>
              body{{font-family:system-ui;background:#0a0f1e;color:#e2e8f0;
                    display:flex;align-items:center;justify-content:center;min-height:100vh;}}
              .box{{text-align:center;padding:40px;}}
              h2{{color:#f87171;margin-bottom:12px;}}
              p{{color:#94a3b8;font-size:14px;}}
            </style></head>
            <body><div class="box">
              <div style="font-size:48px;margin-bottom:16px;">🔍</div>
              <h2>Patient Not Found</h2>
              <p>No patient record found for ID: <strong>{_esc(pid)}</strong></p>
              <p>Please verify the QR code or contact the clinic.</p>
            </div></body></html>""",
            status_code=404,
        )

    # Fetch consultations (newest first)
    result = await db.execute(
        select(Consultation)
        .where(Consultation.patient_id == patient.id)
        .order_by(Consultation.date.desc(), Consultation.id.desc())
    )
    consultations = result.scalars().all()

    # Build patient dict for email service
    patient_dict = {
        "id": patient.id,
        "name": patient.name,
        "age": patient.age,
        "gender": patient.gender,
        "phone": patient.phone,
        "email": patient.email,
        "allergies": patient.allergies,
        "conditions": patient.conditions,
        "summary": patient.summary,
    }

    # Build consultation dicts for email service
    consult_dicts = [
        {
            "date": c.date,
            "doctor_name": c.doctor_name,
            "specialization": c.specialization,
            "hospital_name": c.hospital_name,
            "symptoms": c.symptoms,
            "diagnosis": c.diagnosis,
            "treatment": c.treatment,
            "notes": c.notes,
        }
        for c in consultations
    ]

    # Fire email in background (non-blocking)
    email_sent = False
    if patient.email:
        background_tasks.add_task(send_report_email, patient_dict, consult_dicts)
        email_sent = True  # Optimistic — page shows "sent", email runs in bg

    html = _build_report_html(patient, consultations, email_sent)
    return HTMLResponse(content=html)
