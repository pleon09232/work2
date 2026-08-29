(function () {
  const form = document.querySelector('#login-form');
  const passwordInput = document.querySelector('#password');
  const toggleButton = document.querySelector('#toggle-password');
  const errorMessage = document.querySelector('#login-error');

  if (toggleButton && passwordInput) {
    toggleButton.addEventListener('click', () => {
      const shouldShow = passwordInput.type === 'password';
      passwordInput.type = shouldShow ? 'text' : 'password';
      toggleButton.textContent = shouldShow ? 'Скрыть' : 'Показать';
      toggleButton.setAttribute('aria-label', shouldShow ? 'Скрыть пароль' : 'Показать пароль');
      toggleButton.setAttribute('aria-pressed', String(shouldShow));
      passwordInput.focus();
    });
  }

  if (!form || !passwordInput || !errorMessage) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    errorMessage.hidden = true;
    submitButton.disabled = true;
    submitButton.querySelector('span').textContent = 'Проверяем пароль…';

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput.value }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось выполнить вход.');

      const requestedPath = new URLSearchParams(window.location.search).get('next');
      const destination = requestedPath && requestedPath.startsWith('/') && !requestedPath.startsWith('//') ? requestedPath : '/';
      window.location.replace(destination);
    } catch (error) {
      errorMessage.textContent = error.message;
      errorMessage.hidden = false;
      passwordInput.select();
    } finally {
      submitButton.disabled = false;
      submitButton.querySelector('span').textContent = 'Войти в сервис';
    }
  });
})();
