(function () {
  const preferenceKey = 'vitis_storage_notice_preference';
  const preferenceLifetime = 180 * 24 * 60 * 60 * 1000;

  try {
    const savedPreference = JSON.parse(localStorage.getItem(preferenceKey) || 'null');
    if (savedPreference &&
      savedPreference.choice === 'accepted' &&
      Number.isFinite(savedPreference.expiresAt) &&
      savedPreference.expiresAt > Date.now()) {
      return;
    }
  } catch (error) {
    console.error('No se pudo leer la preferencia del aviso de almacenamiento:', error);
  }

  const notice = document.createElement('aside');
  notice.className = 'storage-notice';
  notice.setAttribute('aria-label', 'Aviso de almacenamiento del navegador');

  const message = document.createElement('p');
  message.className = 'storage-notice-message';
  message.textContent =
    'Vitis & Co. usa almacenamiento técnico del navegador para recordar el carrito, ' +
    'mantener la sesión administrativa y guardar esta preferencia. No usamos cookies ' +
    'de analítica ni publicidad.';

  const actions = document.createElement('div');
  actions.className = 'storage-notice-actions';

  const policyLink = document.createElement('a');
  policyLink.className = 'storage-notice-link';
  policyLink.href = '/cookies.html';
  policyLink.textContent = 'Política de Cookies';

  const acceptButton = document.createElement('button');
  acceptButton.className = 'storage-notice-button';
  acceptButton.type = 'button';
  acceptButton.textContent = 'Aceptar y cerrar';

  const status = document.createElement('p');
  status.className = 'storage-notice-status';
  status.setAttribute('aria-live', 'polite');

  actions.append(policyLink, acceptButton);
  notice.append(message, actions, status);
  document.body.appendChild(notice);

  acceptButton.addEventListener('click', function () {
    const acceptedAt = Date.now();
    try {
      localStorage.setItem(preferenceKey, JSON.stringify({
        choice: 'accepted',
        expiresAt: acceptedAt + preferenceLifetime
      }));
      notice.remove();
    } catch (error) {
      console.error('No se pudo guardar la preferencia del aviso de almacenamiento:', error);
      status.textContent =
        'No se pudo guardar esta preferencia; el aviso volverá a aparecer en tu próxima visita.';
      window.setTimeout(function () {
        notice.remove();
      }, 5000);
    }
  });
})();
