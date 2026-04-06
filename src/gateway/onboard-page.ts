/**
 * Self-contained onboard wizard HTML page.
 * Returns the complete HTML string for the AJAX-based setup wizard.
 *
 * Wizard steps (indexed):
 *   0  - Already configured (shown only when config exists)
 *   1  - Welcome
 *   2  - Security / Risk Acknowledgment
 *   3  - Setup Mode (QuickStart / Manual)
 *   4  - AI Provider Selection
 *   5  - Model Selection
 *   6  - Workspace Directory
 *   7  - Gateway Settings
 *   8  - Search Setup
 *   9  - Skills Setup
 *   10 - Hooks Setup
 *   11 - Enhanced Completion
 */

export function getOnboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>StableClaw Setup</title>
<style>
:root {
  --primary: #4F46E5;
  --primary-light: #6366F1;
  --primary-dark: #3730A3;
  --accent: #7C3AED;
  --bg: #F8FAFC;
  --surface: #FFFFFF;
  --text: #0F172A;
  --text-secondary: #64748B;
  --text-muted: #94A3B8;
  --border: #E2E8F0;
  --border-focus: #4F46E5;
  --error: #EF4444;
  --error-bg: #FEF2F2;
  --success: #10B981;
  --success-bg: #ECFDF5;
  --warning: #F59E0B;
  --warning-bg: #FFFBEB;
  --info: #2563EB;
  --info-bg: #EFF6FF;
  --shadow-sm: 0 1px 2px 0 rgba(0,0,0,.05);
  --shadow: 0 1px 3px 0 rgba(0,0,0,.1), 0 1px 2px -1px rgba(0,0,0,.1);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.1);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,.1), 0 4px 6px -4px rgba(0,0,0,.1);
  --radius: 12px;
  --radius-sm: 8px;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.wizard-card {
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-width: 620px;
  overflow: hidden;
}

.wizard-header {
  background: linear-gradient(135deg, var(--primary), var(--accent));
  padding: 28px 32px 20px;
  text-align: center;
  color: #fff;
}

.wizard-header .logo {
  width: 52px;
  height: 52px;
  margin: 0 auto 10px;
  background: rgba(255,255,255,.15);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
}

.wizard-header h1 {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 2px;
}

.wizard-header p {
  font-size: 13px;
  opacity: .85;
}

.wizard-body { padding: 24px 28px 28px; }

/* Steps */
.step { display: none; }
.step.active { display: block; animation: fadeIn .3s ease; }

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.step h2 {
  font-size: 17px;
  font-weight: 600;
  margin-bottom: 4px;
}

.step .description {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 18px;
}

/* Progress bar */
.progress-bar {
  display: flex;
  gap: 4px;
  margin-bottom: 22px;
}

.progress-bar .dot {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
  transition: background .3s ease;
}

.progress-bar .dot.completed { background: var(--primary); }
.progress-bar .dot.current { background: var(--primary-light); }

/* Form elements */
.form-group {
  margin-bottom: 14px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 5px;
}

.form-group label .hint {
  font-weight: 400;
  color: var(--text-muted);
  font-size: 11px;
}

input[type="text"],
input[type="password"],
input[type="number"],
select,
textarea {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text);
  background: var(--surface);
  transition: border-color .2s, box-shadow .2s;
  outline: none;
  font-family: inherit;
}

textarea {
  resize: vertical;
  min-height: 60px;
}

input:focus, select:focus, textarea:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px rgba(79,70,229,.12);
}

input::placeholder, textarea::placeholder { color: var(--text-muted); }

select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2364748B' viewBox='0 0 16 16'%3E%3Cpath d='M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
}

/* Radio group */
.radio-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.radio-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color .2s, background .2s;
}

.radio-option:hover { background: #F8FAFC; }
.radio-option.selected { border-color: var(--primary); background: #EEF2FF; }

.radio-option input[type="radio"] { display: none; }

.radio-option .radio-dot {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: border-color .2s;
}

.radio-option.selected .radio-dot {
  border-color: var(--primary);
}

.radio-option.selected .radio-dot::after {
  content: '';
  width: 8px;
  height: 8px;
  background: var(--primary);
  border-radius: 50%;
}

.radio-option .radio-label {
  font-size: 13px;
  font-weight: 500;
}

.radio-option .radio-desc {
  font-size: 11px;
  color: var(--text-secondary);
}

/* Provider grid */
.provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 8px;
}

.provider-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color .2s, background .2s;
  text-align: center;
}

.provider-card:hover { background: #F8FAFC; border-color: #CBD5E1; }
.provider-card.selected { border-color: var(--primary); background: #EEF2FF; }

.provider-card .provider-icon {
  font-size: 24px;
  margin-bottom: 4px;
}

.provider-card .provider-name {
  font-size: 12px;
  font-weight: 600;
}

.provider-card .provider-env {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 2px;
}

.provider-card input[type="radio"] { display: none; }

/* Toggle switch */
.toggle-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  overflow-y: auto;
}

.toggle-list::-webkit-scrollbar { width: 6px; }
.toggle-list::-webkit-scrollbar-track { background: transparent; }
.toggle-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
.toggle-list::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

.toggle-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: border-color .2s, background .2s;
}

.toggle-item:hover { background: #F8FAFC; }
.toggle-item.enabled { border-color: var(--primary); background: #EEF2FF; }

.toggle-item .toggle-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.toggle-item .toggle-info {
  flex: 1;
  min-width: 0;
}

.toggle-item .toggle-name {
  font-size: 13px;
  font-weight: 500;
}

.toggle-item .toggle-desc {
  font-size: 11px;
  color: var(--text-secondary);
}

.toggle-switch {
  position: relative;
  width: 40px;
  height: 22px;
  flex-shrink: 0;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.toggle-switch .slider {
  position: absolute;
  inset: 0;
  background: var(--border);
  border-radius: 11px;
  cursor: pointer;
  transition: background .2s;
}

.toggle-switch .slider::before {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: white;
  top: 3px;
  left: 3px;
  transition: transform .2s;
  box-shadow: var(--shadow-sm);
}

.toggle-switch input:checked + .slider {
  background: var(--primary);
}

.toggle-switch input:checked + .slider::before {
  transform: translateX(18px);
}

/* Checkbox */
.checkbox-group {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--warning-bg);
  border-color: #FDE68A;
  margin-bottom: 16px;
}

.checkbox-group input[type="checkbox"] {
  margin-top: 3px;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  accent-color: var(--warning);
}

.checkbox-group label {
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  line-height: 1.5;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 18px;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background .2s, transform .1s, opacity .2s;
  text-decoration: none;
  font-family: inherit;
}

.btn:active { transform: scale(.98); }
.btn:disabled { opacity: .5; cursor: not-allowed; transform: none; }

.btn-primary {
  background: linear-gradient(135deg, var(--primary), var(--accent));
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, var(--primary-dark), var(--primary));
}

.btn-secondary {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.btn-secondary:hover:not(:disabled) { background: #F8FAFC; }

.btn-row {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}

.btn-row .btn-secondary { margin-right: auto; }

/* Spinner */
.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin .6s linear infinite;
  display: none;
}

.btn.loading .spinner { display: block; }
.btn.loading .btn-text { display: none; }

@keyframes spin { to { transform: rotate(360deg); } }

/* Inline messages */
.msg {
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  margin-top: 10px;
  display: none;
}

.msg.visible { display: flex; align-items: center; gap: 8px; animation: fadeIn .2s ease; }
.msg.error { background: var(--error-bg); color: var(--error); border: 1px solid #FECACA; }
.msg.success { background: var(--success-bg); color: var(--success); border: 1px solid #A7F3D0; }
.msg.info { background: var(--info-bg); color: var(--info); border: 1px solid #BFDBFE; }

/* Configured overlay */
.configured-panel {
  text-align: center;
  padding: 12px 0;
}

.configured-panel .check {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--success-bg);
  color: var(--success);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px;
  font-size: 24px;
}

/* Test result */
.test-result {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  margin-top: 8px;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  display: none;
}

.test-result.visible { display: flex; }
.test-result.success { background: var(--success-bg); color: var(--success); }
.test-result.error { background: var(--error-bg); color: var(--error); }

.test-btn {
  margin-top: 8px;
  padding: 5px 10px;
  font-size: 11px;
}

/* Security warning box */
.security-box {
  background: var(--warning-bg);
  border: 1px solid #FDE68A;
  border-radius: var(--radius-sm);
  padding: 14px;
  margin-bottom: 16px;
  font-size: 12px;
  line-height: 1.6;
  color: #92400E;
  max-height: 280px;
  overflow-y: auto;
}

.security-box::-webkit-scrollbar { width: 6px; }
.security-box::-webkit-scrollbar-track { background: transparent; }
.security-box::-webkit-scrollbar-thumb { background: #FDE68A; border-radius: 3px; }

.security-box strong {
  display: block;
  font-size: 13px;
  color: #78350F;
  margin-bottom: 6px;
}

.security-box ul {
  list-style: none;
  padding: 0;
}

.security-box li {
  padding: 2px 0;
}

.security-box li::before {
  content: "\\2022";
  margin-right: 6px;
  font-weight: bold;
}

/* Mode cards */
.mode-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.mode-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 16px;
  cursor: pointer;
  transition: border-color .2s, background .2s;
  text-align: center;
}

.mode-card:hover { background: #F8FAFC; }
.mode-card.selected { border-color: var(--primary); background: #EEF2FF; }

.mode-card .mode-icon {
  font-size: 28px;
  margin-bottom: 8px;
}

.mode-card .mode-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
}

.mode-card .mode-desc {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.mode-card input[type="radio"] { display: none; }

/* Completion summary */
.summary-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px 14px;
  font-size: 13px;
  margin: 16px 0;
}

.summary-grid .summary-label {
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
}

.summary-grid .summary-value {
  color: var(--text);
  word-break: break-word;
}

.summary-grid .summary-value.empty {
  color: var(--text-muted);
  font-style: italic;
}

/* Completion step */
.completion-panel {
  text-align: center;
  padding: 12px 0;
}

.completion-panel .icon {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--accent));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 14px;
  font-size: 28px;
  box-shadow: var(--shadow-md);
}

.completion-panel h2 { margin-bottom: 6px; }
.completion-panel p { color: var(--text-secondary); font-size: 13px; margin-bottom: 16px; }

.dashboard-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--primary);
  font-weight: 500;
  font-size: 13px;
  text-decoration: none;
}

.dashboard-link:hover { text-decoration: underline; }

/* Skip link */
.skip-link {
  display: inline-block;
  color: var(--text-muted);
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
  margin-top: 8px;
}

.skip-link:hover { color: var(--text-secondary); }

/* Step label */
.step-label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: .5px;
  margin-bottom: 4px;
}

/* Responsive */
@media (max-width: 600px) {
  body { padding: 8px; }
  .wizard-header { padding: 20px 16px 16px; }
  .wizard-body { padding: 16px; }
  .wizard-card { max-width: 100%; }
  .mode-cards { grid-template-columns: 1fr; }
  .provider-grid { grid-template-columns: repeat(2, 1fr); }
  .summary-grid { grid-template-columns: 1fr; gap: 4px; }
}
</style>
</head>
<body>
<div class="wizard-card">
  <div class="wizard-header">
    <div class="logo">\u{1F9E0}</div>
    <h1>StableClaw Setup</h1>
    <p>Configure your gateway in a few steps</p>
  </div>
  <div class="wizard-body">
    <div class="progress-bar" id="progressBar">
      <div class="dot" data-step="0"></div>
      <div class="dot" data-step="1"></div>
      <div class="dot" data-step="2"></div>
      <div class="dot" data-step="3"></div>
      <div class="dot" data-step="4"></div>
      <div class="dot" data-step="5"></div>
      <div class="dot" data-step="6"></div>
      <div class="dot" data-step="7"></div>
      <div class="dot" data-step="8"></div>
      <div class="dot" data-step="9"></div>
    </div>

    <!-- Step 0: Already configured -->
    <div class="step" id="step-configured">
      <div class="configured-panel">
        <div class="check">\u2713</div>
        <h2>Already Configured</h2>
        <p class="description">Your StableClaw gateway is already set up and ready to use.</p>
        <div class="btn-row" style="justify-content:center; margin-top:20px;">
          <a href="/" class="btn btn-primary"><span class="btn-text">Open Dashboard</span></a>
          <button class="btn btn-secondary" id="btnReconfigure"><span class="btn-text">Reconfigure</span></button>
        </div>
      </div>
    </div>

    <!-- Step 1: Welcome -->
    <div class="step" id="step-welcome">
      <h2>Welcome to StableClaw</h2>
      <p class="description">Let's get your gateway configured. This wizard will guide you through setting up an AI provider, gateway settings, and optional features like web search and skills.</p>
      <div class="btn-row">
        <div></div>
        <button class="btn btn-primary" id="btnStart">
          <span class="btn-text">Get Started</span>
          <span class="spinner"></span>
        </button>
      </div>
    </div>

    <!-- Step 2: Security / Risk Acknowledgment -->
    <div class="step" id="step-security">
      <h2>Security Notice</h2>
      <p class="description">Please read and acknowledge before continuing.</p>
      <div class="security-box">
        <strong>\u26A0\uFE0F Security Warning</strong>
        <ul>
          <li>StableClaw is a hobby project and still in beta. Expect sharp edges.</li>
          <li>By default, StableClaw is a <strong>personal agent</strong>: one trusted operator boundary.</li>
          <li>This bot can read files and run actions if tools are enabled.</li>
          <li>A bad prompt can trick it into doing unsafe things.</li>
          <li>StableClaw is not a hostile multi-tenant boundary by default.</li>
          <li>If multiple users can message one tool-enabled agent, they share that delegated tool authority.</li>
          <li>If you're not comfortable with security hardening and access control, don't run StableClaw.</li>
        </ul>
        <br>
        <strong>Recommended Baseline</strong>
        <ul>
          <li>Pairing/allowlists + mention gating</li>
          <li>Multi-user/shared inbox: split trust boundaries</li>
          <li>Sandbox + least-privilege tools</li>
          <li>Keep secrets out of the agent's reachable filesystem</li>
          <li>Use the strongest available model for any bot with tools or untrusted inboxes</li>
        </ul>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="securityAcknowledge">
        <label for="securityAcknowledge">I understand this is personal-by-default and shared/multi-user use requires lock-down. I accept the risks and wish to continue.</label>
      </div>
      <div class="msg" id="securityError"></div>
      <div class="btn-row">
        <button class="btn btn-secondary" id="btnSecurityBack"><span class="btn-text">Back</span></button>
        <button class="btn btn-primary" id="btnSecurityNext">
          <span class="btn-text">Continue</span>
          <span class="spinner"></span>
        </button>
      </div>
    </div>

    <!-- Step 3: Setup Mode -->
    <div class="step" id="step-mode">
      <h2>Setup Mode</h2>
      <p class="description">Choose how you'd like to configure StableClaw.</p>
      <div class="mode-cards" id="modeGroup">
        <label class="mode-card selected" data-mode="quickstart">
          <input type="radio" name="setupMode" value="quickstart" checked>
          <div class="mode-icon">\u26A1</div>
          <div class="mode-title">QuickStart</div>
          <div class="mode-desc">Auto-generates gateway config with sensible defaults. Configure details later.</div>
        </label>
        <label class="mode-card" data-mode="manual">
          <input type="radio" name="setupMode" value="manual">
          <div class="mode-icon">\u{1F527}</div>
          <div class="mode-title">Manual</div>
          <div class="mode-desc">Full control over port, network, Tailscale, auth, and all options.</div>
        </label>
      </div>
      <div class="btn-row">
        <button class="btn btn-secondary" id="btnModeBack"><span class="btn-text">Back</span></button>
        <button class="btn btn-primary" id="btnModeNext">
          <span class="btn-text">Next</span>
          <span class="spinner"></span>
        </button>
      </div>
    </div>

    <!-- Step 4: AI Provider -->
    <div class="step" id="step-provider">
      <h2>AI Provider</h2>
      <p class="description">Choose your primary AI provider and enter your API key.</p>
      <div class="step-label">Major Providers</div>
      <div class="provider-grid" id="providerGroup">
        <label class="provider-card selected" data-provider="openai">
          <input type="radio" name="provider" value="openai" checked>
          <div class="provider-icon">\u{1F916}</div>
          <div class="provider-name">OpenAI</div>
          <div class="provider-env">OPENAI_API_KEY</div>
        </label>
        <label class="provider-card" data-provider="anthropic">
          <input type="radio" name="provider" value="anthropic">
          <div class="provider-icon">\u{1F4AC}</div>
          <div class="provider-name">Anthropic</div>
          <div class="provider-env">ANTHROPIC_API_KEY</div>
        </label>
        <label class="provider-card" data-provider="google">
          <input type="radio" name="provider" value="google">
          <div class="provider-icon">\u{1F48E}</div>
          <div class="provider-name">Google AI</div>
          <div class="provider-env">GEMINI_API_KEY</div>
        </label>
      </div>
      <div class="step-label" style="margin-top:14px;">Popular Providers</div>
      <div class="provider-grid" id="providerGroup2">
        <label class="provider-card" data-provider="deepseek">
          <input type="radio" name="provider" value="deepseek">
          <div class="provider-icon">\u{1F52C}</div>
          <div class="provider-name">DeepSeek</div>
          <div class="provider-env">DEEPSEEK_API_KEY</div>
        </label>
        <label class="provider-card" data-provider="openrouter">
          <input type="radio" name="provider" value="openrouter">
          <div class="provider-icon">\u{1F310}</div>
          <div class="provider-name">OpenRouter</div>
          <div class="provider-env">OPENROUTER_API_KEY</div>
        </label>
        <label class="provider-card" data-provider="mistral">
          <input type="radio" name="provider" value="mistral">
          <div class="provider-icon">\u{1F329}</div>
          <div class="provider-name">Mistral</div>
          <div class="provider-env">MISTRAL_API_KEY</div>
        </label>
        <label class="provider-card" data-provider="xai">
          <input type="radio" name="provider" value="xai">
          <div class="provider-icon">\u{1F680}</div>
          <div class="provider-name">xAI (Grok)</div>
          <div class="provider-env">XAI_API_KEY</div>
        </label>
        <label class="provider-card" data-provider="together">
          <input type="radio" name="provider" value="together">
          <div class="provider-icon">\u{1F91D}</div>
          <div class="provider-name">Together AI</div>
          <div class="provider-env">TOGETHER_API_KEY</div>
        </label>
        <label class="provider-card" data-provider="custom">
          <input type="radio" name="provider" value="custom">
          <div class="provider-icon">\u{1F510}</div>
          <div class="provider-name">Custom</div>
          <div class="provider-env">OpenAI-Compatible</div>
        </label>
      </div>
      <div class="form-group" id="customBaseGroup" style="display:none; margin-top:14px;">
        <label>Base URL</label>
        <input type="text" id="customBaseUrl" placeholder="https://api.example.com/v1">
      </div>
      <div class="form-group" id="customModelGroup" style="display:none;">
        <label>Model Name</label>
        <input type="text" id="customModel" placeholder="gpt-4o-mini">
      </div>
      <div class="form-group" style="margin-top:14px;">
        <label>API Key</label>
        <input type="password" id="apiKey" placeholder="sk-..." autocomplete="off">
      </div>
      <div style="display:flex; gap:8px; align-items:center; margin-top:-6px; margin-bottom:12px;">
        <button class="btn btn-secondary test-btn" id="btnTestProvider">Test Connection</button>
        <div class="test-result" id="testResult"></div>
      </div>
      <div class="msg" id="providerError"></div>
      <div class="btn-row">
        <button class="btn btn-secondary" id="btnProviderBack"><span class="btn-text">Back</span></button>
        <button class="btn btn-primary" id="btnProviderNext">
          <span class="btn-text">Next</span>
          <span class="spinner"></span>
        </button>
      </div>
    </div>

    <!-- Step 5: Model Selection -->
    <div class="step" id="step-model">
      <h2>Model Selection</h2>
      <p class="description">Choose the default model for your agent. You can change this later.</p>
      <div class="form-group">
        <label>Default Model</label>
        <select id="modelSelect">
          <option value="">Loading models...</option>
        </select>
      </div>
      <div class="form-group" id="customModelInputGroup" style="display:none;">
        <label>Or enter model name manually</label>
        <input type="text" id="customModelInput" placeholder="model-name">
      </div>
      <div class="msg" id="modelError"></div>
      <div class="btn-row">
        <button class="btn btn-secondary" id="btnModelBack"><span class="btn-text">Back</span></button>
        <button class="btn btn-primary" id="btnModelNext">
          <span class="btn-text">Next</span>
          <span class="spinner"></span>
        </button>
      </div>
    </div>

    <!-- Step 6: Workspace Directory -->
    <div class="step" id="step-workspace">
      <h2>Workspace Directory</h2>
      <p class="description">The workspace is where your agent stores sessions, memory, and files. Choose a path on this machine.</p>
      <div class="form-group">
        <label>Workspace Path <span class="hint">(absolute or relative to home)</span></label>
        <input type="text" id="workspaceDir" placeholder="~/.stableclaw/workspace">
      </div>
      <div class="msg info visible" id="workspaceInfo">
        <span>\u{1F4C1}</span>
        <span>The workspace directory will be created automatically if it doesn't exist. This is where your agent's sessions, memory, and scratch files live.</span>
      </div>
      <div class="msg" id="workspaceError"></div>
      <div class="btn-row">
        <button class="btn btn-secondary" id="btnWorkspaceBack"><span class="btn-text">Back</span></button>
        <button class="btn btn-primary" id="btnWorkspaceNext">
          <span class="btn-text">Next</span>
          <span class="spinner"></span>
        </button>
      </div>
    </div>

    <!-- Step 7: Gateway Settings -->
    <div class="step" id="step-gateway">
      <h2>Gateway Settings</h2>
      <p class="description">Configure how the gateway listens for connections.</p>
      <div class="form-group">
        <label>Port <span class="hint">(default: 18789)</span></label>
        <input type="number" id="gatewayPort" value="18789" min="1024" max="65535">
      </div>
      <div class="form-group">
        <label>Bind Mode</label>
        <select id="bindMode">
          <option value="loopback">Loopback (localhost only)</option>
          <option value="lan">LAN (all interfaces)</option>
          <option value="auto">Auto (loopback preferred)</option>
        </select>
      </div>
      <div class="form-group">
        <label>Auth Mode</label>
        <select id="authMode">
          <option value="token">Token (recommended)</option>
          <option value="password">Password</option>
          <option value="none">None (not recommended)</option>
        </select>
      </div>
      <div class="form-group" id="tokenGroup">
        <label>Gateway Token <span class="hint">(auto-generated if blank)</span></label>
        <input type="text" id="gatewayToken" placeholder="Auto-generated if left blank" autocomplete="off">
      </div>
      <div class="form-group" id="passwordGroup" style="display:none;">
        <label>Gateway Password</label>
        <input type="password" id="gatewayPassword" placeholder="Enter a strong password" autocomplete="new-password">
      </div>
      <div class="msg" id="gatewayError"></div>
      <div class="btn-row">
        <button class="btn btn-secondary" id="btnGatewayBack"><span class="btn-text">Back</span></button>
        <button class="btn btn-primary" id="btnGatewayNext">
          <span class="btn-text">Next</span>
          <span class="spinner"></span>
        </button>
      </div>
    </div>

    <!-- Step 8: Search Setup -->
    <div class="step" id="step-search">
      <h2>Web Search</h2>
      <p class="description">Enable web search to give your agent access to real-time information from the internet.</p>
      <div class="radio-group" id="searchGroup">
        <label class="radio-option selected" data-search="none">
          <input type="radio" name="searchProvider" value="none" checked>
          <span class="radio-dot"></span>
          <div>
            <span class="radio-label">Skip for now</span>
            <div class="radio-desc">You can enable search later via the config</div>
          </div>
        </label>
        <label class="radio-option" data-search="brave">
          <input type="radio" name="searchProvider" value="brave">
          <span class="radio-dot"></span>
          <div>
            <span class="radio-label">Brave Search</span>
            <div class="radio-desc">Web search via Brave Search API</div>
          </div>
        </label>
        <label class="radio-option" data-search="tavily">
          <input type="radio" name="searchProvider" value="tavily">
          <span class="radio-dot"></span>
          <div>
            <span class="radio-label">Tavily</span>
            <div class="radio-desc">AI-powered search optimized for LLMs</div>
          </div>
        </label>
      </div>
      <div class="form-group" id="searchKeyGroup" style="display:none;">
        <label>Search API Key</label>
        <input type="password" id="searchApiKey" placeholder="Enter your search API key" autocomplete="off">
      </div>
      <div class="msg" id="searchError"></div>
      <div class="btn-row">
        <button class="btn btn-secondary" id="btnSearchBack"><span class="btn-text">Back</span></button>
        <button class="btn btn-primary" id="btnSearchNext">
          <span class="btn-text">Next</span>
          <span class="spinner"></span>
        </button>
      </div>
    </div>

    <!-- Step 9: Skills Setup -->
    <div class="step" id="step-skills">
      <h2>Skills</h2>
      <p class="description">Skills extend your agent's capabilities. Toggle the ones you want to enable.</p>
      <div class="toggle-list" id="skillsList">
        <div style="text-align:center; color:var(--text-muted); padding:20px;">Loading skills...</div>
      </div>
      <div class="msg" id="skillsError"></div>
      <div class="btn-row">
        <button class="btn btn-secondary" id="btnSkillsBack"><span class="btn-text">Back</span></button>
        <button class="btn btn-primary" id="btnSkillsNext">
          <span class="btn-text">Next</span>
          <span class="spinner"></span>
        </button>
      </div>
    </div>

    <!-- Step 10: Hooks Setup -->
    <div class="step" id="step-hooks">
      <h2>Hooks</h2>
      <p class="description">Hooks automate actions when agent commands are issued. For example, save session context to memory when starting a new session.</p>
      <div class="toggle-list" id="hooksList">
        <div style="text-align:center; color:var(--text-muted); padding:20px;">Loading hooks...</div>
      </div>
      <div class="msg" id="hooksError"></div>
      <div class="btn-row">
        <button class="btn btn-secondary" id="btnHooksBack"><span class="btn-text">Back</span></button>
        <button class="btn btn-primary" id="btnHooksNext">
          <span class="btn-text">Complete Setup</span>
          <span class="spinner"></span>
        </button>
      </div>
    </div>

    <!-- Step 11: Enhanced Completion -->
    <div class="step" id="step-complete">
      <div class="completion-panel">
        <div class="icon">\u2713</div>
        <h2>Setup Complete!</h2>
        <p>Your StableClaw gateway is configured and ready. The gateway will reload with your new settings.</p>
        <div style="text-align:left; max-width:400px; margin:0 auto;" id="summaryContainer"></div>
        <div style="margin-top:20px;">
          <a href="/" class="dashboard-link">Go to Dashboard \u2192</a>
        </div>
      </div>
    </div>
  </div>
</div>

<script>
(function() {
  'use strict';

  // Step indices for the wizard flow (excluding "configured" and "complete")
  var WELCOME = 1, SECURITY = 2, MODE = 3, PROVIDER = 4, MODEL = 5,
      WORKSPACE = 6, GATEWAY = 7, SEARCH = 8, SKILLS = 9, HOOKS = 10;
  var COMPLETE = 11;

  // Total visible steps in progress bar
  var TOTAL_PROGRESS = 10;

  var currentStep = -1;
  var wizardData = { setupMode: 'quickstart', provider: 'openai', model: '', searchProvider: 'none', enabledSkills: [], enabledHooks: [] };

  function $(id) { return document.getElementById(id); }

  function showStep(idx) {
    var steps = document.querySelectorAll('.step');
    for (var i = 0; i < steps.length; i++) steps[i].classList.remove('active');
    steps[idx].classList.add('active');
    currentStep = idx;

    // Map wizard step to progress bar index
    var progressIdx = idx - 1;
    if (idx === COMPLETE) progressIdx = TOTAL_PROGRESS;
    if (idx === 0) progressIdx = TOTAL_PROGRESS;
    updateProgress(progressIdx);
  }

  function updateProgress(idx) {
    var dots = document.querySelectorAll('.progress-bar .dot');
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.remove('completed', 'current');
      if (i < idx) dots[i].classList.add('completed');
      else if (i === idx && idx < TOTAL_PROGRESS) dots[i].classList.add('current');
    }
  }

  function showMsg(el, text, type) {
    el.textContent = text;
    el.className = 'msg visible ' + type;
  }

  function hideMsg(el) { el.className = 'msg'; }

  function setLoading(btn, on) {
    if (on) btn.classList.add('loading');
    else btn.classList.remove('loading');
  }

  function showTestResult(text, type) {
    var el = $('testResult');
    el.textContent = text;
    el.className = 'test-result visible ' + type;
  }

  function hideTestResult() {
    $('testResult').className = 'test-result';
  }

  function getProvider() {
    var checked = document.querySelector('input[name="provider"]:checked');
    return checked ? checked.value : 'openai';
  }

  function getSetupMode() {
    var checked = document.querySelector('input[name="setupMode"]:checked');
    return checked ? checked.value : 'quickstart';
  }

  function getSearchProvider() {
    var checked = document.querySelector('input[name="searchProvider"]:checked');
    return checked ? checked.value : 'none';
  }

  function generateToken() {
    var arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    return Array.from(arr, function(b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  function providerCardClick(e) {
    var card = e.target.closest('.provider-card');
    if (!card) return;

    // Deselect all provider cards across both groups
    var allCards = document.querySelectorAll('.provider-card');
    for (var i = 0; i < allCards.length; i++) allCards[i].classList.remove('selected');
    card.classList.add('selected');
    card.querySelector('input[type="radio"]').checked = true;

    var provider = getProvider();
    var isCustom = provider === 'custom';
    $('customBaseGroup').style.display = isCustom ? 'block' : 'none';
    $('customModelGroup').style.display = isCustom ? 'block' : 'none';
  }

  function modeCardClick(e) {
    var card = e.target.closest('.mode-card');
    if (!card) return;
    var allCards = document.querySelectorAll('.mode-card');
    for (var i = 0; i < allCards.length; i++) allCards[i].classList.remove('selected');
    card.classList.add('selected');
    card.querySelector('input[type="radio"]').checked = true;
  }

  function searchRadioClick(e) {
    var option = e.target.closest('.radio-option');
    if (!option) return;
    var group = option.parentElement;
    var opts = group.querySelectorAll('.radio-option');
    for (var i = 0; i < opts.length; i++) opts[i].classList.remove('selected');
    option.classList.add('selected');
    option.querySelector('input[type="radio"]').checked = true;
    var sp = getSearchProvider();
    $('searchKeyGroup').style.display = (sp !== 'none') ? 'block' : 'none';
  }

  // Attach click handlers
  $('providerGroup').addEventListener('click', providerCardClick);
  $('providerGroup2').addEventListener('click', providerCardClick);
  $('modeGroup').addEventListener('click', modeCardClick);
  $('searchGroup').addEventListener('click', searchRadioClick);

  $('authMode').addEventListener('change', function() {
    var mode = this.value;
    $('tokenGroup').style.display = mode === 'token' ? 'block' : 'none';
    $('passwordGroup').style.display = mode === 'password' ? 'block' : 'none';
  });

  // Fetch providers and populate model list on load
  var providerModels = {};
  fetch('/api/onboard/providers')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.providers) {
        data.providers.forEach(function(p) {
          if (p.models && p.models.length > 0) {
            providerModels[p.id] = p.models;
          }
        });
      }
    })
    .catch(function() {});

  function populateModels() {
    var provider = getProvider();
    var select = $('modelSelect');
    select.innerHTML = '';

    var models = providerModels[provider];
    if (models && models.length > 0) {
      models.forEach(function(m) {
        var opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        select.appendChild(opt);
      });
      $('customModelInputGroup').style.display = 'block';
    } else {
      var opt = document.createElement('option');
      opt.value = '';
      opt.textContent = provider === 'custom' ? 'Enter custom model below' : 'No specific models listed';
      select.appendChild(opt);
      $('customModelInputGroup').style.display = 'block';
    }
  }

  function loadToggleList(containerId, endpoint, dataKey) {
    fetch('/api/onboard/' + endpoint)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var container = $(containerId);
        var items = data[dataKey] || [];
        container.innerHTML = '';
        if (items.length === 0) {
          container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:20px;">No items available.</div>';
          return;
        }
        items.forEach(function(item) {
          var div = document.createElement('div');
          div.className = 'toggle-item';
          div.setAttribute('data-id', item.id);
          div.innerHTML =
            '<div class="toggle-icon">' + (item.emoji || '\u{1F527}') + '</div>' +
            '<div class="toggle-info"><div class="toggle-name">' + item.name + '</div>' +
            '<div class="toggle-desc">' + item.description + '</div></div>' +
            '<label class="toggle-switch"><input type="checkbox" data-key="' + item.id + '"><span class="slider"></span></label>';
          div.addEventListener('click', function(e) {
            if (e.target.tagName === 'INPUT') return;
            var cb = div.querySelector('input[type="checkbox"]');
            cb.checked = !cb.checked;
            div.classList.toggle('enabled', cb.checked);
          });
          div.querySelector('input[type="checkbox"]').addEventListener('change', function() {
            div.classList.toggle('enabled', this.checked);
          });
          container.appendChild(div);
        });
      })
      .catch(function() {
        $(containerId).innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:20px;">Could not load items.</div>';
      });
  }

  function getEnabledToggles(containerId) {
    var container = $(containerId);
    var checks = container.querySelectorAll('input[type="checkbox"]:checked');
    var result = [];
    for (var i = 0; i < checks.length; i++) result.push(checks[i].getAttribute('data-key'));
    return result;
  }

  // Check status on load
  fetch('/api/onboard/status')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.configured) {
        showStep(0);
        updateProgress(TOTAL_PROGRESS);
      } else {
        showStep(WELCOME);
        // Pre-load skills and hooks
        loadToggleList('skillsList', 'skills', 'skills');
        loadToggleList('hooksList', 'hooks', 'hooks');
      }
    })
    .catch(function() {
      showStep(WELCOME);
      loadToggleList('skillsList', 'skills', 'skills');
      loadToggleList('hooksList', 'hooks', 'hooks');
    });

  // Reconfigure button
  $('btnReconfigure').addEventListener('click', function() {
    loadToggleList('skillsList', 'skills', 'skills');
    loadToggleList('hooksList', 'hooks', 'hooks');
    showStep(WELCOME);
  });

  // Step 1: Welcome -> Step 2: Security
  $('btnStart').addEventListener('click', function() {
    showStep(SECURITY);
  });

  // Step 2: Security -> Step 3: Mode
  $('btnSecurityNext').addEventListener('click', function() {
    hideMsg($('securityError'));
    if (!$('securityAcknowledge').checked) {
      showMsg($('securityError'), 'Please acknowledge the security notice to continue.', 'error');
      return;
    }
    showStep(MODE);
  });

  $('btnSecurityBack').addEventListener('click', function() { showStep(WELCOME); });

  // Step 3: Mode -> Step 4: Provider
  $('btnModeNext').addEventListener('click', function() {
    wizardData.setupMode = getSetupMode();

    if (wizardData.setupMode === 'quickstart') {
      // QuickStart: skip model and gateway steps, go straight to provider
      showStep(PROVIDER);
    } else {
      showStep(PROVIDER);
    }
  });

  $('btnModeBack').addEventListener('click', function() { showStep(SECURITY); });

  // Test provider
  $('btnTestProvider').addEventListener('click', function() {
    var btn = this;
    var apiKey = $('apiKey').value.trim();
    if (!apiKey) {
      showMsg($('providerError'), 'Please enter an API key.', 'error');
      return;
    }
    hideMsg($('providerError'));
    hideTestResult();
    setLoading(btn, true);
    var provider = getProvider();
    var payload = { provider: provider, apiKey: apiKey };
    if (provider === 'custom') {
      payload.baseUrl = $('customBaseUrl').value.trim();
      payload.model = $('customModel').value.trim();
    }
    fetch('/api/onboard/test-provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      setLoading(btn, false);
      if (data.ok) {
        showTestResult('Connection successful!', 'success');
      } else {
        showTestResult(data.error || 'Connection failed.', 'error');
      }
    })
    .catch(function(err) {
      setLoading(btn, false);
      showTestResult('Network error: ' + err.message, 'error');
    });
  });

  // Step 4: Provider -> Step 5: Model
  $('btnProviderNext').addEventListener('click', function() {
    var btn = this;
    var apiKey = $('apiKey').value.trim();
    hideMsg($('providerError'));

    if (!apiKey) {
      showMsg($('providerError'), 'An API key is required.', 'error');
      return;
    }

    var provider = getProvider();
    wizardData.provider = provider;
    wizardData.apiKey = apiKey;
    if (provider === 'custom') {
      wizardData.baseUrl = $('customBaseUrl').value.trim();
      wizardData.model = $('customModel').value.trim();
      if (!wizardData.baseUrl) {
        showMsg($('providerError'), 'Base URL is required for custom providers.', 'error');
        return;
      }
    }

    setLoading(btn, true);
    fetch('/api/onboard/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'provider', provider: wizardData.provider, apiKey: wizardData.apiKey, baseUrl: wizardData.baseUrl, model: wizardData.model })
    })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Save failed'); });
      return r.json();
    })
    .then(function() {
      setLoading(btn, false);
      populateModels();
      showStep(MODEL);
    })
    .catch(function(err) {
      setLoading(btn, false);
      showMsg($('providerError'), err.message || 'Failed to save provider config.', 'error');
    });
  });

  $('btnProviderBack').addEventListener('click', function() { showStep(MODE); });

  // Step 5: Model -> Step 6: Workspace
  $('btnModelNext').addEventListener('click', function() {
    var btn = this;
    hideMsg($('modelError'));

    var model = $('modelSelect').value || $('customModelInput').value.trim();
    if (!model) {
      // No model selected is OK for some providers; use empty
      wizardData.model = '';
    } else {
      wizardData.model = model;
    }

    // Save model config
    if (wizardData.model) {
      setLoading(btn, true);
      fetch('/api/onboard/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'model', model: wizardData.model })
      })
      .then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Save failed'); });
        return r.json();
      })
      .then(function() {
        setLoading(btn, false);
        showStep(WORKSPACE);
      })
      .catch(function(err) {
        setLoading(btn, false);
        showMsg($('modelError'), err.message || 'Failed to save model config.', 'error');
      });
    } else {
      showStep(WORKSPACE);
    }
  });

  $('btnModelBack').addEventListener('click', function() { showStep(PROVIDER); });

  // Step 6: Workspace -> Step 7: Gateway
  $('btnWorkspaceNext').addEventListener('click', function() {
    var btn = this;
    hideMsg($('workspaceError'));

    var workspaceDir = $('workspaceDir').value.trim() || '~/.stableclaw/workspace';
    wizardData.workspaceDir = workspaceDir;

    setLoading(btn, true);
    fetch('/api/onboard/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'workspace', workspaceDir: workspaceDir })
    })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Save failed'); });
      return r.json();
    })
    .then(function() {
      setLoading(btn, false);
      showStep(GATEWAY);
    })
    .catch(function(err) {
      setLoading(btn, false);
      showMsg($('workspaceError'), err.message || 'Failed to save workspace config.', 'error');
    });
  });

  $('btnWorkspaceBack').addEventListener('click', function() { showStep(MODEL); });

  // Step 7: Gateway -> Step 8: Search
  $('btnGatewayNext').addEventListener('click', function() {
    var btn = this;
    hideMsg($('gatewayError'));

    var port = parseInt($('gatewayPort').value, 10);
    if (isNaN(port) || port < 1024 || port > 65535) {
      showMsg($('gatewayError'), 'Port must be between 1024 and 65535.', 'error');
      return;
    }

    var authMode = $('authMode').value;
    var token = $('gatewayToken').value.trim();
    var password = $('gatewayPassword').value.trim();

    if (authMode === 'token' && !token) {
      token = generateToken();
    }
    if (authMode === 'password' && !password) {
      showMsg($('gatewayError'), 'Password is required when auth mode is "password".', 'error');
      return;
    }

    wizardData.port = port;
    wizardData.bind = $('bindMode').value;
    wizardData.authMode = authMode;
    wizardData.token = token;
    wizardData.password = password;

    setLoading(btn, true);
    fetch('/api/onboard/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'gateway', port: wizardData.port, bind: wizardData.bind, authMode: wizardData.authMode, token: wizardData.token, password: wizardData.password })
    })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Save failed'); });
      return r.json();
    })
    .then(function() {
      setLoading(btn, false);
      showStep(SEARCH);
    })
    .catch(function(err) {
      setLoading(btn, false);
      showMsg($('gatewayError'), err.message || 'Failed to save gateway config.', 'error');
    });
  });

  $('btnGatewayBack').addEventListener('click', function() { showStep(WORKSPACE); });

  // Step 8: Search -> Step 9: Skills
  $('btnSearchNext').addEventListener('click', function() {
    var btn = this;
    hideMsg($('searchError'));

    var searchProvider = getSearchProvider();
    var searchApiKey = $('searchApiKey').value.trim();
    wizardData.searchProvider = searchProvider;

    if (searchProvider === 'none') {
      showStep(SKILLS);
      return;
    }

    if (!searchApiKey) {
      showMsg($('searchError'), 'API key is required for ' + searchProvider + '.', 'error');
      return;
    }

    setLoading(btn, true);
    fetch('/api/onboard/search-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: searchProvider, apiKey: searchApiKey })
    })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Save failed'); });
      return r.json();
    })
    .then(function() {
      setLoading(btn, false);
      showStep(SKILLS);
    })
    .catch(function(err) {
      setLoading(btn, false);
      showMsg($('searchError'), err.message || 'Failed to save search config.', 'error');
    });
  });

  $('btnSearchBack').addEventListener('click', function() { showStep(GATEWAY); });

  // Step 9: Skills -> Step 10: Hooks
  $('btnSkillsNext').addEventListener('click', function() {
    var btn = this;
    hideMsg($('skillsError'));

    wizardData.enabledSkills = getEnabledToggles('skillsList');

    setLoading(btn, true);
    fetch('/api/onboard/skills-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: wizardData.enabledSkills })
    })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Save failed'); });
      return r.json();
    })
    .then(function() {
      setLoading(btn, false);
      showStep(HOOKS);
    })
    .catch(function(err) {
      setLoading(btn, false);
      showMsg($('skillsError'), err.message || 'Failed to save skills config.', 'error');
    });
  });

  $('btnSkillsBack').addEventListener('click', function() { showStep(SEARCH); });

  // Step 10: Hooks -> Complete
  $('btnHooksNext').addEventListener('click', function() {
    var btn = this;
    hideMsg($('hooksError'));

    wizardData.enabledHooks = getEnabledToggles('hooksList');

    setLoading(btn, true);

    // Save hooks first
    fetch('/api/onboard/hooks-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: wizardData.enabledHooks })
    })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Save failed'); });
      return r.json();
    })
    .then(function() {
      // Then finalize
      return fetch('/api/onboard/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceDir: wizardData.workspaceDir,
          provider: wizardData.provider,
          model: wizardData.model,
          setupMode: wizardData.setupMode
        })
      });
    })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Completion failed'); });
      return r.json();
    })
    .then(function() {
      setLoading(btn, false);
      buildSummary();
      showStep(COMPLETE);
      updateProgress(TOTAL_PROGRESS);
    })
    .catch(function(err) {
      setLoading(btn, false);
      showMsg($('hooksError'), err.message || 'Setup failed.', 'error');
    });
  });

  $('btnHooksBack').addEventListener('click', function() { showStep(SKILLS); });

  // Build completion summary
  function buildSummary() {
    var container = $('summaryContainer');
    var rows = [
      { label: 'Setup Mode', value: wizardData.setupMode === 'quickstart' ? 'QuickStart' : 'Manual' },
      { label: 'AI Provider', value: wizardData.provider },
      { label: 'Model', value: wizardData.model },
      { label: 'Workspace', value: wizardData.workspaceDir },
      { label: 'Gateway Port', value: String(wizardData.port || 18789) },
      { label: 'Auth Mode', value: wizardData.authMode || 'token' },
      { label: 'Search', value: wizardData.searchProvider === 'none' ? 'Disabled' : wizardData.searchProvider },
      { label: 'Skills', value: wizardData.enabledSkills.length > 0 ? wizardData.enabledSkills.join(', ') : 'None' },
      { label: 'Hooks', value: wizardData.enabledHooks.length > 0 ? wizardData.enabledHooks.join(', ') : 'None' },
    ];
    var html = '<div class="summary-grid">';
    rows.forEach(function(row) {
      var valClass = row.value ? 'summary-value' : 'summary-value empty';
      var displayVal = row.value || 'Not set';
      html += '<div class="summary-label">' + row.label + '</div>';
      html += '<div class="' + valClass + '">' + displayVal + '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
  }
})();
</script>
</body>
</html>`;
}
