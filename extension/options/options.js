'use strict';

const input = document.getElementById('license-input');
const activateBtn = document.getElementById('activate-btn');
const deactivateBtn = document.getElementById('deactivate-btn');
const message = document.getElementById('message');
const stateLine = document.getElementById('state');

function say(text, cls) {
  message.textContent = text;
  message.className = cls || '';
}

async function refreshState() {
  const state = await LicenseClient.cachedState();
  const { licensed, reason } = await LicenseClient.validate();
  if (state.licenseKey) {
    stateLine.textContent = `Key ${state.licenseKey} — ${licensed ? 'active' : 'inactive (' + reason + ')'}`;
  } else {
    stateLine.textContent = 'No license activated on this device.';
  }
}

activateBtn.addEventListener('click', async () => {
  if (!input.value.trim()) return say('Enter a license key first.', 'err');
  activateBtn.disabled = true;
  say('Activating…');
  const result = await LicenseClient.activate(input.value);
  activateBtn.disabled = false;
  if (result.ok) {
    say('✓ Activated. Thank you for supporting the project!', 'ok');
    input.value = '';
  } else {
    say(`Activation failed: ${result.error}`, 'err');
  }
  refreshState();
});

deactivateBtn.addEventListener('click', async () => {
  deactivateBtn.disabled = true;
  await LicenseClient.deactivate();
  deactivateBtn.disabled = false;
  say('This device has been deactivated and the slot freed.', 'ok');
  refreshState();
});

refreshState();
