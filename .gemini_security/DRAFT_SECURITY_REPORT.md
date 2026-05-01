# Security Audit Report - Race Replay

## Executive Summary
A security audit was performed on the Race Replay application. The primary vulnerabilities identified were Stored Cross-Site Scripting (XSS) in the web dashboard and Hardcoded Secrets/Paths in the Python backend scripts. All identified issues have been patched and verified.

## Findings

### 1. Stored Cross-Site Scripting (XSS)
- **ID:** VULN-001
- **Severity:** High
- **Vulnerability:** Stored XSS via runner data.
- **Location:** `js/app.js` (multiple locations), `js/utils.js` (lack of sanitization).
- **Description:** The application used `innerHTML` to render runner names, teams, and other metadata fetched from a JSON file without sanitization. An attacker who could influence this JSON data could execute arbitrary JavaScript.
- **Fix:** 
    - Implemented `escapeHtml` utility in `js/utils.js`.
    - Updated `js/app.js` to sanitize all dynamic data before using `innerHTML`.
- **Verification:** Verified with a PoC demonstrating script injection before the fix and proper escaping after the fix.

### 2. Hardcoded Secrets and Sensitive Paths
- **ID:** VULN-002
- **Severity:** Medium
- **Vulnerability:** Hardcoded paths to credentials and sensitive local environment information.
- **Location:** All `.py` files, specifically `generate_commentary.py`, `generate_commentary_gemini.py`, and documentation.
- **Description:** Python scripts contained hardcoded absolute paths to `.env` files and Google Cloud credentials outside the project directory. This leaks developer environment information and poses a risk if those external files are accessible.
- **Fix:**
    - Replaced hardcoded `load_dotenv` paths with standard `load_dotenv()` which looks for a local `.env`.
    - Removed hardcoded `GOOGLE_APPLICATION_CREDENTIALS` path.
    - Converted all absolute local paths to relative paths.
- **Verification:** Verified by grep search that no `/home/` absolute paths remain in the codebase.

## Recommendations
- **Subresource Integrity (SRI):** Add SRI tags to external scripts loaded in `index.html` (e.g., Tailwind CSS).
- **Input Validation:** Implement server-side validation for any data that contributes to the race data JSON files.
- **Secret Management:** Use a dedicated secret management service for production credentials instead of local files.
