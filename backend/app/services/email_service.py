"""
MediKiosk Email Service
Sends patient case history reports via Resend Email API.
"""

import os
import io
import logging
from datetime import datetime

import qrcode
import resend

logger = logging.getLogger(__name__)


def generate_qr_bytes(patient_id: str) -> bytes:
    """Generate PNG QR code bytes containing ONLY the Patient ID."""
    clean_id = (patient_id or "").strip().upper()
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr.add_data(clean_id)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0f172a", back_color="#ffffff")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()



def _build_html_email(patient, consultations: list) -> str:
    """Build rich HTML email body for the patient's case history report."""

    # ── Consultation rows ──────────────────────────────────────────────────
    consultation_rows = ""

    if consultations:
        for idx, c in enumerate(consultations, 1):
            notes_row = ""

            if c.get("notes"):
                notes_row = f"""
                <tr>
                  <td style="padding:6px 12px;color:#94a3b8;font-size:13px;width:140px;">
                    Notes
                  </td>
                  <td style="padding:6px 12px;color:#e2e8f0;font-size:13px;">
                    {c['notes']}
                  </td>
                </tr>
                """

            consultation_rows += f"""
            <div style="background:#1e293b;border:1px solid #334155;border-radius:10px;
                        margin-bottom:16px;overflow:hidden;">

              <div style="background:#0f172a;padding:10px 16px;border-bottom:1px solid #334155;
                          display:flex;justify-content:space-between;align-items:center;">

                <span style="color:#38bdf8;font-weight:700;font-size:14px;">
                  #{idx} &nbsp;·&nbsp; {c.get('date', '')}
                </span>

                <span style="color:#94a3b8;font-size:13px;">
                  {c.get('doctor_name', '')}
                  ({c.get('specialization', '')})
                  &mdash;
                  {c.get('hospital_name', '')}
                </span>

              </div>

              <table style="width:100%;border-collapse:collapse;">

                <tr>
                  <td style="padding:6px 12px;color:#94a3b8;font-size:13px;width:140px;">
                    Symptoms
                  </td>
                  <td style="padding:6px 12px;color:#e2e8f0;font-size:13px;">
                    {c.get('symptoms', '')}
                  </td>
                </tr>

                <tr style="background:#172033;">
                  <td style="padding:6px 12px;color:#94a3b8;font-size:13px;">
                    Diagnosis
                  </td>
                  <td style="padding:6px 12px;color:#f87171;font-size:13px;font-weight:600;">
                    {c.get('diagnosis', '')}
                  </td>
                </tr>

                <tr>
                  <td style="padding:6px 12px;color:#94a3b8;font-size:13px;">
                    Treatment
                  </td>
                  <td style="padding:6px 12px;color:#34d399;font-size:13px;font-weight:500;">
                    {c.get('treatment', '')}
                  </td>
                </tr>

                {notes_row}

              </table>
            </div>
            """

    else:
        consultation_rows = """
        <p style="color:#64748b;font-style:italic;text-align:center;padding:20px 0;">
          No consultation records on file yet.
        </p>
        """

    # ── Allergies banner ───────────────────────────────────────────────────
    allergy_val = str(patient.get("allergies", "") or "").strip()
    has_allergies = allergy_val and allergy_val.lower() != "none"

    allergy_banner = ""

    if has_allergies:
        allergy_banner = f"""
        <div style="background:#450a0a;border:1px solid #dc2626;border-radius:8px;
                    padding:12px 16px;margin-bottom:20px;display:flex;
                    align-items:center;gap:12px;">

          <span style="font-size:20px;">⚠️</span>

          <div>
            <div style="color:#fca5a5;font-weight:700;font-size:13px;margin-bottom:3px;">
              ALLERGY ALERT
            </div>

            <div style="color:#fecaca;font-size:13px;">
              {allergy_val}
            </div>
          </div>

        </div>
        """

    now = datetime.now().strftime("%d %b %Y, %I:%M %p")
    patient_id = str(patient.get('id') or '').strip().upper()
    qr_img_url = f"https://api.qrserver.com/v1/create-qr-code/?size=180x180&data={patient_id}"

    return f"""<!DOCTYPE html>
<html>

<head>
  <meta charset="UTF-8">
</head>

<body style="margin:0;padding:0;background:#0f172a;
             font-family:'Segoe UI',Arial,sans-serif;">

  <div style="max-width:640px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e40af,#0891b2);
                border-radius:12px;padding:28px 32px;margin-bottom:20px;
                text-align:center;">

      <div style="font-size:28px;font-weight:800;color:#ffffff;
                  letter-spacing:-0.5px;">
        🏥 MediKiosk
      </div>

      <div style="color:#bae6fd;font-size:14px;margin-top:6px;">
        Digital Patient Case History & Health ID Card
      </div>

      <div style="color:#7dd3fc;font-size:12px;margin-top:4px;">
        Generated: {now}
      </div>

    </div>

    <!-- Digital Health Card with QR Code (contains ONLY Patient ID) -->
    <div style="background:#1e293b;border:2px solid #38bdf8;
                border-radius:12px;padding:24px 20px;margin-bottom:20px;
                text-align:center;">

      <div style="color:#94a3b8;font-size:12px;letter-spacing:2px;
                  text-transform:uppercase;margin-bottom:6px;">
        Digital MediKiosk Health ID
      </div>

      <div style="color:#38bdf8;font-size:28px;font-weight:800;
                  letter-spacing:3px;margin-bottom:14px;">
        {patient_id}
      </div>

      <!-- QR Code containing ONLY Patient ID -->
      <div style="display:inline-block;background:#ffffff;padding:12px;
                  border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.25);
                  margin-bottom:12px;">
        <img src="{qr_img_url}"
             width="180" height="180"
             alt="MediKiosk QR - {patient_id}"
             style="display:block;margin:0 auto;border:0;width:180px;height:180px;" />
      </div>

      <div style="color:#94a3b8;font-size:12px;line-height:1.5;max-width:440px;margin:0 auto;">
        Scan this QR code at any MediKiosk terminal or present your ID for instant clinical history verification.
      </div>

    </div>

    <!-- Demographics -->
    <div style="background:#1e293b;border:1px solid #334155;
                border-radius:10px;padding:20px 24px;margin-bottom:20px;">

      <div style="color:#38bdf8;font-weight:700;font-size:14px;
                  text-transform:uppercase;letter-spacing:1px;
                  margin-bottom:14px;">
        👤 Patient Demographics
      </div>

      <table style="width:100%;border-collapse:collapse;">

        <tr>
          <td style="padding:6px 0;color:#94a3b8;font-size:13px;width:130px;">
            Full Name
          </td>

          <td style="padding:6px 0;color:#e2e8f0;font-size:13px;font-weight:600;">
            {patient.get('name', '')}
          </td>
        </tr>


        <tr>
          <td style="padding:6px 0;color:#94a3b8;font-size:13px;">
            Age / Gender
          </td>

          <td style="padding:6px 0;color:#e2e8f0;font-size:13px;">
            {patient.get('age', '')} yrs
            &nbsp;|&nbsp;
            {patient.get('gender', '')}
          </td>
        </tr>


        <tr>
          <td style="padding:6px 0;color:#94a3b8;font-size:13px;">
            Phone
          </td>

          <td style="padding:6px 0;color:#e2e8f0;font-size:13px;">
            {patient.get('phone', '')}
          </td>
        </tr>


        <tr>
          <td style="padding:6px 0;color:#94a3b8;font-size:13px;">
            Conditions
          </td>

          <td style="padding:6px 0;color:#e2e8f0;font-size:13px;">
            {patient.get('conditions', 'None')}
          </td>
        </tr>

      </table>

    </div>


    {allergy_banner}


    <!-- Smart Summary -->
    <div style="background:#1e293b;border:1px solid #334155;
                border-radius:10px;padding:20px 24px;margin-bottom:20px;">

      <div style="color:#a78bfa;font-weight:700;font-size:14px;
                  text-transform:uppercase;letter-spacing:1px;
                  margin-bottom:10px;">
        🧠 Smart Case Summary
      </div>

      <p style="color:#cbd5e1;font-size:13px;line-height:1.6;margin:0;">
        {patient.get('summary', 'No consultation history available yet.')}
      </p>

    </div>


    <!-- Consultation Timeline -->
    <div style="background:#1e293b;border:1px solid #334155;
                border-radius:10px;padding:20px 24px;margin-bottom:20px;">

      <div style="color:#34d399;font-weight:700;font-size:14px;
                  text-transform:uppercase;letter-spacing:1px;
                  margin-bottom:16px;">

        📋 Consultation History
        ({len(consultations)} record{'s' if len(consultations) != 1 else ''})

      </div>

      {consultation_rows}

    </div>


    <!-- Footer -->
    <div style="text-align:center;padding:16px 0;color:#475569;font-size:12px;">

      This report was automatically generated by MediKiosk.<br>

      Please keep this confidential.
      Do not share with unauthorized persons.

    </div>

  </div>

</body>

</html>
"""


def send_report_email(patient: dict, consultations: list) -> bool:
    """
    Send a full HTML case history report using the Resend Email API.

    Returns True on success, False if skipped or failed.
    """

    # Get patient's email
    to_email = (patient.get("email") or "").strip()

    if not to_email:
        logger.info(
            "Email skipped — patient %s has no email on file.",
            patient.get("id")
        )
        return False

    # Get Resend API key from environment
    api_key = os.getenv("RESEND_API_KEY")

    if not api_key:
        logger.warning(
            "Email skipped — RESEND_API_KEY is not configured."
        )
        return False

    # Email subject
    subject = (
        f"MediKiosk — Case History Report for "
        f"{patient.get('name', 'Patient')} "
        f"({patient.get('id', '')})"
    )

    try:
        # Configure Resend
        resend.api_key = api_key

        # Build the existing MediKiosk HTML report
        html_body = _build_html_email(
            patient,
            consultations
        )

        # Prepare email
        params = {
            "from": "MediKiosk <onboarding@resend.dev>",
            "to": [to_email],
            "subject": subject,
            "html": html_body,
        }

        # Attach downloadable QR code image
        try:
            pid = patient.get("id", "MK")
            qr_bytes = generate_qr_bytes(pid)
            params["attachments"] = [
                {
                    "filename": f"MediKiosk_QR_{pid}.png",
                    "content": list(qr_bytes),
                }
            ]
        except Exception as qr_att_err:
            logger.warning("Could not generate QR attachment: %s", qr_att_err)

        # Send through Resend API (with fallback if attachments fail)
        try:
            email = resend.Emails.send(params)
        except Exception as send_err:
            if "attachments" in params:
                logger.warning("Resend send failed with attachments, retrying without: %s", send_err)
                params.pop("attachments", None)
                email = resend.Emails.send(params)
            else:
                raise send_err


        logger.info(
            "Report email sent successfully to %s "
            "for patient %s. Resend response: %s",
            to_email,
            patient.get("id"),
            email
        )

        return True

    except Exception as exc:
        logger.error(
            "Failed to send report email through Resend: %s",
            exc
        )

        return False