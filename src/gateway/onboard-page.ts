/**
 * Self-contained onboard wizard HTML page.
 * Returns the complete HTML string for the AJAX-based setup wizard.
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
  max-width: 560px;
  overflow: hidden;
}

.wizard-header {
  background: linear-gradient(135deg, var(--primary), var(--accent));
  padding: 32px 32px 24px;
  text-align: center;
  color: #fff;
}

.wizard-header .logo {
  width: 56px;
  height: 56px;
  margin: 0 auto 12px;
  background: rgba(255,255,255,.15);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
}

.wizard-header h1 {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 4px;
}

.wizard-header p {
  font-size: 14px;
  opacity: .85;
}

.wizard-body { padding: 28px 32px 32px; }

/* Steps */
.step { display: none; }
.step.active { display: block; animation: fadeIn .3s ease; }

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.step h2 {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 4px;
}

.step .description {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 20px;
}

/* Progress bar */
.progress-bar {
  display: flex;
  gap: 6px;
  margin-bottom: 24px;
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
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 6px;
}

.form-group label .hint {
  font-weight: 400;
  color: var(--text-muted);
  font-size: 12px;
}

input[type="text"],
input[type="password"],
input[type="number"],
select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  color: var(--text);
  background: var(--surface);
  transition: border-color .2s, box-shadow .2s;
  outline: none;
}

input:focus, select:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px rgba(79,70,229,.12);
}

input::placeholder { color: var(--text-muted); }

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
  padding: 12px;
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
  font-size: 14px;
  font-weight: 500;
}

.radio-option .radio-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 20px;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background .2s, transform .1s, opacity .2s;
  text-decoration: none;
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
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}

.btn-row .btn-secondary { margin-right: auto; }

/* Spinner */
.spinner {
  width: 16px;
  height: 16px;
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
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  margin-top: 12px;
  display: none;
}

.msg.visible { display: flex; align-items: center; gap: 8px; animation: fadeIn .2s ease; }
.msg.error { background: var(--error-bg); color: var(--error); border: 1px solid #FECACA; }
.msg.success { background: var(--success-bg); color: var(--success); border: 1px solid #A7F3D0; }
.msg.info { background: #EFF6FF; color: #2563EB; border: 1px solid #BFDBFE; }

/* Configured overlay */
.configured-panel {
  text-align: center;
  padding: 16px 0;
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
  font-size: 13px;
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  display: none;
}

.test-result.visible { display: flex; }
.test-result.success { background: var(--success-bg); color: var(--success); }
.test-result.error { background: var(--error-bg); color: var(--error); }

.test-btn {
  margin-top: 8px;
  padding: 6px 12px;
  font-size: 12px;
}

/* Completion step */
.completion-panel {
  text-align: center;
  padding: 16px 0;
}

.completion-panel .icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--accent));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  font-size: 32px;
  box-shadow: var(--shadow-md);
}

.completion-panel h2 { margin-bottom: 8px; }
.completion-panel p { color: var(--text-secondary); font-size: 14px; margin-bottom: 20px; }

.dashboard-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--primary);
  font-weight: 500;
  font-size: 14px;
  text-decoration: none;
}

.dashboard-link:hover { text-decoration: underline; }

/* Responsive */
@media (max-width: 600px) {
  body { padding: 12px; }
  .wizard-header { padding: 24px 20px 20px; }
  .wizard-body { padding: 20px; }
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
      <p class="description">Let's get your gateway configured. This wizard will guide you through setting up an AI provider and network preferences.</p>
      <div class="btn-row">
        <div></div>
        <button class="btn btn-primary" id="btnStart">
          <span class="btn-text">Get Started</span>
          <span class="spinner"></span>
        </button>
      </div>
    </div>

    <!-- Step 2: AI Provider -->
    <div class="step" id="step-provider">
      <h2>AI Provider</h2>
      <p class="description">Choose your primary AI provider and enter your API key.</p>
      <div class="form-group">
        <label>Provider</label>
        <div class="radio-group" id="providerGroup">
          <label class="radio-option selected" data-provider="openai">
            <input type="radio" name="provider" value="openai" checked>
            <span class="radio-dot"></span>
            <span class="radio-label">OpenAI</span>
          </label>
          <label class="radio-option" data-provider="anthropic">
            <input type="radio" name="provider" value="anthropic">
            <span class="radio-dot"></span>
            <span class="radio-label">Anthropic</span>
          </label>
          <label class="radio-option" data-provider="google">
            <input type="radio" name="provider" value="google">
            <span class="radio-dot"></span>
            <span class="radio-label">Google AI</span>
          </label>
          <label class="radio-option" data-provider="custom">
            <input type="radio" name="provider" value="custom">
            <span class="radio-dot"></span>
            <span class="radio-label">Custom / OpenAI-Compatible</span>
          </label>
        </div>
      </div>
      <div class="form-group" id="customBaseGroup" style="display:none;">
        <label>Base URL</label>
        <input type="text" id="customBaseUrl" placeholder="https://api.example.com/v1">
      </div>
      <div class="form-group" id="customModelGroup" style="display:none;">
        <label>Model Name</label>
        <input type="text" id="customModel" placeholder="gpt-4o-mini">
      </div>
      <div class="form-group">
        <label>API Key</label>
        <input type="password" id="apiKey" placeholder="sk-..." autocomplete="off">
      </div>
      <div style="display:flex; gap:8px; align-items:center; margin-top:-8px; margin-bottom:16px;">
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

    <!-- Step 3: Gateway Settings -->
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
        <label>Gateway Token</label>
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

    <!-- Step 4: Advanced (optional) -->
    <div class="step" id="step-advanced">
      <h2>Advanced Settings</h2>
      <p class="description">Optional configuration. You can skip this step.</p>
      <div class="form-group">
        <label>Workspace Directory <span class="hint">(optional)</span></label>
        <input type="text" id="workspaceDir" placeholder="Default workspace location">
      </div>
      <div class="form-group">
        <label>Custom Environment Variables <span class="hint">(optional, JSON)</span></label>
        <input type="text" id="customEnv" placeholder='{"MY_VAR": "value"}'>
      </div>
      <div class="msg" id="advancedError"></div>
      <div class="btn-row">
        <button class="btn btn-secondary" id="btnAdvancedBack"><span class="btn-text">Back</span></button>
        <button class="btn btn-primary" id="btnAdvancedNext">
          <span class="btn-text">Complete Setup</span>
          <span class="spinner"></span>
        </button>
      </div>
    </div>

    <!-- Step 5: Complete -->
    <div class="step" id="step-complete">
      <div class="completion-panel">
        <div class="icon">\u2713</div>
        <h2>Setup Complete!</h2>
        <p>Your StableClaw gateway is configured and ready. The gateway will reload with your new settings.</p>
        <a href="/" class="dashboard-link">Go to Dashboard \u2192</a>
      </div>
    </div>
  </div>
</div>

<script>
(function() {
  'use strict';
  var currentStep = -1;
  var totalSteps = 5;
  var wizardData = {};

  function $(id) { return document.getElementById(id); }

  function showStep(idx) {
    var steps = document.querySelectorAll('.step');
    for (var i = 0; i < steps.length; i++) { steps[i].classList.remove('active'); }
    steps[idx].classList.add('active');
    updateProgress(idx);
    currentStep = idx;
  }

  function updateProgress(idx) {
    var dots = document.querySelectorAll('.progress-bar .dot');
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.remove('completed', 'current');
      if (i < idx) dots[i].classList.add('completed');
      else if (i === idx) dots[i].classList.add('current');
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

  function generateToken() {
    var arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    return Array.from(arr, function(b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  function radioGroupClick(e) {
    var option = e.target.closest('.radio-option');
    if (!option) return;
    var group = option.parentElement;
    var opts = group.querySelectorAll('.radio-option');
    for (var i = 0; i < opts.length; i++) opts[i].classList.remove('selected');
    option.classList.add('selected');
    option.querySelector('input[type="radio"]').checked = true;

    var provider = getProvider();
    var isCustom = provider === 'custom';
    $('customBaseGroup').style.display = isCustom ? 'block' : 'none';
    $('customModelGroup').style.display = isCustom ? 'block' : 'none';
  }

  $('providerGroup').addEventListener('click', radioGroupClick);

  $('authMode').addEventListener('change', function() {
    var mode = this.value;
    $('tokenGroup').style.display = mode === 'token' ? 'block' : 'none';
    $('passwordGroup').style.display = mode === 'password' ? 'block' : 'none';
  });

  // Check status on load
  fetch('/api/onboard/status')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.configured) {
        showStep(0);
        updateProgress(totalSteps);
      } else {
        showStep(1);
      }
    })
    .catch(function() {
      showStep(1);
    });

  // Reconfigure button
  $('btnReconfigure').addEventListener('click', function() {
    showStep(1);
  });

  // Step 1: Welcome -> Step 2: Provider
  $('btnStart').addEventListener('click', function() {
    showStep(2);
  });

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

  // Step 2: Provider -> Step 3: Gateway
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
      showStep(3);
    })
    .catch(function(err) {
      setLoading(btn, false);
      showMsg($('providerError'), err.message || 'Failed to save provider config.', 'error');
    });
  });

  $('btnProviderBack').addEventListener('click', function() { showStep(1); });

  // Step 3: Gateway -> Step 4: Advanced
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
      showStep(4);
    })
    .catch(function(err) {
      setLoading(btn, false);
      showMsg($('gatewayError'), err.message || 'Failed to save gateway config.', 'error');
    });
  });

  $('btnGatewayBack').addEventListener('click', function() { showStep(2); });

  // Step 4: Advanced -> Complete
  $('btnAdvancedNext').addEventListener('click', function() {
    var btn = this;
    hideMsg($('advancedError'));

    wizardData.workspaceDir = $('workspaceDir').value.trim();
    wizardData.customEnv = $('customEnv').value.trim();

    setLoading(btn, true);
    fetch('/api/onboard/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceDir: wizardData.workspaceDir, customEnv: wizardData.customEnv })
    })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Completion failed'); });
      return r.json();
    })
    .then(function() {
      setLoading(btn, false);
      showStep(5);
      updateProgress(totalSteps);
    })
    .catch(function(err) {
      setLoading(btn, false);
      showMsg($('advancedError'), err.message || 'Setup failed.', 'error');
    });
  });

  $('btnAdvancedBack').addEventListener('click', function() { showStep(3); });
})();
</script>
</body>
</html>`;
}
